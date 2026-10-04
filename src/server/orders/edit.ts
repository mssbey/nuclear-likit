// Panelden sipariş düzenleme: adresler, notlar, kalemler + yeniden hesaplama,
// e-posta yeniden gönderme.
//
// Kalem düzenlemesi yalnız kargolanmamış siparişlerde (ödeme-bekliyor, ödendi,
// hazırlanıyor). Toplamlar `computeTotals` ile yeniden hesaplanır — aynı saf
// fonksiyon checkout'ta da kullanılır, iki yol farklı sonuç veremez. Stok
// farkı hareket günlüğüne yazılır.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { addressInputSchema, type AddressSnapshot } from '../customers/address-schema';
import { maskTckn } from '@/lib/validators/tckn';
import { computeTotals, type PricedLine } from './totals';
import { getStoreSettings } from '../settings';
import { jsonRecord } from '../catalog/mapping';
import { orderEmailVars, queueEmail, type EmailTemplateKey } from '../notifications/email';
import { revalidateCatalog } from '../catalog/queries';

export class OrderEditError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
    public readonly issues: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'OrderEditError';
  }
}

const EDITABLE = new Set(['ödeme-bekliyor', 'ödendi', 'hazırlanıyor']);

// ------------------------------------------------------------ adres / not ---

export const updateOrderSchema = z.object({
  shippingAddress: addressInputSchema.optional(),
  billingAddress: addressInputSchema.optional(),
  adminNote: z.string().trim().max(2000).optional(),
  /** Müşteriye görünen not — OrderEvent olarak eklenir, e-posta gitmez. */
  customerVisibleNote: z.string().trim().min(1).max(1000).optional(),
});

export async function updateOrderMeta(orderId: string, raw: unknown, user: AdminUser, ip: string | null) {
  const parsed = updateOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: Record<string, string> = {};
    for (const i of parsed.error.issues) issues[i.path.join('.')] ||= i.message;
    throw new OrderEditError('Formda hatalı alanlar var.', 422, issues);
  }
  const input = parsed.data;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderEditError('Sipariş bulunamadı.', 404);

  const data: Prisma.OrderUpdateInput = { version: { increment: 1 } };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (input.shippingAddress) {
    const { identityNumber, ...rest } = input.shippingAddress;
    const snap: AddressSnapshot = { ...rest, identityNumberMasked: identityNumber ? maskTckn(identityNumber) : (order.shippingAddress as AddressSnapshot).identityNumberMasked ?? '' };
    data.shippingAddress = snap as unknown as Prisma.InputJsonValue;
    before.shippingAddress = order.shippingAddress;
    after.shippingAddress = snap;
  }
  if (input.billingAddress) {
    const { identityNumber, ...rest } = input.billingAddress;
    const snap: AddressSnapshot = { ...rest, identityNumberMasked: identityNumber ? maskTckn(identityNumber) : (order.billingAddress as AddressSnapshot).identityNumberMasked ?? '' };
    data.billingAddress = snap as unknown as Prisma.InputJsonValue;
    before.billingAddress = order.billingAddress;
    after.billingAddress = snap;
  }
  if (input.adminNote !== undefined) {
    data.adminNote = input.adminNote || null;
    before.adminNote = order.adminNote;
    after.adminNote = input.adminNote || null;
  }

  const updated = await db.order.update({ where: { id: orderId }, data });

  if (input.customerVisibleNote) {
    await db.orderEvent.create({
      data: { orderId, kind: 'not', message: input.customerVisibleNote, userId: user.id, visibleToCustomer: true },
    });
  }
  if (input.shippingAddress || input.billingAddress) {
    await db.orderEvent.create({
      data: { orderId, kind: 'sistem', message: 'Adres bilgisi panelden güncellendi', userId: user.id, visibleToCustomer: false },
    });
  }

  if (Object.keys(after).length) {
    await auditChange({ user, action: 'guncelle', entityType: 'Order', entityId: orderId, before, after, ip });
  }
  return updated;
}

// ------------------------------------------------------------- kalemler ----

export const updateItemsSchema = z.object({
  items: z
    .array(
      z.object({
        /** Mevcut kalem kimliği; yeni kalemde boş. */
        id: z.string().optional(),
        variantId: z.string().min(1),
        quantity: z.number().int().min(0).max(999),
        /** Kalem indirimi, kuruş. */
        discountMinor: z.number().int().min(0).default(0),
        /** Birim fiyat override (kuruş). Verilmezse mevcut/DB fiyatı. */
        unitPriceMinor: z.number().int().min(0).optional(),
      }),
    )
    .min(1, 'En az bir kalem gerekli'),
  shippingTotalMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(300).default(''),
});

/**
 * Kalemleri günceller ve toplamları yeniden hesaplar.
 * adet 0 = kalemi sil. Stok farkı: artış → stoktan düş, azalış/silme → stoka ver.
 */
export async function updateOrderItems(orderId: string, raw: unknown, user: AdminUser, ip: string | null) {
  const input = updateItemsSchema.parse(raw);
  const settings = await getStoreSettings();

  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new OrderEditError('Sipariş bulunamadı.', 404);
  if (!EDITABLE.has(order.status)) {
    throw new OrderEditError('Kargolanmış veya kapanmış siparişin kalemleri düzenlenemez.', 409);
  }

  const variantIds = [...new Set(input.items.map((i) => i.variantId))];
  const variants = await db.variant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1 }, options: { include: { values: true } }, taxRate: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const priced: PricedLine[] = [];
  const stockDelta = new Map<string, number>(); // variantId → +/- (pozitif = stoktan düş)
  const existingByVariant = new Map(order.items.map((i) => [i.variantId ?? '', i]));

  for (const req of input.items) {
    const v = byId.get(req.variantId);
    if (!v) throw new OrderEditError('Varyant bulunamadı.');
    const existing = existingByVariant.get(v.id);
    const oldQty = existing?.quantity ?? 0;
    stockDelta.set(v.id, (stockDelta.get(v.id) ?? 0) + (req.quantity - oldQty));
    if (req.quantity === 0) continue;

    const label = [...v.product.options]
      .sort((a, b) => a.position - b.position)
      .map((o) => o.values.find((val) => val.localId === jsonRecord(v.optionValues)[o.localId])?.label)
      .filter(Boolean)
      .join(' · ');

    priced.push({
      productId: v.productId,
      variantId: v.id,
      name: v.product.name,
      variantLabel: existing?.variantLabel ?? label,
      sku: v.sku,
      imageUrl: existing?.imageUrl ?? v.image ?? v.product.images[0]?.src ?? '',
      unitPriceMinor: req.unitPriceMinor ?? existing?.unitPriceMinor ?? v.priceMinor,
      quantity: req.quantity,
      taxRateBps: existing?.taxRateBps ?? v.product.taxRate?.rateBps ?? settings.defaultTaxRateBps,
    });
  }
  // Listede olmayan mevcut kalemler silinmiş sayılır → stoka ver.
  for (const it of order.items) {
    if (it.variantId && !input.items.some((r) => r.variantId === it.variantId)) {
      stockDelta.set(it.variantId, (stockDelta.get(it.variantId) ?? 0) - it.quantity);
    }
  }
  if (priced.length === 0) throw new OrderEditError('Sipariş en az bir kalem içermeli.');

  // Kalem indirimleri kupon yerine "manuel indirim" olarak dağıtılır.
  const manualDiscounts = input.items.filter((i) => i.quantity > 0).map((i) => i.discountMinor);
  const sm = (order.shippingMethod ?? {}) as { name?: string; carrier?: string | null; estimatedDays?: string; type?: string };
  const shippingMinor = input.shippingTotalMinor ?? order.shippingTotalMinor;

  const totals = computeTotals({
    lines: priced,
    coupon: manualDiscounts.some((d) => d > 0)
      ? { ok: true, code: order.couponCode ?? 'MANUEL', type: 'tutar', discountMinor: manualDiscounts.reduce((a, b) => a + b, 0), perLineMinor: manualDiscounts, freeShipping: false }
      : null,
    shipping: { methodId: 'mevcut', zoneId: '', name: sm.name ?? '', type: (sm.type as 'sabit') ?? 'sabit', carrier: sm.carrier ?? null, estimatedDays: sm.estimatedDays ?? '', priceMinor: shippingMinor, freeReason: null },
    pricesIncludeTax: settings.pricesIncludeTax,
    shippingTaxRateBps: settings.shippingTaxRateBps,
    surchargeMinor: order.surchargeMinor,
  });

  const stockCommitted = order.status !== 'ödeme-bekliyor';

  await db.$transaction(async (tx) => {
    // Stok farkları
    for (const [variantId, delta] of stockDelta) {
      if (delta === 0) continue;
      const tracked = await tx.variant.findUnique({ where: { id: variantId }, select: { trackStock: true } });
      if (tracked && !tracked.trackStock) continue; // stok takibi kapalı: adet tutulmuyor
      if (delta > 0) {
        const r = await tx.variant.updateMany({ where: { id: variantId, stock: { gte: delta } }, data: { stock: { decrement: delta }, version: { increment: 1 } } });
        if (r.count === 0) {
          const v = byId.get(variantId);
          throw new OrderEditError(`${v?.product.name ?? 'Ürün'} için yeterli stok yok.`, 409);
        }
      } else {
        await tx.variant.update({ where: { id: variantId }, data: { stock: { increment: -delta }, version: { increment: 1 } } });
      }
      const v = await tx.variant.findUnique({ where: { id: variantId }, select: { stock: true } });
      await tx.stockMovement.create({
        data: { variantId, delta: -delta, reason: 'manuel', orderId: order.id, createdByUserId: user.id, note: `Sipariş düzenleme${input.note ? `: ${input.note}` : ''}`, stockAfter: v?.stock ?? 0 },
      });
      // Ödenmemiş siparişte rezervasyon kaydını da güncel tut.
      if (!stockCommitted) {
        const res = await tx.stockReservation.findFirst({ where: { orderId: order.id, variantId, releasedAt: null } });
        if (res) {
          const q = res.quantity + delta;
          if (q <= 0) await tx.stockReservation.update({ where: { id: res.id }, data: { releasedAt: new Date() } });
          else await tx.stockReservation.update({ where: { id: res.id }, data: { quantity: q } });
        } else if (delta > 0) {
          await tx.stockReservation.create({ data: { orderId: order.id, variantId, quantity: delta, expiresAt: new Date(Date.now() + settings.reservationMinutes * 60_000) } });
        }
      }
    }

    // Kalemleri yeniden yaz (kimlikler korunur ki iade/sevkiyat referansları kırılmasın).
    const keep = new Set<string>();
    for (const l of totals.lines) {
      const existing = existingByVariant.get(l.variantId);
      const data = {
        productId: l.productId,
        variantId: l.variantId,
        name: l.name,
        variantLabel: l.variantLabel,
        sku: l.sku,
        imageUrl: l.imageUrl,
        unitPriceMinor: l.unitPriceMinor,
        quantity: l.quantity,
        discountMinor: l.discountMinor,
        taxRateBps: l.taxRateBps,
        taxMinor: l.taxMinor,
        lineTotalMinor: l.netLineMinor,
      };
      if (existing) {
        await tx.orderItem.update({ where: { id: existing.id }, data });
        keep.add(existing.id);
      } else {
        const created = await tx.orderItem.create({ data: { orderId: order.id, ...data } });
        keep.add(created.id);
      }
    }
    await tx.orderItem.deleteMany({ where: { orderId: order.id, id: { notIn: [...keep] } } });

    await tx.order.update({
      where: { id: order.id },
      data: {
        itemsSubtotalMinor: totals.itemsSubtotalMinor,
        discountTotalMinor: totals.discountTotalMinor,
        shippingTotalMinor: totals.shippingTotalMinor,
        taxTotalMinor: totals.taxTotalMinor,
        grandTotalMinor: totals.grandTotalMinor,
        taxBreakdown: totals.taxBreakdown as unknown as Prisma.InputJsonValue,
        shippingMethod: { ...sm, priceMinor: shippingMinor } as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    // Ödenmiş siparişte tutar değiştiyse ödeme satırını da eşitle (kısmi ödeme/fark takibi F3).
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'sistem',
        message: `Kalemler düzenlendi, toplam ${(order.grandTotalMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} → ${(totals.grandTotalMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}${input.note ? ` — ${input.note}` : ''}`,
        userId: user.id,
        visibleToCustomer: false,
      },
    });
  });

  revalidateCatalog();

  await auditChange({
    user,
    action: 'guncelle',
    entityType: 'Order',
    entityId: order.id,
    before: { grandTotalMinor: order.grandTotalMinor, items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
    after: { grandTotalMinor: totals.grandTotalMinor, items: totals.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) },
    ip,
  });

  return totals;
}

// ------------------------------------------------------------- e-posta -----

const RESENDABLE: EmailTemplateKey[] = ['siparis-alindi', 'odeme-basarili', 'kargoya-verildi', 'teslim-edildi', 'iptal'];

export async function resendOrderEmail(orderId: string, template: string, user: AdminUser) {
  if (!RESENDABLE.includes(template as EmailTemplateKey)) {
    throw new OrderEditError('Bu şablon yeniden gönderilemez.');
  }
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { customer: true, shipments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!order) throw new OrderEditError('Sipariş bulunamadı.', 404);
  const to = order.customer?.email ?? order.guestEmail;
  if (!to) throw new OrderEditError('Siparişte e-posta adresi yok.');

  const s = order.shipments[0];
  await queueEmail({
    to,
    template: template as EmailTemplateKey,
    vars: {
      ...orderEmailVars(order),
      kargoFirmasi: s?.carrier ?? '—',
      kargoTakipNo: s?.trackingNumber ?? '—',
      kargoTakipLinki: s?.trackingUrl ?? '',
    },
    orderId: order.id,
  });
  await db.orderEvent.create({
    data: { orderId, kind: 'eposta', message: `E-posta yeniden gönderildi: ${template}`, userId: user.id, visibleToCustomer: false },
  });
}
