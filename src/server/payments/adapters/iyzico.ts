// iyzico — Checkout Form (hosted, PCI kapsamı dışı), resmi `iyzipay` SDK.
//
// Akış:
//   1. checkoutFormInitialize.create → paymentPageUrl (müşteri iyzico sayfasına gider, 3DS orada)
//   2. iyzico, callbackUrl'e POST { token } ile döner
//   3. checkoutForm.retrieve({ token }) → paymentStatus, paymentId, kart bilgisi, taksit
// Webhook yerine callback + retrieve modeli; iyzico ayrıca bildirim webhook'u da
// gönderebilir (aynı doğrulama: token ile retrieve).
//
// DOĞRULANMADI: sandbox anahtarı olmadan çalıştırılmadı. Alan adları iyzipay
// SDK'sının Node örneklerine göre; ilk denemede loglarla doğrulayın.
// Kimlik: iyzico alıcı için identityNumber ister; yoksa "11111111111" gönderilir.

import Iyzipay from 'iyzipay';
import type {
  CreatePaymentResult,
  PaymentProvider,
  PaymentRequest,
  PaymentStatusResult,
  RefundResult,
  WebhookVerification,
} from '../provider';
import { normalizeCardBrand } from '../provider';

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  /** test: https://sandbox-api.iyzipay.com — live: https://api.iyzipay.com */
  baseUrl: string;
}

// SDK callback tabanlı; promise sarmalayıcı.
function call<T>(fn: (cb: (err: unknown, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn((err, result) => (err ? reject(err) : resolve(result))));
}

const money = (minor: number) => (minor / 100).toFixed(2);

export function createIyzicoProvider(cfg: IyzicoConfig): PaymentProvider {
  const client = new Iyzipay({ apiKey: cfg.apiKey, secretKey: cfg.secretKey, uri: cfg.baseUrl });

  async function retrieve(token: string) {
    return call<Record<string, unknown>>((cb) =>
      client.checkoutForm.retrieve({ locale: 'tr', token }, cb),
    );
  }

  function normalizeResult(r: Record<string, unknown>): PaymentStatusResult {
    const ok = r.status === 'success' && r.paymentStatus === 'SUCCESS';
    return {
      status: ok ? 'başarılı' : r.paymentStatus === 'FAILURE' || r.status === 'failure' ? 'başarısız' : 'bekliyor',
      providerPaymentId: (r.paymentId as string) ?? null,
      amountMinor: r.paidPrice != null ? Math.round(Number(r.paidPrice) * 100) : null,
      cardBrand: normalizeCardBrand((r.cardAssociation as string) ?? null),
      cardLast4: (r.lastFourDigits as string) ?? null,
      installment: Number(r.installment ?? 1) || 1,
      threeDS: true,
      errorCode: (r.errorCode as string) ?? null,
      errorMessage: (r.errorMessage as string) ?? null,
      raw: { status: r.status, paymentStatus: r.paymentStatus, paymentId: r.paymentId, errorCode: r.errorCode },
    };
  }

  return {
    id: 'iyzico',
    label: 'iyzico',
    hosted: true,
    supportsRefund: true,
    supportsInstallments: true,

    async createPayment(req: PaymentRequest): Promise<CreatePaymentResult> {
      const request = {
        locale: 'tr',
        conversationId: req.conversationId,
        price: money(req.amountMinor),
        paidPrice: money(req.amountMinor),
        currency: 'TRY',
        basketId: req.orderNumber,
        paymentGroup: 'PRODUCT',
        callbackUrl: req.callbackUrl,
        enabledInstallments: req.installment > 1 ? [1, 2, 3, 6, 9, 12] : [1],
        buyer: {
          id: req.buyer.id,
          name: req.buyer.firstName,
          surname: req.buyer.lastName,
          gsmNumber: req.buyer.phone,
          email: req.buyer.email,
          identityNumber: req.buyer.identityNumber || '11111111111',
          registrationAddress: req.billingAddress.addressLine,
          ip: req.buyer.ip ?? '127.0.0.1',
          city: req.billingAddress.city,
          country: 'Turkey',
        },
        shippingAddress: { contactName: req.shippingAddress.fullName, city: req.shippingAddress.city, country: 'Turkey', address: req.shippingAddress.addressLine, zipCode: req.shippingAddress.postalCode },
        billingAddress: { contactName: req.billingAddress.fullName, city: req.billingAddress.city, country: 'Turkey', address: req.billingAddress.addressLine, zipCode: req.billingAddress.postalCode },
        basketItems: req.items.map((i) => ({
          id: i.id,
          name: i.name,
          category1: i.category || 'Aroma',
          itemType: 'PHYSICAL',
          price: money(i.priceMinor * i.quantity),
        })),
      };

      let r: Record<string, unknown>;
      try {
        r = await call<Record<string, unknown>>((cb) => client.checkoutFormInitialize.create(request, cb));
      } catch (err) {
        return { kind: 'failed', errorCode: 'IYZICO_NETWORK', errorMessage: (err as Error).message, raw: null };
      }
      if (r.status !== 'success' || !r.paymentPageUrl) {
        return { kind: 'failed', errorCode: String(r.errorCode ?? 'IYZICO'), errorMessage: String(r.errorMessage ?? 'iyzico ödeme başlatılamadı'), raw: { errorCode: r.errorCode } };
      }
      return { kind: 'redirect', url: String(r.paymentPageUrl), providerPaymentId: (r.token as string) ?? null, raw: { token: '***' } };
    },

    async capture(providerPaymentId, amountMinor): Promise<PaymentStatusResult> {
      return { status: 'başarılı', providerPaymentId, amountMinor, raw: { note: 'iyzico doğrudan çeker' } };
    },

    async refund(providerPaymentId, amountMinor, reason): Promise<RefundResult> {
      // İade paymentTransactionId ister; retrieve ile itemTransactions'tan alınır.
      try {
        const detail = await retrieve(providerPaymentId);
        const tx = (detail.itemTransactions as { paymentTransactionId: string; paidPrice: number }[] | undefined) ?? [];
        if (tx.length === 0) return { ok: false, providerRefundId: null, pending: false, errorMessage: 'İşlem bulunamadı', raw: null };
        // Tek kalem varsayımı ile tam/kısmi iade ilk işleme uygulanır; çok kalemli iade F5'te kalem eşlemesiyle.
        const r = await call<Record<string, unknown>>((cb) =>
          client.refund.create({ locale: 'tr', paymentTransactionId: tx[0].paymentTransactionId, price: money(amountMinor), currency: 'TRY', ip: '127.0.0.1', reason }, cb),
        );
        return { ok: r.status === 'success', providerRefundId: (r.paymentId as string) ?? null, pending: false, errorMessage: (r.errorMessage as string) ?? null, raw: { status: r.status, errorCode: r.errorCode } };
      } catch (err) {
        return { ok: false, providerRefundId: null, pending: false, errorMessage: (err as Error).message, raw: null };
      }
    },

    async verifyWebhook({ rawBody, headers }): Promise<WebhookVerification> {
      // Callback: application/x-www-form-urlencoded (token=...) veya JSON bildirim ({ token, paymentConversationId, … }).
      let token = '';
      const ct = headers.get('content-type') ?? '';
      if (ct.includes('json')) {
        try { token = String((JSON.parse(rawBody) as { token?: string }).token ?? ''); } catch { token = ''; }
      } else {
        token = new URLSearchParams(rawBody).get('token') ?? '';
      }
      if (!token) return { ok: false, externalId: '', orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw: { error: 'token yok' } };

      // Doğrulama = iyzico'dan sonucu çekmek; sahte token geçersiz yanıt döner.
      let r: Record<string, unknown>;
      try {
        r = await retrieve(token);
      } catch (err) {
        return { ok: false, externalId: '', orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw: { error: (err as Error).message } };
      }
      const n = normalizeResult(r);
      return {
        ok: r.status === 'success' || r.status === 'failure',
        externalId: `iyzico:${token}:${n.status}`,
        orderId: null, // conversationId → Payment.providerPaymentId=token eşlemesi
        providerPaymentId: token,
        event: n.status === 'başarılı' ? 'odeme-basarili' : 'odeme-basarisiz',
        amountMinor: n.amountMinor,
        cardBrand: n.cardBrand,
        cardLast4: n.cardLast4,
        installment: n.installment,
        errorMessage: n.errorMessage,
        raw: { ...(n.raw as object), conversationId: r.conversationId, paymentId: r.paymentId },
      };
    },

    async getStatus(providerPaymentId): Promise<PaymentStatusResult> {
      return normalizeResult(await retrieve(providerPaymentId));
    },
  };
}
