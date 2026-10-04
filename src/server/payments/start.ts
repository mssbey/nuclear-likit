// Kart ödemesi başlatma — sipariş oluşturma ve "yeniden dene" ortak yolu.
//
// Sağlayıcı seçimi registry'de (DEMO_MODE → mock). Sonuç: müşterinin
// yönlendirileceği adres. Hata olursa Payment satırına yazılır ve sipariş
// `başarısız`a düşer; müşteri teşekkür sayfasından yeniden deneyebilir.

import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { log, maskSensitive } from '../log';
import { transitionOrder } from '../orders/transitions';
import { thankYouUrl } from '../orders/access';
import type { PaymentRequest } from './provider';
import { getCardProvider } from './registry';
import type { AddressSnapshot } from '../customers/address-schema';
import { site } from '@/lib/site';

function siteBase(): string {
  return site.domain.replace(/\/$/, '');
}

export interface StartResult {
  /** Müşterinin gideceği adres (sağlayıcı sayfası veya mock). */
  url: string;
  provider: string;
}

export class PaymentStartError extends Error {
  readonly status = 409 as const;
  constructor(message: string) {
    super(message);
    this.name = 'PaymentStartError';
  }
}

export async function startCardPayment(orderId: string, opts: { installment?: number } = {}): Promise<StartResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true, payments: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) throw new PaymentStartError('Sipariş bulunamadı.');
  if (order.paymentMethod !== 'kart') throw new PaymentStartError('Bu sipariş kart ile ödenmiyor.');
  if (order.status !== 'ödeme-bekliyor' && order.status !== 'başarısız') {
    throw new PaymentStartError('Bu siparişin ödemesi zaten sonuçlanmış.');
  }
  // Başarısızdan yeniden deneme: durum makinesi ödeme-bekliyor'a alır.
  if (order.status === 'başarısız') {
    await transitionOrder(order.id, 'ödeme-bekliyor', { system: 'odeme' }, { note: 'Yeniden ödeme denemesi', skipEmail: true });
  }

  const provider = await getCardProvider();
  const ship = order.shippingAddress as AddressSnapshot;
  const bill = order.billingAddress as AddressSnapshot;
  const conversationId = `${order.orderNumber}-${randomUUID().slice(0, 8)}`;
  const base = siteBase();
  const done = thankYouUrl(order.orderNumber, order.id);
  const installment = Math.max(1, Math.round(opts.installment ?? order.payments[0]?.installment ?? 1));

  const req: PaymentRequest = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountMinor: order.grandTotalMinor,
    currency: 'TRY',
    installment,
    buyer: {
      id: order.customerId ?? order.id,
      email: order.customer?.email ?? order.guestEmail ?? '',
      firstName: ship.firstName,
      lastName: ship.lastName,
      phone: ship.phone,
      ip: order.ipAddress,
      identityNumber: null, // TCKN şifreli adres defterinde; sağlayıcıya göndermek F7 fatura akışında
    },
    billingAddress: { fullName: `${bill.firstName} ${bill.lastName}`.trim(), city: bill.city, country: 'TR', addressLine: `${bill.addressLine}, ${bill.district}`, postalCode: bill.postalCode || undefined },
    shippingAddress: { fullName: `${ship.firstName} ${ship.lastName}`.trim(), city: ship.city, country: 'TR', addressLine: `${ship.addressLine}, ${ship.district}`, postalCode: ship.postalCode || undefined },
    items: order.items.map((i) => ({ id: i.id, name: i.name, category: 'Aroma', priceMinor: Math.round(i.lineTotalMinor / i.quantity), quantity: i.quantity })),
    callbackUrl: `${base}/api/payments/${provider.id}/donus?siparis=${order.id}`,
    successUrl: `${base}${done}`,
    failureUrl: `${base}${done}&odeme=basarisiz`,
    conversationId,
  };

  const result = await provider.createPayment(req);
  const pending = order.payments.find((p) => p.status === 'bekliyor' || p.status === 'başlatıldı' || p.status === 'başarısız');

  if (result.kind === 'failed') {
    log.warn('odeme', 'kart ödemesi başlatılamadı', { orderNumber: order.orderNumber, provider: provider.id, code: result.errorCode, message: result.errorMessage });
    const data = { provider: provider.id, status: 'başarısız', failedAt: new Date(), errorCode: result.errorCode, errorMessage: result.errorMessage, rawResponse: maskSensitive(result.raw) as Prisma.InputJsonValue, installment };
    if (pending) await db.payment.update({ where: { id: pending.id }, data });
    else await db.payment.create({ data: { orderId: order.id, amountMinor: order.grandTotalMinor, threeDS: true, ...data } });
    await transitionOrder(order.id, 'başarısız', { system: provider.id }, { note: `Ödeme başlatılamadı: ${result.errorMessage}`, visibleToCustomer: true });
    return { url: done, provider: provider.id };
  }

  const data = {
    provider: provider.id,
    providerPaymentId: result.providerPaymentId,
    status: result.kind === 'redirect' ? 'başlatıldı' : 'bekliyor',
    threeDS: true,
    installment,
    rawResponse: maskSensitive({ ...(result.raw as object), conversationId }) as Prisma.InputJsonValue,
    failedAt: null,
    errorCode: null,
    errorMessage: null,
  };
  if (pending) await db.payment.update({ where: { id: pending.id }, data });
  else await db.payment.create({ data: { orderId: order.id, amountMinor: order.grandTotalMinor, ...data } });

  return { url: result.kind === 'redirect' ? result.url : done, provider: provider.id };
}
