// Webhook / callback işleme — idempotent.
//
//   1. Adaptör imzayı doğrular ve olayı normalize eder.
//   2. `WebhookEvent (provider, externalId)` benzersiz: aynı olay ikinci kez
//      gelirse işlenmez, 200 döner (sağlayıcı tekrar denemesin).
//   3. Sipariş bulunur (orderId veya Payment.providerPaymentId), Payment satırı
//      güncellenir, durum makinesi üzerinden geçiş yapılır.
//   4. İşleme hatası → processedAt boş kalır, hata kaydedilir, 500 döner
//      (sağlayıcı tekrar dener; bir sonraki denemede yeniden işlenir).

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { log, maskSensitive } from '../log';
import { transitionOrder } from '../orders/transitions';
import { revalidateCatalog } from '../catalog/queries';
import type { ProviderId, WebhookVerification } from './provider';
import { getProvider } from './registry';

export interface WebhookOutcome {
  status: number;
  body: string;
  duplicate?: boolean;
  orderId?: string | null;
}

export async function handlePaymentWebhook(providerId: ProviderId, request: Request): Promise<WebhookOutcome> {
  const provider = await getProvider(providerId);
  const rawBody = await request.text();
  const url = new URL(request.url);

  let v: WebhookVerification;
  try {
    v = await provider.verifyWebhook({ headers: request.headers, rawBody, url });
  } catch (err) {
    log.error('webhook', 'doğrulama hatası', { provider: providerId, err });
    return { status: 400, body: 'verification error' };
  }

  if (!v.ok || !v.externalId) {
    log.warn('webhook', 'imza doğrulanamadı', { provider: providerId, raw: v.raw });
    return { status: 400, body: 'invalid signature' };
  }

  // Idempotency: aynı olay daha önce işlendiyse hiçbir şey yapma.
  const existing = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: providerId, externalId: v.externalId } },
  });
  if (existing?.processedAt) {
    return { status: 200, body: v.responseBody ?? 'OK', duplicate: true };
  }

  const event =
    existing ??
    (await db.webhookEvent.create({
      data: { provider: providerId, externalId: v.externalId, payload: maskSensitive(v.raw) as Prisma.InputJsonValue },
    }));

  try {
    const orderId = await applyWebhook(providerId, v);
    await db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
    return { status: 200, body: v.responseBody ?? 'OK', orderId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: message } });
    log.error('webhook', 'işleme hatası', { provider: providerId, externalId: v.externalId, message });
    return { status: 500, body: 'processing error' };
  }
}

/** Olayı siparişe uygular; sipariş kimliğini döner. */
async function applyWebhook(providerId: ProviderId, v: WebhookVerification): Promise<string | null> {
  if (v.event === 'bilinmiyor') return null;

  // Siparişi bul: orderId → doğrudan; yoksa Payment.providerPaymentId.
  const order = v.orderId
    ? await db.order.findUnique({ where: { id: v.orderId }, include: { payments: { orderBy: { createdAt: 'desc' } } } })
    : v.providerPaymentId
      ? (await db.payment.findFirst({ where: { providerPaymentId: v.providerPaymentId }, include: { order: { include: { payments: { orderBy: { createdAt: 'desc' } } } } } }))?.order ?? null
      : null;
  if (!order) throw new Error(`Sipariş bulunamadı (orderId=${v.orderId ?? '-'}, providerPaymentId=${v.providerPaymentId ?? '-'})`);

  const payment =
    order.payments.find((p) => p.providerPaymentId && p.providerPaymentId === v.providerPaymentId) ??
    order.payments.find((p) => p.status === 'bekliyor' || p.status === 'başlatıldı') ??
    order.payments[0];

  const now = new Date();

  if (v.event === 'odeme-basarili') {
    const expectedMinor = payment?.amountMinor ?? order.grandTotalMinor;
    if (v.amountMinor != null && v.amountMinor !== expectedMinor) {
      // Tutar uyuşmazlığı: para alındı ama sipariş tutarı farklı. Ödeme kaydı yaz, ama
      // durumu ilerletme; panelde mutabakat ekranına düşer.
      log.warn('webhook', 'tutar uyuşmazlığı', { orderNumber: order.orderNumber, expected: expectedMinor, got: v.amountMinor });
    }
    const data = {
      provider: providerId,
      providerPaymentId: v.providerPaymentId ?? payment?.providerPaymentId ?? null,
      status: 'başarılı',
      amountMinor: v.amountMinor ?? payment?.amountMinor ?? order.grandTotalMinor,
      installment: v.installment ?? payment?.installment ?? 1,
      cardBrand: v.cardBrand ?? null,
      cardLast4: v.cardLast4 ?? null,
      threeDS: true,
      rawResponse: maskSensitive(v.raw) as Prisma.InputJsonValue,
      capturedAt: now,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    };
    if (payment) await db.payment.update({ where: { id: payment.id }, data });
    else await db.payment.create({ data: { orderId: order.id, ...data } });

    if (order.status === 'başarısız') {
      await transitionOrder(order.id, 'ödeme-bekliyor', { system: providerId }, { note: 'Yeniden ödeme denemesi', skipEmail: true });
    }
    if (order.status === 'ödeme-bekliyor' || order.status === 'başarısız') {
      await transitionOrder(order.id, 'ödendi', { system: providerId }, {
        note: `${providerId} ödemesi onaylandı${v.cardLast4 ? ` · ${v.cardBrand ?? ''} •••• ${v.cardLast4}` : ''}${(v.installment ?? 1) > 1 ? ` · ${v.installment} taksit` : ''}`,
        visibleToCustomer: true,
      });
    } else if (order.paymentStatus !== 'ödendi') {
      await db.order.update({ where: { id: order.id }, data: { paymentStatus: 'ödendi', paidAt: order.paidAt ?? now, version: { increment: 1 } } });
    }
    revalidateCatalog();
    return order.id;
  }

  if (v.event === 'odeme-basarisiz') {
    // Başarılı kaydın üzerine geç gelen "başarısız" bildirimi yazılmaz (sıra dışı webhook).
    if (payment && payment.status === 'başarılı') {
      log.warn('webhook', 'başarılı ödeme sonrası gelen başarısız bildirimi yoksayıldı', { orderNumber: order.orderNumber, externalId: v.externalId });
      return order.id;
    }
    if (payment) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'başarısız', failedAt: now, errorMessage: v.errorMessage ?? 'Ödeme başarısız', rawResponse: maskSensitive(v.raw) as Prisma.InputJsonValue },
      });
    }
    if (order.status === 'ödeme-bekliyor') {
      await transitionOrder(order.id, 'başarısız', { system: providerId }, { note: v.errorMessage ?? 'Ödeme başarısız', visibleToCustomer: true });
    }
    return order.id;
  }

  if (v.event === 'iade-tamamlandi' || v.event === 'iade-basarisiz') {
    const refund = await db.refund.findFirst({ where: { orderId: order.id, status: 'bekliyor' }, orderBy: { createdAt: 'desc' } });
    if (refund) {
      await db.refund.update({
        where: { id: refund.id },
        data: { status: v.event === 'iade-tamamlandi' ? 'tamamlandı' : 'başarısız', completedAt: v.event === 'iade-tamamlandi' ? now : null, errorMessage: v.errorMessage ?? null },
      });
    }
    return order.id;
  }

  return order.id;
}
