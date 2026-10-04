// Sevkiyat — kısmi gönderim, manuel takip numarası, durum güncellemesi.
//
// Oluşturma burada hâlâ tamamen manueldir: takip numarası panelden elle
// girilir. `provider.ts` + `adapters/*` (F4) taşıyıcı API'lerine bağlanmak
// içindir, ama gerçek uç nokta entegrasyonu henüz yazılmadı (bkz. o dosyaların
// başındaki not) — bu yüzden bu akış hiçbir sağlayıcıyı otomatik çağırmaz.
// Sağlayıcıdan durum çekme tek noktası `tracking.ts`'tir (panel + sync betiği).
//
// Sipariş durumu yan etkileri:
//   - tüm kalemler sevk edildi → sipariş `kargolandı` (fulfillment: gönderildi)
//   - bir kısmı → fulfillment: kısmi
//   - tüm sevkiyatlar teslim edildi → sipariş `teslim-edildi` → `tamamlandı`

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { orderEmailVars, queueEmail } from '../notifications/email';
import { transitionOrder } from '../orders/transitions';
import { CARRIERS, SHIPMENT_STATUSES, carrierLabels, trackingUrlFor, type ShipmentStatus } from './carriers';

export { CARRIERS, SHIPMENT_STATUSES, carrierLabels, trackingUrlFor } from './carriers';
export type { Carrier, ShipmentStatus } from './carriers';

export const createShipmentSchema = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().trim().max(80).default(''),
  trackingUrl: z.string().trim().url().optional().or(z.literal('')),
  /** Boş bırakılırsa sevk edilmemiş tüm kalemler. */
  items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) })).default([]),
  weightGrams: z.number().int().min(0).optional(),
  desi: z.number().int().min(0).optional(),
  costMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(300).default(''),
  /** Oluşturulunca hemen "kargoya-verildi" say (takip no girildiğinde tipik). */
  markShipped: z.boolean().default(true),
});
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export class ShipmentError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'ShipmentError';
  }
}

const SHIPPABLE_ORDER_STATUSES = new Set(['ödendi', 'hazırlanıyor', 'kargolandı']);

async function shippedQuantities(orderId: string): Promise<Map<string, number>> {
  const shipments = await db.shipment.findMany({
    where: { orderId, status: { notIn: ['iade-yolda', 'kayıp'] } },
    select: { items: true },
  });
  const map = new Map<string, number>();
  for (const s of shipments) {
    for (const it of (s.items as { orderItemId: string; quantity: number }[]) ?? []) {
      map.set(it.orderItemId, (map.get(it.orderItemId) ?? 0) + it.quantity);
    }
  }
  return map;
}

export async function createShipment(orderId: string, raw: unknown, user: AdminUser, ip: string | null) {
  const input = createShipmentSchema.parse(raw);

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true },
  });
  if (!order) throw new ShipmentError('Sipariş bulunamadı.', 404);
  if (!SHIPPABLE_ORDER_STATUSES.has(order.status)) {
    throw new ShipmentError(`“${order.status}” durumundaki sipariş kargolanamaz. Önce ödeme alın veya hazırlığa geçin.`, 409);
  }

  const already = await shippedQuantities(order.id);
  const remainingOf = (i: { id: string; quantity: number; refundedQuantity: number }) =>
    i.quantity - i.refundedQuantity - (already.get(i.id) ?? 0);

  const items =
    input.items.length > 0
      ? input.items
      : order.items.map((i) => ({ orderItemId: i.id, quantity: remainingOf(i) })).filter((x) => x.quantity > 0);

  if (items.length === 0) throw new ShipmentError('Sevk edilecek kalem kalmadı.', 409);

  for (const req of items) {
    const item = order.items.find((i) => i.id === req.orderItemId);
    if (!item) throw new ShipmentError('Kalem bulunamadı.');
    const rem = remainingOf(item);
    if (req.quantity > rem) {
      throw new ShipmentError(`${item.name}: en fazla ${rem} adet sevk edilebilir.`);
    }
  }

  const trackingUrl =
    input.trackingUrl || (input.trackingNumber ? trackingUrlFor(input.carrier, input.trackingNumber) : null);
  const now = new Date();
  const status: ShipmentStatus = input.markShipped ? 'kargoya-verildi' : 'hazırlanıyor';

  const shipment = await db.shipment.create({
    data: {
      orderId: order.id,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber || null,
      trackingUrl,
      status,
      items: items as unknown as Prisma.InputJsonValue,
      events: [{ at: now.toISOString(), code: status, description: input.note || 'Panelden oluşturuldu' }] as Prisma.InputJsonValue,
      weightGrams: input.weightGrams,
      desi: input.desi,
      costMinor: input.costMinor,
      shippedAt: input.markShipped ? now : null,
    },
  });

  // Tüm kalemler sevk edildi mi?
  const after = await shippedQuantities(order.id);
  const allShipped = order.items.every((i) => (after.get(i.id) ?? 0) >= i.quantity - i.refundedQuantity);

  if (input.markShipped) {
    if (allShipped && order.status !== 'kargolandı') {
      await transitionOrder(order.id, 'kargolandı', { userId: user.id }, {
        note: `${carrierLabels[input.carrier]}${input.trackingNumber ? ` · ${input.trackingNumber}` : ''}`,
        visibleToCustomer: true,
        skipEmail: true, // aşağıda takip numaralı e-posta gidiyor
      });
    } else {
      await db.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: allShipped ? 'gönderildi' : 'kısmi', version: { increment: 1 } },
      });
      await db.orderEvent.create({
        data: {
          orderId: order.id,
          kind: 'kargo',
          message: `Kısmi sevkiyat: ${carrierLabels[input.carrier]}${input.trackingNumber ? ` · ${input.trackingNumber}` : ''}`,
          userId: user.id,
          visibleToCustomer: true,
        },
      });
    }

    const to = order.customer?.email ?? order.guestEmail;
    if (to) {
      await queueEmail({
        to,
        template: 'kargoya-verildi',
        vars: {
          ...orderEmailVars(order),
          kargoFirmasi: carrierLabels[input.carrier],
          kargoTakipNo: input.trackingNumber || '—',
          kargoTakipLinki: trackingUrl ?? '',
        },
        orderId: order.id,
      });
    }
  }

  await auditChange({
    user,
    action: 'guncelle',
    entityType: 'Shipment',
    entityId: shipment.id,
    after: { orderId: order.id, carrier: input.carrier, trackingNumber: input.trackingNumber, items },
    ip,
  });

  return shipment;
}

export const updateShipmentSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  trackingUrl: z.string().trim().url().optional().or(z.literal('')),
  note: z.string().trim().max(300).default(''),
});

export async function updateShipment(shipmentId: string, raw: unknown, user: AdminUser, ip: string | null) {
  const input = updateShipmentSchema.parse(raw);
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { customer: true } } } });
  if (!shipment) throw new ShipmentError('Sevkiyat bulunamadı.', 404);

  const now = new Date();
  const events = [...(((shipment.events as unknown[]) ?? []) as { at: string; code: string; description: string }[])];
  if (input.status && input.status !== shipment.status) {
    events.push({ at: now.toISOString(), code: input.status, description: input.note || 'Panelden güncellendi' });
  }

  const trackingNumber = input.trackingNumber ?? shipment.trackingNumber;
  const trackingUrl =
    input.trackingUrl !== undefined
      ? input.trackingUrl || null
      : trackingNumber && !shipment.trackingUrl
        ? trackingUrlFor(shipment.carrier, trackingNumber)
        : shipment.trackingUrl;

  const updated = await db.shipment.update({
    where: { id: shipment.id },
    data: {
      status: input.status ?? shipment.status,
      trackingNumber: trackingNumber || null,
      trackingUrl,
      events: events as unknown as Prisma.InputJsonValue,
      shippedAt:
        shipment.shippedAt ?? (input.status && input.status !== 'hazırlanıyor' && input.status !== 'paketlendi' ? now : null),
      deliveredAt: input.status === 'teslim-edildi' ? now : shipment.deliveredAt,
      version: { increment: 1 },
    },
  });

  // Tüm sevkiyatlar teslim edildiyse sipariş teslim-edildi → tamamlandı.
  if (input.status === 'teslim-edildi') {
    const all = await db.shipment.findMany({ where: { orderId: shipment.orderId, status: { notIn: ['iade-yolda', 'kayıp'] } } });
    const allDelivered = all.length > 0 && all.every((s) => s.status === 'teslim-edildi');
    if (allDelivered && shipment.order.status === 'kargolandı') {
      await transitionOrder(shipment.orderId, 'teslim-edildi', { userId: user.id }, { note: 'Tüm sevkiyatlar teslim edildi', visibleToCustomer: true });
      await transitionOrder(shipment.orderId, 'tamamlandı', { userId: user.id }, { note: 'Teslimat sonrası otomatik tamamlandı', skipEmail: true });
    }
  }

  await auditChange({
    user,
    action: 'guncelle',
    entityType: 'Shipment',
    entityId: shipment.id,
    before: { status: shipment.status, trackingNumber: shipment.trackingNumber },
    after: { status: updated.status, trackingNumber: updated.trackingNumber },
    ip,
  });

  return updated;
}
