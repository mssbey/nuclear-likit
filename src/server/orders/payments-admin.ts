// Panelden ödeme alma — havale eşleştirme, kapıda tahsilat, manuel kayıt.
//
// Ödeme kaydı (Payment) + sipariş durumu tek yerden güncellenir. Durum
// geçişi `transitionOrder` üzerinden gider ki stok kesinleşmesi ve e-posta
// yan etkileri her yolda aynı olsun.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { transitionOrder } from './transitions';

export const recordPaymentSchema = z.object({
  amountMinor: z.number().int().min(1),
  /** havale | kapida | nakit | pos | diger */
  method: z.enum(['havale', 'kapida', 'nakit', 'pos', 'diger']).default('havale'),
  reference: z.string().trim().max(120).default(''),
  note: z.string().trim().max(500).default(''),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export class PaymentAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'PaymentAdminError';
  }
}

export async function recordManualPayment(
  orderId: string,
  raw: unknown,
  user: AdminUser,
  ip: string | null,
) {
  const input = recordPaymentSchema.parse(raw);

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) throw new PaymentAdminError('Sipariş bulunamadı.', 404);
  if (order.paymentStatus === 'ödendi') {
    throw new PaymentAdminError('Bu siparişin ödemesi zaten alınmış.', 409);
  }
  if (order.status === 'iptal' || order.status === 'iade-edildi') {
    throw new PaymentAdminError('İptal/iade edilmiş siparişe ödeme kaydedilemez.', 409);
  }

  const paidSoFar = order.payments
    .filter((p) => p.status === 'başarılı')
    .reduce((s, p) => s + p.amountMinor, 0);
  const remaining = order.grandTotalMinor - paidSoFar;
  if (input.amountMinor > remaining) {
    throw new PaymentAdminError(
      `Tutar kalan borcu aşıyor (kalan ${(remaining / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}).`,
    );
  }

  // Bekleyen ilk ödeme satırı varsa onu kapat; yoksa yeni satır.
  const pending = order.payments.find((p) => p.status === 'bekliyor' || p.status === 'başlatıldı');
  const now = new Date();
  const data = {
    provider: input.method,
    providerPaymentId: input.reference || null,
    status: 'başarılı',
    amountMinor: input.amountMinor,
    capturedAt: now,
    rawResponse: { manual: true, by: user.email, note: input.note } as Prisma.InputJsonValue,
  };
  const payment = pending
    ? await db.payment.update({ where: { id: pending.id }, data })
    : await db.payment.create({ data: { orderId: order.id, installment: 1, threeDS: false, ...data } });

  const fullyPaid = paidSoFar + input.amountMinor >= order.grandTotalMinor;

  if (fullyPaid && order.status === 'ödeme-bekliyor') {
    // Havale eşleşti: durum makinesi stoku kesinleştirir, "ödeme başarılı" e-postası gider.
    await transitionOrder(order.id, 'ödendi', { userId: user.id }, {
      note: `Ödeme alındı (${input.method}${input.reference ? ` · ${input.reference}` : ''})${input.note ? ` — ${input.note}` : ''}`,
      visibleToCustomer: true,
    });
  } else {
    // Kapıda ödeme tahsilatı (sipariş zaten hazırlanıyor/kargolandı) veya kısmi ödeme.
    await db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: fullyPaid ? 'ödendi' : 'kısmi',
        paidAt: fullyPaid ? now : order.paidAt,
        version: { increment: 1 },
      },
    });
    await db.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'odeme',
        message: `${fullyPaid ? 'Ödeme tamamlandı' : 'Kısmi ödeme alındı'} (${input.method}${input.reference ? ` · ${input.reference}` : ''})${input.note ? ` — ${input.note}` : ''}`,
        userId: user.id,
        visibleToCustomer: false,
      },
    });
  }

  await auditChange({
    user,
    action: 'odeme',
    entityType: 'Order',
    entityId: order.id,
    before: { paymentStatus: order.paymentStatus, paid: paidSoFar },
    after: { paymentStatus: fullyPaid ? 'ödendi' : 'kısmi', paid: paidSoFar + input.amountMinor, paymentId: payment.id },
    ip,
  });

  return payment;
}

// ------------------------------------------------ ödeme durumu (hızlı) ------

export const setPaymentStatusSchema = z.object({
  to: z.enum(['ödendi', 'bekliyor', 'başarısız']),
  note: z.string().trim().max(300).default(''),
});

/** Kart ödemeleri sağlayıcıda gerçekleşir — panelden "geri alınamaz". */
const MANUAL_PROVIDERS = new Set(['havale', 'kapida', 'nakit', 'pos', 'diger', 'mock']);

const methodForManual: Record<string, RecordPaymentInput['method']> = {
  havale: 'havale',
  kapida: 'kapida',
  kart: 'pos',
};

/**
 * Listeden tek tıkla ödeme durumu:
 *   - ödendi   → kalan tutarın tamamı için manuel ödeme kaydı (havale eşleşti,
 *                kapıda tahsil edildi). Stok/e-posta yan etkileri `recordManualPayment`.
 *   - bekliyor → yanlışlıkla "ödendi" işaretlenen manuel ödemeyi geri alır.
 *                Stok kesinleşmiş kalır; iptalde yine stoka döner.
 *   - başarısız→ bekleyen ödemeyi başarısız sayar (ödeme-bekliyor → başarısız).
 */
export async function setPaymentStatus(orderId: string, raw: unknown, user: AdminUser, ip: string | null) {
  const input = setPaymentStatusSchema.parse(raw);
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) throw new PaymentAdminError('Sipariş bulunamadı.', 404);
  if (order.paymentStatus === input.to) throw new PaymentAdminError('Ödeme durumu zaten bu.', 409);
  if (order.status === 'iptal' || order.status === 'iade-edildi') {
    throw new PaymentAdminError('İptal/iade edilmiş siparişin ödeme durumu değiştirilemez.', 409);
  }

  if (input.to === 'ödendi') {
    if (order.status === 'başarısız') {
      await transitionOrder(order.id, 'ödeme-bekliyor', { userId: user.id }, { note: 'Ödeme durumu panelden düzeltildi', skipEmail: true });
    }
    const paid = order.payments.filter((p) => p.status === 'başarılı').reduce((s, p) => s + p.amountMinor, 0);
    const remaining = order.grandTotalMinor - paid;
    if (remaining <= 0) throw new PaymentAdminError('Ödenecek tutar kalmamış.', 409);
    await recordManualPayment(
      order.id,
      { amountMinor: remaining, method: methodForManual[order.paymentMethod] ?? 'diger', note: input.note || 'Listeden ödendi olarak işaretlendi' },
      user,
      ip,
    );
    return;
  }

  if (input.to === 'başarısız') {
    if (order.status !== 'ödeme-bekliyor') {
      throw new PaymentAdminError('Yalnız ödeme bekleyen sipariş başarısız sayılabilir.', 409);
    }
    await transitionOrder(order.id, 'başarısız', { userId: user.id }, { note: input.note || 'Ödeme panelden başarısız işaretlendi', skipEmail: true });
    await auditChange({ user, action: 'odeme', entityType: 'Order', entityId: order.id, before: { paymentStatus: order.paymentStatus }, after: { paymentStatus: 'başarısız' }, ip });
    return;
  }

  // → bekliyor
  if (order.status === 'başarısız') {
    await transitionOrder(order.id, 'ödeme-bekliyor', { userId: user.id }, { note: input.note || 'Ödeme yeniden bekleniyor', skipEmail: true });
    await auditChange({ user, action: 'odeme', entityType: 'Order', entityId: order.id, before: { paymentStatus: order.paymentStatus }, after: { paymentStatus: 'bekliyor' }, ip });
    return;
  }
  if (order.refundedTotalMinor > 0) {
    throw new PaymentAdminError('İade yapılmış siparişin ödemesi geri alınamaz.', 409);
  }
  const captured = order.payments.filter((p) => p.status === 'başarılı');
  if (captured.some((p) => !MANUAL_PROVIDERS.has(p.provider))) {
    throw new PaymentAdminError('Kartla alınan ödeme panelden geri alınamaz; iade işlemini kullanın.', 409);
  }

  await db.$transaction(async (tx) => {
    if (captured.length) {
      await tx.payment.updateMany({
        where: { id: { in: captured.map((p) => p.id) } },
        data: { status: 'bekliyor', capturedAt: null },
      });
    }
    await tx.order.update({
      where: { id: order.id, version: order.version },
      data: {
        paymentStatus: 'bekliyor',
        paidAt: null,
        // "Ödendi" durumundaki sipariş ödeme beklemeye döner; hazırlanan/kargolanan
        // (kapıda ödeme) sipariş akışında kalır, yalnız tahsilat açılır.
        ...(order.status === 'ödendi' ? { status: 'ödeme-bekliyor' } : {}),
        version: { increment: 1 },
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: order.status === 'ödendi' ? 'durum-degisti' : 'odeme',
        fromStatus: order.status === 'ödendi' ? 'ödendi' : null,
        toStatus: order.status === 'ödendi' ? 'ödeme-bekliyor' : null,
        message: `Ödeme geri alındı — tekrar bekleniyor${input.note ? ` (${input.note})` : ''}`,
        userId: user.id,
        visibleToCustomer: false,
      },
    });
  });

  await auditChange({ user, action: 'odeme', entityType: 'Order', entityId: order.id, before: { paymentStatus: order.paymentStatus, status: order.status }, after: { paymentStatus: 'bekliyor' }, ip });
}
