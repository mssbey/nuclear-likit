// Sağlayıcı kayıt defteri — ayarlardan adaptör üretir.
//
// DEMO_MODE=true iken kart sağlayıcısı HER ZAMAN mock'tur; gerçek anahtar
// tanımlı olsa bile para çekilmez. Canlıda yapılandırılmamış sağlayıcı seçiliyse
// mock'a düşülmez, hata verilir (yanlışlıkla test ödemesi kabul etmemek için).

import 'server-only';
import { DEMO_MODE } from '../config';
import type { PaymentProvider, ProviderId } from './provider';
import { getPaymentSettings, providerConfigured, type PaymentSettings } from './settings';
import { mockProvider } from './adapters/mock';
import { havaleProvider, kapidaProvider } from './adapters/manual';
import { createIyzicoProvider } from './adapters/iyzico';
import { createPaytrProvider } from './adapters/paytr';
import { createStripeProvider } from './adapters/stripe';

export class ProviderError extends Error {
  readonly status = 422 as const;
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function buildProvider(id: ProviderId, s: PaymentSettings): PaymentProvider {
  switch (id) {
    case 'mock':
      return mockProvider;
    case 'havale':
      return havaleProvider;
    case 'kapida':
      return kapidaProvider;
    case 'iyzico':
      if (!providerConfigured(s, 'iyzico')) throw new ProviderError('iyzico anahtarları tanımlı değil.');
      return createIyzicoProvider({
        apiKey: s.iyzico.apiKey,
        secretKey: s.iyzico.secretKey,
        baseUrl: s.iyzico.mode === 'live' ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com',
      });
    case 'paytr':
      if (!providerConfigured(s, 'paytr')) throw new ProviderError('PayTR anahtarları tanımlı değil.');
      return createPaytrProvider({
        merchantId: s.paytr.merchantId,
        merchantKey: s.paytr.merchantKey,
        merchantSalt: s.paytr.merchantSalt,
        testMode: s.paytr.mode !== 'live',
      });
    case 'stripe':
      if (!providerConfigured(s, 'stripe')) throw new ProviderError('Stripe anahtarı tanımlı değil.');
      return createStripeProvider({ secretKey: s.stripe.secretKey, webhookSecret: s.stripe.webhookSecret });
  }
}

export async function getProvider(id: ProviderId): Promise<PaymentProvider> {
  const s = await getPaymentSettings();
  // Demo modda kart sağlayıcıları mock'a zorlanır — gerçek çağrı asla yapılmaz.
  if (DEMO_MODE && (id === 'iyzico' || id === 'paytr' || id === 'stripe')) return mockProvider;
  return buildProvider(id, s);
}

/** Checkout'un "kart" seçimi için etkin sağlayıcı. */
export async function getCardProvider(): Promise<PaymentProvider> {
  const s = await getPaymentSettings();
  if (DEMO_MODE) return mockProvider;
  if (s.cardProvider === 'mock') {
    throw new ProviderError('Canlı modda test sağlayıcısı kullanılamaz; Ayarlar → Ödeme bölümünden gerçek sağlayıcı seçin.');
  }
  return buildProvider(s.cardProvider, s);
}

/** Bu sağlayıcı webhook alabilir mi (havale/kapıda alamaz). */
export function acceptsWebhooks(id: string): id is ProviderId {
  return id === 'mock' || id === 'iyzico' || id === 'paytr' || id === 'stripe';
}
