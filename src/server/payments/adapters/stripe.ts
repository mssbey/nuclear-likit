// Stripe — Checkout Session (hosted), webhook imzası resmi SDK ile doğrulanır.
//
// Türkiye'de Stripe doğrudan hizmet vermez; uluslararası müşteriler veya
// yurt dışı tüzel kişilik için opsiyoneldir. Taksit desteklenmez.
// DOĞRULANMADI: test anahtarı olmadan çalıştırılmadı.

import Stripe from 'stripe';
import type {
  CreatePaymentResult,
  PaymentProvider,
  PaymentRequest,
  PaymentStatusResult,
  RefundResult,
  WebhookVerification,
} from '../provider';
import { normalizeCardBrand } from '../provider';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

export function createStripeProvider(cfg: StripeConfig): PaymentProvider {
  const stripe = new Stripe(cfg.secretKey);

  return {
    id: 'stripe',
    label: 'Stripe',
    hosted: true,
    supportsRefund: true,
    supportsInstallments: false,

    async createPayment(req: PaymentRequest): Promise<CreatePaymentResult> {
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          currency: 'try',
          customer_email: req.buyer.email,
          client_reference_id: req.orderId,
          metadata: { orderId: req.orderId, orderNumber: req.orderNumber, conversationId: req.conversationId },
          line_items: req.items.map((i) => ({
            quantity: i.quantity,
            price_data: { currency: 'try', unit_amount: i.priceMinor, product_data: { name: i.name } },
          })),
          success_url: req.successUrl,
          cancel_url: req.failureUrl,
        });
        if (!session.url) return { kind: 'failed', errorCode: 'STRIPE_NO_URL', errorMessage: 'Stripe oturum adresi alınamadı', raw: { id: session.id } };
        return { kind: 'redirect', url: session.url, providerPaymentId: session.id, raw: { id: session.id } };
      } catch (err) {
        const e = err as { code?: string; message?: string };
        return { kind: 'failed', errorCode: e.code ?? 'STRIPE_ERROR', errorMessage: e.message ?? 'Stripe hatası', raw: { message: e.message } };
      }
    },

    async capture(providerPaymentId, amountMinor): Promise<PaymentStatusResult> {
      return { status: 'başarılı', providerPaymentId, amountMinor, raw: { note: 'Checkout Session otomatik tahsil eder' } };
    },

    async refund(providerPaymentId, amountMinor, reason): Promise<RefundResult> {
      try {
        const session = await stripe.checkout.sessions.retrieve(providerPaymentId);
        const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (!pi) return { ok: false, providerRefundId: null, pending: false, errorMessage: 'PaymentIntent bulunamadı', raw: null };
        const r = await stripe.refunds.create({ payment_intent: pi, amount: amountMinor, metadata: { reason } });
        return { ok: r.status !== 'failed', providerRefundId: r.id, pending: r.status === 'pending', raw: { id: r.id, status: r.status } };
      } catch (err) {
        return { ok: false, providerRefundId: null, pending: false, errorMessage: (err as Error).message, raw: null };
      }
    },

    async verifyWebhook({ headers, rawBody }): Promise<WebhookVerification> {
      const sig = headers.get('stripe-signature') ?? '';
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, cfg.webhookSecret);
      } catch (err) {
        return { ok: false, externalId: '', orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw: { error: (err as Error).message } };
      }

      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const s = event.data.object as Stripe.Checkout.Session;
        return {
          ok: true,
          externalId: event.id,
          orderId: s.metadata?.orderId ?? s.client_reference_id ?? null,
          providerPaymentId: s.id,
          event: s.payment_status === 'paid' ? 'odeme-basarili' : 'bilinmiyor',
          amountMinor: s.amount_total ?? null,
          raw: { type: event.type, session: s.id, payment_status: s.payment_status },
        };
      }
      if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
        const s = event.data.object as Stripe.Checkout.Session;
        return { ok: true, externalId: event.id, orderId: s.metadata?.orderId ?? null, providerPaymentId: s.id, event: 'odeme-basarisiz', amountMinor: s.amount_total ?? null, errorMessage: event.type, raw: { type: event.type } };
      }
      if (event.type === 'charge.refunded') {
        const c = event.data.object as Stripe.Charge;
        return { ok: true, externalId: event.id, orderId: null, providerPaymentId: null, event: 'iade-tamamlandi', amountMinor: c.amount_refunded, raw: { type: event.type, charge: c.id } };
      }
      return { ok: true, externalId: event.id, orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw: { type: event.type } };
    },

    async getStatus(providerPaymentId): Promise<PaymentStatusResult> {
      const s = await stripe.checkout.sessions.retrieve(providerPaymentId, { expand: ['payment_intent.latest_charge'] });
      const pi = s.payment_intent as Stripe.PaymentIntent | null;
      const charge = (pi?.latest_charge as Stripe.Charge | null) ?? null;
      const card = charge?.payment_method_details?.card;
      return {
        status: s.payment_status === 'paid' ? 'başarılı' : s.status === 'expired' ? 'başarısız' : 'bekliyor',
        providerPaymentId,
        amountMinor: s.amount_total ?? null,
        cardBrand: normalizeCardBrand(card?.brand ?? null),
        cardLast4: card?.last4 ?? null,
        raw: { payment_status: s.payment_status, status: s.status },
      };
    },
  };
}
