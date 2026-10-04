// PayTR — iFrame API (hosted ödeme sayfası).
//
// Belgelenen akış:
//   1. POST https://www.paytr.com/odeme/api/get-token  (merchant_id, user_ip, merchant_oid,
//      email, payment_amount (kuruş), paytr_token, user_basket (base64 JSON), no_installment,
//      max_installment, currency, test_mode, merchant_ok_url, merchant_fail_url, …)
//      paytr_token = base64(HMAC-SHA256(merchant_key,
//        merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket +
//        no_installment + max_installment + currency + test_mode + merchant_salt))
//   2. Yanıt { status: "success", token } → müşteri https://www.paytr.com/odeme/guvenli/<token>
//   3. Bildirim (webhook) POST: merchant_oid, status, total_amount, hash, …
//      hash = base64(HMAC-SHA256(merchant_key, merchant_oid + merchant_salt + status + total_amount))
//      Yanıt gövdesi düz "OK" olmalı, yoksa PayTR tekrar dener.
//
// DOĞRULANMADI: sandbox anahtarı olmadan test edilemedi; imza ve alan adları
// PayTR belgelerine göre yazıldı. İlk canlı/test denemesinde loglarla kontrol edin.

import { createHmac } from 'node:crypto';
import type {
  CreatePaymentResult,
  PaymentProvider,
  PaymentRequest,
  PaymentStatusResult,
  RefundResult,
  WebhookVerification,
} from '../provider';

export interface PaytrConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  testMode: boolean;
}

function hmac(key: string, data: string): string {
  return createHmac('sha256', key).update(data).digest('base64');
}

export function paytrToken(cfg: PaytrConfig, fields: {
  userIp: string; merchantOid: string; email: string; paymentAmount: number; userBasket: string;
  noInstallment: number; maxInstallment: number; currency: string; testMode: number;
}): string {
  const s = `${cfg.merchantId}${fields.userIp}${fields.merchantOid}${fields.email}${fields.paymentAmount}${fields.userBasket}${fields.noInstallment}${fields.maxInstallment}${fields.currency}${fields.testMode}${cfg.merchantSalt}`;
  return hmac(cfg.merchantKey, s);
}

export function paytrCallbackHash(cfg: PaytrConfig, merchantOid: string, status: string, totalAmount: string): string {
  return hmac(cfg.merchantKey, `${merchantOid}${cfg.merchantSalt}${status}${totalAmount}`);
}

export function createPaytrProvider(cfg: PaytrConfig): PaymentProvider {
  return {
    id: 'paytr',
    label: 'PayTR',
    hosted: true,
    supportsRefund: true,
    supportsInstallments: true,

    async createPayment(req: PaymentRequest): Promise<CreatePaymentResult> {
      const basket = Buffer.from(
        JSON.stringify(req.items.map((i) => [i.name, (i.priceMinor / 100).toFixed(2), i.quantity])),
      ).toString('base64');
      // merchant_oid yalnız alfanumerik olabilir.
      const merchantOid = req.conversationId.replace(/[^a-zA-Z0-9]/g, '');
      const fields = {
        userIp: req.buyer.ip ?? '127.0.0.1',
        merchantOid,
        email: req.buyer.email,
        paymentAmount: req.amountMinor,
        userBasket: basket,
        noInstallment: req.installment > 1 ? 0 : 1,
        maxInstallment: req.installment > 1 ? req.installment : 0,
        currency: 'TL',
        testMode: cfg.testMode ? 1 : 0,
      };
      const form = new URLSearchParams({
        merchant_id: cfg.merchantId,
        user_ip: fields.userIp,
        merchant_oid: merchantOid,
        email: fields.email,
        payment_amount: String(fields.paymentAmount),
        paytr_token: paytrToken(cfg, fields),
        user_basket: basket,
        debug_on: cfg.testMode ? '1' : '0',
        no_installment: String(fields.noInstallment),
        max_installment: String(fields.maxInstallment),
        user_name: `${req.buyer.firstName} ${req.buyer.lastName}`.trim(),
        user_address: req.billingAddress.addressLine,
        user_phone: req.buyer.phone,
        merchant_ok_url: req.successUrl,
        merchant_fail_url: req.failureUrl,
        timeout_limit: '30',
        currency: 'TL',
        test_mode: String(fields.testMode),
        lang: 'tr',
      });

      const res = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form });
      const json = (await res.json().catch(() => null)) as { status?: string; token?: string; reason?: string } | null;
      if (!json || json.status !== 'success' || !json.token) {
        return { kind: 'failed', errorCode: 'PAYTR_TOKEN', errorMessage: json?.reason ?? 'PayTR token alınamadı', raw: json };
      }
      return {
        kind: 'redirect',
        url: `https://www.paytr.com/odeme/guvenli/${json.token}`,
        providerPaymentId: merchantOid,
        raw: { token: '***' },
      };
    },

    async capture(providerPaymentId, amountMinor): Promise<PaymentStatusResult> {
      return { status: 'başarılı', providerPaymentId, amountMinor, raw: { note: 'PayTR doğrudan çeker' } };
    },

    async refund(providerPaymentId, amountMinor): Promise<RefundResult> {
      // İade API: merchant_id, merchant_oid, return_amount, paytr_token = base64(HMAC(key, merchant_id+merchant_oid+return_amount+salt))
      const returnAmount = (amountMinor / 100).toFixed(2);
      const token = hmac(cfg.merchantKey, `${cfg.merchantId}${providerPaymentId}${returnAmount}${cfg.merchantSalt}`);
      const form = new URLSearchParams({ merchant_id: cfg.merchantId, merchant_oid: providerPaymentId, return_amount: returnAmount, paytr_token: token });
      const res = await fetch('https://www.paytr.com/odeme/iade', { method: 'POST', body: form });
      const json = (await res.json().catch(() => null)) as { status?: string; err_msg?: string } | null;
      return {
        ok: json?.status === 'success',
        providerRefundId: json?.status === 'success' ? providerPaymentId : null,
        pending: false,
        errorMessage: json?.err_msg ?? null,
        raw: json,
      };
    },

    async verifyWebhook({ rawBody }): Promise<WebhookVerification> {
      const p = new URLSearchParams(rawBody);
      const merchantOid = p.get('merchant_oid') ?? '';
      const status = p.get('status') ?? '';
      const totalAmount = p.get('total_amount') ?? '';
      const hash = p.get('hash') ?? '';
      const expected = paytrCallbackHash(cfg, merchantOid, status, totalAmount);
      const ok = Boolean(hash) && hash === expected;
      return {
        ok,
        externalId: `paytr:${merchantOid}:${status}`,
        orderId: null, // merchant_oid → Payment.providerPaymentId üzerinden eşlenir
        providerPaymentId: merchantOid,
        event: status === 'success' ? 'odeme-basarili' : 'odeme-basarisiz',
        amountMinor: totalAmount ? Number(totalAmount) : null,
        installment: Number(p.get('installment_count') ?? '1') || 1,
        errorMessage: p.get('failed_reason_msg'),
        responseBody: 'OK',
        raw: Object.fromEntries([...p.entries()].filter(([k]) => k !== 'hash')),
      };
    },

    async getStatus(providerPaymentId): Promise<PaymentStatusResult> {
      // Durum sorgu API'si: merchant_id, merchant_oid, paytr_token = base64(HMAC(key, merchant_id+merchant_oid+salt))
      const token = hmac(cfg.merchantKey, `${cfg.merchantId}${providerPaymentId}${cfg.merchantSalt}`);
      const form = new URLSearchParams({ merchant_id: cfg.merchantId, merchant_oid: providerPaymentId, paytr_token: token });
      const res = await fetch('https://www.paytr.com/odeme/durum-sorgu', { method: 'POST', body: form });
      const json = (await res.json().catch(() => null)) as { status?: string; payment_amount?: string } | null;
      return {
        status: json?.status === 'success' ? 'başarılı' : json?.status === 'failed' ? 'başarısız' : 'bekliyor',
        providerPaymentId,
        amountMinor: json?.payment_amount ? Number(json.payment_amount) : null,
        raw: json,
      };
    },
  };
}
