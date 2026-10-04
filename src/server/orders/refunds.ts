// İade — tam veya kısmi, kalem seçerek.
//
// Tutar kuruş bazında tutarlıdır: kalem iadesi, o kalemin indirim SONRASI
// birim değeriyle hesaplanır ve toplamı sipariş üzerinde `refundedTotalMinor`
// olarak izlenir. Stok, iade edilen adet kadar geri gelir (istenirse).
//
// Sağlayıcıya iade (kart) F3'te `PaymentProvider.refund` ile bağlanır; bu
// sürümde mock/havale/kapıda iadeleri anında "tamamlandı" sayılır.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { restock } from '../inventory/reserve';
import { orderEmailVars, queueEmail } from '../notifications/email';
import { formatMinor } from '@/lib/money';
import { transitionOrder } from './transitions';
import { revalidateCatalog } from '../catalog/queries';
import { getProvider, acceptsWebhooks } from '../payments/registry';
import { log, maskSensitive } from '../log';
import type { Prisma as PrismaNs } from '@/generated/prisma/client';

export const refundSchema = z.object({
  items: z
    .array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) }))
    .default([]),
  /** Verilirse kalem hesabının yerine geçer (ör. kargo ücreti iadesi dahil). */
  amountMinor: z.number().int().min(1).optional(),
  reason: z.string().trim().min(2, 'İade sebebi girin').max(300),
  restock: z.boolean().default(true),
  /** Kargo ücretini de iade et. */
  includeShipping: z.boolean().default(false),
});
export type RefundInput = z.infer<typeof refundSchema>;

export class RefundError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'RefundError';
  }
}

export async function createRefund(orderId: string, raw: unknown, user: AdminUser, ip: string | null) {
  const input = refundSchema.parse(raw);

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, payments: { orderBy: { createdAt: 'desc' } }, customer: true },
  });
  if (!order) throw new RefundError('Sipariş bulunamadı.', 404);
  if (order.status === 'iptal' || order.status === 'ödeme-bekliyor' || order.status === 'başarısız') {
    throw new RefundError('Ödenmemiş veya iptal edilmiş siparişte iade yapılamaz; iptal kullanın.', 409);
  }

  // Kalem bazlı tutar: indirim sonrası satır tutarı / adet, kuruş kaybı olmadan.
  const perItem: { orderItemId: string; quantity: number; amountMinor: number }[] = [];
  let itemsAmount = 0;
  for (const req of input.items) {
    const item = order.items.find((i) => i.id === req.orderItemId);
    if (!item) throw new RefundError('İade edilecek kalem bulunamadı.');
    const remaining = item.quantity - item.refundedQuantity;
    if (req.quantity > remaining) {
      throw new RefundError(`${item.name}: en fazla ${remaining} adet iade edilebilir.`);
    }
    const perUnit = Math.round(item.lineTotalMinor / item.quantity);
    // Son adet iade ediliyorsa kalan kuruş farkını kapat.
    const amount = req.quantity === remaining
      ? item.lineTotalMinor - Math.round((item.lineTotalMinor / item.quantity) * item.refundedQuantity)
      : perUnit * req.quantity;
    perItem.push({ orderItemId: item.id, quantity: req.quantity, amountMinor: amount });
    itemsAmount += amount;
  }

  const shippingPart = input.includeShipping ? order.shippingTotalMinor : 0;
  let amount = input.amountMinor ?? itemsAmount + shippingPart;

  const paid = order.payments.filter((p) => p.status === 'başarılı').reduce((s, p) => s + p.amountMinor, 0);
  const refundable = Math.max(0, (paid || order.grandTotalMinor) - order.refundedTotalMinor);
  if (amount <= 0) throw new RefundError('İade tutarı sıfırdan büyük olmalı.');
  if (amount > refundable) {
    throw new RefundError(`İade tutarı iade edilebilir tutarı aşıyor (${formatMinor(refundable)}).`);
  }
  amount = Math.round(amount);

  const allItemsRefunded = order.items.every((i) => {
    const req = perItem.find((p) => p.orderItemId === i.id);
    return i.refundedQuantity + (req?.quantity ?? 0) >= i.quantity;
  });
  const isFull = amount >= refundable && (perItem.length === 0 || allItemsRefunded);

  // Sağlayıcıya iade (kart): transaction'dan ÖNCE — sağlayıcı reddederse hiçbir şey yazılmaz.
  const successfulPayment = order.payments.find((p) => p.status === 'başarılı');
  let providerRefundId: string | null = null;
  let refundStatus: 'tamamlandı' | 'bekliyor' = 'tamamlandı';
  let providerRaw: unknown = null;
  if (successfulPayment && acceptsWebhooks(successfulPayment.provider) && successfulPayment.providerPaymentId) {
    const provider = await getProvider(successfulPayment.provider);
    const r = await provider.refund(successfulPayment.providerPaymentId, amount, input.reason);
    providerRaw = maskSensitive(r.raw);
    if (!r.ok) {
      log.warn('iade', 'sağlayıcı iadeyi reddetti', { orderNumber: order.orderNumber, provider: provider.id, message: r.errorMessage });
      throw new RefundError(`Ödeme sağlayıcısı iadeyi reddetti: ${r.errorMessage ?? 'bilinmeyen hata'}`, 422);
    }
    providerRefundId = r.providerRefundId;
    refundStatus = r.pending ? 'bekliyor' : 'tamamlandı';
  }

  const refund = await db.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        orderId: order.id,
        paymentId: order.payments.find((p) => p.status === 'başarılı')?.id ?? null,
        amountMinor: amount,
        reason: input.reason,
        type: isFull ? 'tam' : 'kısmi',
        status: refundStatus,
        providerRefundId,
        items: perItem as unknown as Prisma.InputJsonValue,
        createdByUserId: user.id,
        completedAt: refundStatus === 'tamamlandı' ? new Date() : null,
        errorMessage: providerRaw ? JSON.stringify(providerRaw as PrismaNs.InputJsonValue).slice(0, 500) : null,
      },
    });

    for (const p of perItem) {
      await tx.orderItem.update({
        where: { id: p.orderItemId },
        data: { refundedQuantity: { increment: p.quantity } },
      });
    }

    const newRefunded = order.refundedTotalMinor + amount;
    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedTotalMinor: newRefunded,
        paymentStatus: newRefunded >= (paid || order.grandTotalMinor) ? 'iade-edildi' : 'kısmi-iade',
        version: { increment: 1 },
      },
    });

    if (input.restock && perItem.length) {
      await restock(
        tx,
        order.id,
        perItem.map((p) => ({
          variantId: order.items.find((i) => i.id === p.orderItemId)?.variantId ?? null,
          quantity: p.quantity,
        })),
        'iade',
        user.id,
        `İade: ${input.reason}`,
      );
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'iade',
        message: `${isFull ? 'Tam' : 'Kısmi'} iade: ${formatMinor(amount)}${perItem.length ? ` (${perItem.reduce((s, p) => s + p.quantity, 0)} adet)` : ''} — ${input.reason}`,
        userId: user.id,
        visibleToCustomer: true,
      },
    });

    return created;
  });

  if (input.restock) revalidateCatalog();

  // Tüm sipariş iade edildiyse ve teslim edilmişse durum makinesi "iade-edildi"ye taşınır.
  // Teslim edilmemiş (ödendi/hazırlanıyor) tam iade = iptal.
  if (isFull) {
    if (order.status === 'teslim-edildi' || order.status === 'tamamlandı' || order.status === 'iade-talebi') {
      // iade-talebi ara adımı gerekiyorsa geç.
      if (order.status !== 'iade-talebi') {
        await transitionOrder(order.id, 'iade-talebi', { userId: user.id }, { note: 'Panelden tam iade', skipEmail: true });
      }
      // Stok zaten yukarıda (restock) verildi; geçişin releaseStock'u açık rezervasyon bulamaz.
      await transitionOrder(order.id, 'iade-edildi', { userId: user.id }, { note: 'İade tamamlandı', skipEmail: true });
    } else if (order.status === 'ödendi' || order.status === 'hazırlanıyor') {
      // refundedQuantity güncellendiği için iptal geçişi kalan (0) adedi yeniden stoklamaz.
      await transitionOrder(order.id, 'iptal', { userId: user.id }, { note: 'Tam iade ile iptal', skipEmail: true });
    }
  }

  const to = order.customer?.email ?? order.guestEmail;
  if (to) {
    await queueEmail({
      to,
      template: 'iade-tamamlandi',
      vars: { ...orderEmailVars(order), iadeTutari: formatMinor(amount) },
      orderId: order.id,
    });
  }

  await auditChange({
    user,
    action: 'iade',
    entityType: 'Order',
    entityId: order.id,
    before: { refundedTotalMinor: order.refundedTotalMinor },
    after: { refundedTotalMinor: order.refundedTotalMinor + amount, refundId: refund.id, items: perItem },
    ip,
  });

  return refund;
}
