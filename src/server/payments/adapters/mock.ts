// Mock sağlayıcı — DEMO_MODE / CI tam akış testi.
//
// Gerçek sağlayıcı gibi davranır: createPayment yönlendirme URL'i döner
// (/odeme/dogrulama), "webhook" olarak /api/checkout/mock-odeme'nin ilettiği
// HMAC imzalı gövdeyi doğrular. Böylece webhook idempotency ve durum geçişi
// yolu üretimle birebir aynı koddan geçer.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CreatePaymentResult,
  PaymentProvider,
  PaymentRequest,
  PaymentStatusResult,
  RefundResult,
  WebhookVerification,
} from '../provider';

export function mockToken(orderId: string): string {
  const secret = process.env.SESSION_SECRET ?? 'demo';
  return createHmac('sha256', secret).update(`mock-odeme:${orderId}`).digest('base64url');
}

export function verifyMockToken(orderId: string, token: string): boolean {
  const a = Buffer.from(mockToken(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const mockProvider: PaymentProvider = {
  id: 'mock',
  label: 'Test sağlayıcısı (mock)',
  hosted: true,
  supportsRefund: true,
  supportsInstallments: true,

  async createPayment(req: PaymentRequest): Promise<CreatePaymentResult> {
    return {
      kind: 'redirect',
      url: `/odeme/dogrulama?siparis=${encodeURIComponent(req.orderId)}`,
      providerPaymentId: `mock_${req.conversationId}`,
      raw: { provider: 'mock', conversationId: req.conversationId, installment: req.installment },
    };
  },

  async capture(providerPaymentId, amountMinor): Promise<PaymentStatusResult> {
    return { status: 'başarılı', providerPaymentId, amountMinor, raw: { mock: true } };
  },

  async refund(providerPaymentId, amountMinor, reason): Promise<RefundResult> {
    return { ok: true, providerRefundId: `mockref_${Date.now().toString(36)}`, pending: false, raw: { providerPaymentId, amountMinor, reason } };
  },

  async verifyWebhook({ rawBody }): Promise<WebhookVerification> {
    let body: { orderId?: string; token?: string; outcome?: string; attempt?: string } = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, externalId: '', orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw: { error: 'json' } };
    }
    const ok = Boolean(body.orderId && body.token && verifyMockToken(body.orderId, body.token));
    const success = body.outcome === 'basarili';
    return {
      ok,
      // Aynı sipariş için aynı sonuç ikinci kez gelirse idempotent; yeniden deneme
      // (attempt) farklı bir olay sayılır ki başarısız→başarılı yolu çalışsın.
      externalId: `mock:${body.orderId}:${body.outcome}:${body.attempt ?? '1'}`,
      orderId: body.orderId ?? null,
      providerPaymentId: `mock_${body.orderId}`,
      event: success ? 'odeme-basarili' : 'odeme-basarisiz',
      amountMinor: null,
      cardBrand: 'TEST',
      cardLast4: '0000',
      errorMessage: success ? null : 'Test ödemesi reddedildi (kullanıcı seçimi).',
      raw: { provider: 'mock', outcome: body.outcome },
    };
  },

  async getStatus(providerPaymentId): Promise<PaymentStatusResult> {
    return { status: 'bekliyor', providerPaymentId, amountMinor: null, raw: { mock: true } };
  },
};
