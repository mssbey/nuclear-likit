// Manuel sağlayıcılar: havale/EFT ve kapıda ödeme.
// Ödeme sistem dışında alınır; panelden "ödeme al" ile kapatılır. Webhook yok.

import type { PaymentProvider, PaymentStatusResult, RefundResult, WebhookVerification } from '../provider';

const notSupported = (): Promise<never> => Promise.reject(new Error('Bu sağlayıcı bu işlemi desteklemez.'));

function manual(id: 'havale' | 'kapida', label: string, instructions: string): PaymentProvider {
  return {
    id,
    label,
    hosted: true,
    supportsRefund: false,
    supportsInstallments: false,
    async createPayment(req) {
      return { kind: 'pending', providerPaymentId: null, instructions, raw: { orderNumber: req.orderNumber } };
    },
    capture: notSupported,
    async refund(): Promise<RefundResult> {
      // Manuel iade: panel kaydı tutar, para iadesi mağaza tarafından yapılır.
      return { ok: true, providerRefundId: null, pending: false, raw: { manual: true } };
    },
    async verifyWebhook(): Promise<WebhookVerification> {
      return { ok: false, externalId: '', orderId: null, providerPaymentId: null, event: 'bilinmiyor', amountMinor: null, raw: null };
    },
    async getStatus(providerPaymentId): Promise<PaymentStatusResult> {
      return { status: 'bekliyor', providerPaymentId, amountMinor: null, raw: null };
    },
  };
}

export const havaleProvider = manual('havale', 'Havale / EFT', 'Havale sonrası ödeme panelden eşleştirilir.');
export const kapidaProvider = manual('kapida', 'Kapıda ödeme', 'Ödeme teslimatta alınır.');
