// Tosla İşim (AkÖde) — Ortak Ödeme Sayfası (3D host).
//
// Akış:
//   1. POST {base}/threeDPayment  JSON { clientId, apiUser, callbackUrl, orderId,
//      amount (kuruş), currency (949), installmentCount (tek çekim 0), rnd,
//      timeSpan (yyyyMMddHHmmss, İstanbul), hash }
//      hash = base64(SHA512(apiPass + clientId + apiUser + rnd + timeSpan))
//   2. Yanıt { Code: 0, ThreeDSessionId } → müşteri {base}/threeDSecure/<ThreeDSessionId>
//      sayfasına gider; kart bilgisi yalnız Tosla'nın sayfasında girilir.
//   3. Sonuç callbackUrl'e POST edilir: OrderId, MdStatus, BankResponseCode,
//      BankResponseMessage, RequestStatus, HashParameters, Hash …
//      Hash = base64(SHA512(apiPass + HashParameters'taki alanların değerleri, ayraçsız))
//      (ClientId ve ApiUser değerleri bizim hesaptan doldurulur.)
//      Başarı: MdStatus = 1, BankResponseCode = "00", RequestStatus = 1.
//   4. Hash doğrulanamazsa (ör. başarısız 3D'de alan gelmezse) sonuç sunucudan
//      sunucuya `inquiry` ile sorgulanır — tarayıcıdan gelen veriye güvenilmez.
//
// Kaynak: Tosla İşim geliştirici merkezi ve mewebstudio/pos ToslaPos uygulaması
// (MIT). Canlı uç noktası 2026-10-14'te boş istekle doğrulandı (Code 998).

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  last4Of,
  normalizeCardBrand,
  type CreatePaymentResult,
  type PaymentProvider,
  type PaymentRequest,
  type PaymentStatus,
  type PaymentStatusResult,
  type RefundResult,
  type WebhookVerification,
} from '../provider';

export interface ToslaConfig {
  clientId: string;
  apiUser: string;
  apiPass: string;
  testMode: boolean;
}

const LIVE_BASE = 'https://entegrasyon.tosla.com/api/Payment';
const TEST_BASE = 'https://prepentegrasyon.tosla.com/api/Payment';
const CURRENCY_TRY = 949;

function sha512b64(s: string): string {
  return createHash('sha512').update(s, 'utf8').digest('base64');
}

/** yyyyMMddHHmmss — İstanbul saati (UTC+3, yaz saati yok). */
export function toslaTimeSpan(now = new Date()): string {
  const d = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function toslaRequestHash(cfg: ToslaConfig, rnd: string, timeSpan: string): string {
  return sha512b64(`${cfg.apiPass}${cfg.clientId}${cfg.apiUser}${rnd}${timeSpan}`);
}

/** Dönüş (callback) imzası: HashParameters'ta sayılan alanların değerleri sırayla. */
export function toslaCallbackHash(cfg: ToslaConfig, fields: Record<string, string>): string | null {
  const names = (fields.HashParameters ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!names.length) return null;
  const values: Record<string, string> = { ...fields, ClientId: cfg.clientId, ApiUser: cfg.apiUser };
  return sha512b64(cfg.apiPass + names.map((n) => values[n] ?? '').join(''));
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tosla orderId: harf/rakam, en fazla 20 karakter (sipariş no + kısa rastgele ek). */
export function toslaOrderId(conversationId: string): string {
  return conversationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
}

interface ToslaInquiry {
  Code?: number;
  Message?: string;
  OrderId?: string;
  BankResponseCode?: string;
  BankResponseMessage?: string;
  RequestStatus?: number;
  Amount?: number;
  RefundedAmount?: number;
  InstallmentCount?: number;
  CardNo?: string;
  TransactionId?: string | number;
}

/** RequestStatus: 0 hata, 1 tamamlandı, 2 iptal, 3 kısmi iade, 4 tam iade, 5 ön provizyon. */
function statusFromInquiry(r: ToslaInquiry | null): PaymentStatus {
  if (!r || r.Code !== 0) return 'bekliyor';
  switch (r.RequestStatus) {
    case 1:
    case 3:
      return r.BankResponseCode === '00' ? 'başarılı' : 'başarısız';
    case 2:
      return 'iptal';
    case 4:
      return 'iade-edildi';
    case 0:
      return 'başarısız';
    default:
      return 'bekliyor';
  }
}

export function createToslaProvider(cfg: ToslaConfig): PaymentProvider {
  const base = cfg.testMode ? TEST_BASE : LIVE_BASE;

  function signed(extra: Record<string, unknown>) {
    const rnd = randomBytes(12).toString('hex');
    const timeSpan = toslaTimeSpan();
    return { clientId: cfg.clientId, apiUser: cfg.apiUser, rnd, timeSpan, hash: toslaRequestHash(cfg, rnd, timeSpan), ...extra };
  }

  async function call<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed(body)),
    });
    return (await res.json().catch(() => null)) as T | null;
  }

  const inquiry = (orderId: string) => call<ToslaInquiry>('inquiry', { orderId });

  return {
    id: 'tosla',
    label: 'Tosla',
    hosted: true,
    supportsRefund: true,
    supportsInstallments: true,

    async createPayment(req: PaymentRequest): Promise<CreatePaymentResult> {
      const orderId = toslaOrderId(req.conversationId);
      const json = await call<{ Code?: number; Message?: string; ThreeDSessionId?: string | null }>('threeDPayment', {
        callbackUrl: req.callbackUrl,
        orderId,
        amount: req.amountMinor,
        currency: CURRENCY_TRY,
        installmentCount: req.installment > 1 ? req.installment : 0,
      });
      if (!json || json.Code !== 0 || !json.ThreeDSessionId) {
        return {
          kind: 'failed',
          errorCode: `TOSLA_${json?.Code ?? 'NO_RESPONSE'}`,
          errorMessage: json?.Message || 'Tosla ödeme oturumu açılamadı',
          raw: json,
        };
      }
      return {
        kind: 'redirect',
        url: `${base}/threeDSecure/${encodeURIComponent(json.ThreeDSessionId)}`,
        providerPaymentId: orderId,
        raw: { code: json.Code },
      };
    },

    async capture(providerPaymentId, amountMinor): Promise<PaymentStatusResult> {
      return { status: 'başarılı', providerPaymentId, amountMinor, raw: { note: 'Tosla 3D ödemede doğrudan çeker' } };
    },

    async refund(providerPaymentId, amountMinor): Promise<RefundResult> {
      type R = { Code?: number; Message?: string; TransactionId?: string | number };
      let json = await call<R>('refund', { orderId: providerPaymentId, amount: amountMinor });
      // Gün sonu kapanmamış işlem iade edilemez, iptal (void) edilir — yalnız tam tutarda.
      if (json?.Code !== 0) {
        const st = await inquiry(providerPaymentId);
        if (st?.Code === 0 && typeof st.Amount === 'number' && st.Amount === amountMinor) {
          const v = await call<R>('void', { orderId: providerPaymentId });
          if (v?.Code === 0) json = v;
        }
      }
      const ok = json?.Code === 0;
      return {
        ok,
        providerRefundId: ok ? String(json?.TransactionId ?? providerPaymentId) : null,
        pending: false,
        errorMessage: ok ? null : (json?.Message ?? 'Tosla iadeyi reddetti'),
        raw: json,
      };
    },

    async verifyWebhook({ rawBody }): Promise<WebhookVerification> {
      const fields: Record<string, string> = rawBody.trim().startsWith('{')
        ? Object.fromEntries(Object.entries(JSON.parse(rawBody) as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]))
        : Object.fromEntries(new URLSearchParams(rawBody).entries());
      const orderId = fields.OrderId ?? '';
      const raw = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'Hash'));

      const expected = toslaCallbackHash(cfg, fields);
      const hashOk = Boolean(expected && fields.Hash && safeEqual(fields.Hash, expected));

      let success: boolean;
      let amountMinor: number | null = null;
      let cardLast4 = last4Of(fields.CardNo ?? fields.MaskedCardNo);
      let installment = Number(fields.InstallmentCount) || 1;
      let errorMessage: string | null = fields.BankResponseMessage || fields.Message || null;

      if (hashOk) {
        success = fields.MdStatus === '1' && fields.BankResponseCode === '00' && fields.RequestStatus === '1';
      } else {
        // İmzasız/eksik dönüş: sonucu Tosla'dan sunucu tarafında sor.
        if (!orderId) return { ok: false, externalId: '', orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw };
        const st = await inquiry(orderId);
        if (!st || st.Code !== 0) {
          return { ok: false, externalId: '', orderId: null, providerPaymentId: orderId, event: 'bilinmiyor', amountMinor: null, raw: { ...raw, inquiry: st } };
        }
        success = statusFromInquiry(st) === 'başarılı';
        amountMinor = typeof st.Amount === 'number' ? st.Amount : null;
        cardLast4 = last4Of(st.CardNo) ?? cardLast4;
        installment = st.InstallmentCount || installment;
        errorMessage = st.BankResponseMessage || errorMessage;
      }

      return {
        ok: true,
        externalId: `tosla:${orderId}:${success ? 'ok' : 'fail'}`,
        orderId: null, // orderId → Payment.providerPaymentId üzerinden eşlenir
        providerPaymentId: orderId,
        event: success ? 'odeme-basarili' : 'odeme-basarisiz',
        amountMinor,
        cardBrand: normalizeCardBrand(fields.CardBrand ?? fields.CardType),
        cardLast4,
        installment: installment > 1 ? installment : 1,
        errorMessage: success ? null : errorMessage,
        raw,
      };
    },

    async getStatus(providerPaymentId): Promise<PaymentStatusResult> {
      const st = await inquiry(providerPaymentId);
      return {
        status: statusFromInquiry(st),
        providerPaymentId,
        amountMinor: typeof st?.Amount === 'number' ? st.Amount : null,
        cardLast4: last4Of(st?.CardNo),
        installment: st?.InstallmentCount || 1,
        errorMessage: st?.BankResponseMessage ?? st?.Message ?? null,
        raw: st,
      };
    },
  };
}
