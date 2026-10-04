// Ödeme sağlayıcı arayüzü.
//
// Her sağlayıcı (iyzico, PayTR, Stripe, havale, kapıda, mock) bu sözleşmeyi
// uygular; checkout, webhook ve iade akışları sağlayıcıyı bilmez. Kart verisi
// ASLA sunucuya gelmez — sağlayıcının hosted/3DS sayfasına yönlendirilir.
//
// Saf modül: yalnız tipler ve küçük yardımcılar. Adaptörler `adapters/` altında.

export const PROVIDER_IDS = ['mock', 'iyzico', 'paytr', 'stripe', 'havale', 'kapida'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const providerLabels: Record<ProviderId, string> = {
  mock: 'Test sağlayıcısı (mock)',
  iyzico: 'iyzico',
  paytr: 'PayTR',
  stripe: 'Stripe',
  havale: 'Havale / EFT',
  kapida: 'Kapıda ödeme',
};

/** Sağlayıcıya verilen sipariş özeti — sepet satırları sağlayıcı formatına adaptörde çevrilir. */
export interface PaymentRequest {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: 'TRY';
  installment: number;
  buyer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    ip: string | null;
    /** Sağlayıcı zorunlu tutarsa (iyzico) — maskeli DEĞİL, gerçek; yalnız sağlayıcıya gider, loglanmaz. */
    identityNumber?: string | null;
  };
  billingAddress: { fullName: string; city: string; country: string; addressLine: string; postalCode?: string };
  shippingAddress: { fullName: string; city: string; country: string; addressLine: string; postalCode?: string };
  items: { id: string; name: string; category: string; priceMinor: number; quantity: number }[];
  /** 3DS / hosted sayfadan dönüş adresi (sunucu tarafı callback). */
  callbackUrl: string;
  /** Müşterinin sonuçta göreceği sayfa (başarı/başarısızlık için sağlayıcı yönlendirmesi). */
  successUrl: string;
  failureUrl: string;
  /** Bu istek için sunucu tarafında üretilen benzersiz anahtar (conversationId / merchant_oid). */
  conversationId: string;
}

export type CreatePaymentResult =
  | {
      kind: 'redirect';
      /** Müşteri bu adrese yönlendirilir (3DS / hosted checkout). */
      url: string;
      providerPaymentId: string | null;
      /** Yönlendirme HTML'i gerekiyorsa (iyzico 3DS form). */
      html?: string;
      raw: unknown;
    }
  | {
      /** Yönlendirme gerekmeyen anında sonuç (havale/kapıda: bekliyor). */
      kind: 'pending';
      providerPaymentId: string | null;
      instructions?: string;
      raw: unknown;
    }
  | { kind: 'failed'; errorCode: string; errorMessage: string; raw: unknown };

export type PaymentStatus = 'başlatıldı' | 'bekliyor' | 'başarılı' | 'başarısız' | 'iptal' | 'iade-edildi';

export interface PaymentStatusResult {
  status: PaymentStatus;
  providerPaymentId: string | null;
  amountMinor: number | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  installment?: number;
  threeDS?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw: unknown;
}

export interface RefundResult {
  ok: boolean;
  providerRefundId: string | null;
  /** Sağlayıcı iadeyi asenkron işliyorsa true → status 'bekliyor', webhook kapatır. */
  pending: boolean;
  errorMessage?: string | null;
  raw: unknown;
}

/**
 * Webhook / callback doğrulama sonucu. `externalId` idempotency anahtarıdır
 * (`WebhookEvent.provider + externalId @unique`); sağlayıcı olay kimliği yoksa
 * adaptör deterministik bir kimlik üretir (ör. `${paymentId}:${status}`).
 */
export interface WebhookVerification {
  ok: boolean;
  externalId: string;
  /** Hangi siparişe ait — conversationId / merchant_oid / metadata üzerinden. */
  orderId: string | null;
  providerPaymentId: string | null;
  /** Olayın anlattığı sonuç. */
  event: 'odeme-basarili' | 'odeme-basarisiz' | 'iade-tamamlandi' | 'iade-basarisiz' | 'bilinmiyor';
  amountMinor: number | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  installment?: number;
  errorMessage?: string | null;
  /** Sağlayıcının beklediği yanıt gövdesi (PayTR "OK" ister). */
  responseBody?: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Kart bilgisi sağlayıcı sayfasında mı alınır (hosted) — her zaman true olmalı. */
  readonly hosted: boolean;
  /** Bu sağlayıcı iade API'si sunuyor mu (havale/kapıda manuel). */
  readonly supportsRefund: boolean;
  readonly supportsInstallments: boolean;

  createPayment(req: PaymentRequest): Promise<CreatePaymentResult>;
  /** Ön provizyon modelinde tahsilat; çoğu Türk sağlayıcı doğrudan çeker → no-op. */
  capture(providerPaymentId: string, amountMinor: number): Promise<PaymentStatusResult>;
  refund(providerPaymentId: string, amountMinor: number, reason: string): Promise<RefundResult>;
  /** Ham HTTP isteğini doğrular (imza) ve normalize eder. */
  verifyWebhook(input: { headers: Headers; rawBody: string; url: URL }): Promise<WebhookVerification>;
  getStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
}

/** Kart markası normalizasyonu — sağlayıcılar farklı yazıyor. */
export function normalizeCardBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('master')) return 'Mastercard';
  if (s.includes('visa')) return 'Visa';
  if (s.includes('troy')) return 'Troy';
  if (s.includes('amex') || s.includes('american')) return 'Amex';
  return raw;
}

/** Yalnız son 4 hane tutulur; PAN asla saklanmaz. */
export function last4Of(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const d = pan.replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : null;
}
