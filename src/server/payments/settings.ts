// Ödeme ayarları — `Setting` tablosunda `odeme` anahtarı.
//
// Gizli alanlar (API anahtarı, secret, salt, webhook secret) veritabanında
// AES-256-GCM ile ŞİFRELİ durur (`secret-box.ts`); okunurken sunucu tarafında
// çözülür, panele yalnız maskeli (`••••1234`) döner. Boşsa ortam değişkeni
// (IYZICO_API_KEY vb.) yedeği kullanılır — ilk kurulumda .env yeterli olsun diye.

import 'server-only';
import { z } from 'zod';
import { cache } from 'react';
import { readSettingValue, writeSetting } from '../settings';
import type { StoreId } from '@/lib/stores';
import { currentStore, deploymentStore } from '../store-context';
import { isEncryptionConfigured, seal, tryOpen } from '../crypto/secret-box';
import { DEFAULT_INSTALLMENTS, type BankInstallmentTable } from './installments';
import type { ProviderId } from './provider';

const modeSchema = z.enum(['test', 'live']).default('test');

export const paymentSettingsSchema = z.object({
  /** Kart ödemelerinde kullanılacak sağlayıcı. DEMO_MODE=true iken her zaman mock. */
  cardProvider: z.enum(['mock', 'iyzico', 'paytr', 'stripe']).default('mock'),
  /** Checkout'ta gösterim sırası ve aktiflik. */
  methods: z
    .array(z.object({ id: z.enum(['kart', 'havale', 'kapida']), enabled: z.boolean() }))
    .default([
      { id: 'kart', enabled: true },
      { id: 'havale', enabled: true },
      { id: 'kapida', enabled: true },
    ]),
  /** Yöntem bazlı tutar sınırları, kuruş (null = sınırsız). */
  limits: z
    .object({
      kart: z.object({ minMinor: z.number().int().min(0).nullable().default(null), maxMinor: z.number().int().min(0).nullable().default(null) }).default({}),
      havale: z.object({ minMinor: z.number().int().min(0).nullable().default(null), maxMinor: z.number().int().min(0).nullable().default(null) }).default({}),
      kapida: z.object({ minMinor: z.number().int().min(0).nullable().default(null), maxMinor: z.number().int().min(0).nullable().default(300_000) }).default({}),
    })
    .default({}),
  require3DS: z.boolean().default(true),
  installments: z.array(z.any()).default(DEFAULT_INSTALLMENTS),

  iyzico: z
    .object({
      enabled: z.boolean().default(false),
      mode: modeSchema,
      apiKey: z.string().default(''),
      secretKey: z.string().default(''),
    })
    .default({}),
  paytr: z
    .object({
      enabled: z.boolean().default(false),
      mode: modeSchema,
      merchantId: z.string().default(''),
      merchantKey: z.string().default(''),
      merchantSalt: z.string().default(''),
    })
    .default({}),
  stripe: z
    .object({
      enabled: z.boolean().default(false),
      mode: modeSchema,
      publishableKey: z.string().default(''),
      secretKey: z.string().default(''),
      webhookSecret: z.string().default(''),
    })
    .default({}),
  havale: z
    .object({
      enabled: z.boolean().default(true),
      bankName: z.string().default(''),
      accountHolder: z.string().default(''),
      iban: z.string().default(''),
      instructions: z.string().default('Açıklama alanına sipariş numaranızı yazın.'),
    })
    .default({}),
});

export type PaymentSettings = z.output<typeof paymentSettingsSchema>;

export const SECRET_FIELDS: Record<string, string[]> = {
  iyzico: ['apiKey', 'secretKey'],
  paytr: ['merchantKey', 'merchantSalt'],
  stripe: ['secretKey', 'webhookSecret'],
};

const ENV_FALLBACK: Record<string, Record<string, string | undefined>> = {
  iyzico: { apiKey: process.env.IYZICO_API_KEY, secretKey: process.env.IYZICO_SECRET_KEY },
  paytr: { merchantId: process.env.PAYTR_MERCHANT_ID, merchantKey: process.env.PAYTR_MERCHANT_KEY, merchantSalt: process.env.PAYTR_MERCHANT_SALT },
  stripe: { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
};

export const PAYMENT_SETTING_KEY = 'odeme';

/** Şifreli alanları çözer; çözülemeyen (anahtar değişmiş) alan boş kalır. */
/**
 * Şifreli anahtarları çözer. `.env` yedeği (`IYZICO_*` vb.) yalnız bu
 * dağıtımın kendi mağazası için okunur — panelden başka mağazanın ödemesi
 * (ör. iade) asla bu dağıtımın sağlayıcı hesabıyla işlenmemeli.
 */
function decryptSecrets(raw: PaymentSettings, useEnv = true): PaymentSettings {
  const out = structuredClone(raw) as PaymentSettings;
  for (const [provider, fields] of Object.entries(SECRET_FIELDS)) {
    const section = out[provider as 'iyzico' | 'paytr' | 'stripe'] as unknown as Record<string, string>;
    for (const f of fields) {
      const v = section[f];
      if (v && v.startsWith('v1.')) section[f] = tryOpen(v) ?? '';
      if (useEnv && !section[f]) section[f] = ENV_FALLBACK[provider]?.[f] ?? '';
    }
    if (useEnv && provider === 'paytr' && !section.merchantId) section.merchantId = ENV_FALLBACK.paytr.merchantId ?? '';
  }
  return out;
}

/** Sunucu içi kullanım: ÇÖZÜLMÜŞ anahtarlarla ayarlar. Panele verilmez. */
const paymentSettingsFor = cache(async (store: StoreId): Promise<PaymentSettings> => {
  const value = await readSettingValue(PAYMENT_SETTING_KEY, store);
  const parsed = paymentSettingsSchema.safeParse(value ?? {});
  const base = parsed.success ? parsed.data : paymentSettingsSchema.parse({});
  return decryptSecrets(base, store === deploymentStore());
});

/** Geçerli mağazanın ayarları (istek başına teklenir). */
export const getPaymentSettings = (): Promise<PaymentSettings> => paymentSettingsFor(currentStore());

export function maskSecret(value: string): string {
  if (!value) return '';
  return `••••${value.slice(-4)}`;
}

/** Panel görünümü: gizli alanlar maskeli, dolu/boş bilgisiyle. */
export async function getPaymentSettingsMasked() {
  const s = await getPaymentSettings();
  const out = structuredClone(s) as unknown as Record<string, Record<string, unknown>>;
  for (const [provider, fields] of Object.entries(SECRET_FIELDS)) {
    for (const f of fields) {
      const v = (out[provider] as Record<string, string>)[f];
      (out[provider] as Record<string, unknown>)[f] = maskSecret(v);
      (out[provider] as Record<string, unknown>)[`${f}Set`] = Boolean(v);
    }
  }
  return out as unknown as PaymentSettings;
}

/**
 * Panelden kayıt. Gizli alanlarda boş/maskeli değer = "değiştirme" anlamına
 * gelir; yeni değer verildiyse şifrelenir. Şifreleme yapılandırılmamışsa
 * gizli alan kaydedilmez (düz metin saklamak yerine hata).
 */
export async function savePaymentSettings(raw: unknown, updatedByUserId: string): Promise<void> {
  const incoming = paymentSettingsSchema.parse(raw);
  const existingValue = await readSettingValue(PAYMENT_SETTING_KEY);
  const existing = paymentSettingsSchema.safeParse(existingValue ?? {});
  const stored = existing.success ? existing.data : paymentSettingsSchema.parse({});

  const next = structuredClone(incoming) as unknown as Record<string, Record<string, unknown>>;
  for (const [provider, fields] of Object.entries(SECRET_FIELDS)) {
    for (const f of fields) {
      const v = String((next[provider] as Record<string, unknown>)[f] ?? '');
      const prev = String((stored as unknown as Record<string, Record<string, unknown>>)[provider]?.[f] ?? '');
      if (!v || v.startsWith('••••')) {
        (next[provider] as Record<string, unknown>)[f] = prev; // değiştirme
      } else {
        if (!isEncryptionConfigured()) {
          throw Object.assign(new Error('ENCRYPTION_KEY tanımlı değil; sağlayıcı anahtarları şifrelenemeden kaydedilemez.'), { status: 422 });
        }
        (next[provider] as Record<string, unknown>)[f] = seal(v);
      }
    }
  }

  await writeSetting(PAYMENT_SETTING_KEY, next, updatedByUserId, { isSecret: true });
}

export function installmentTables(s: PaymentSettings): BankInstallmentTable[] {
  const t = s.installments as BankInstallmentTable[];
  return Array.isArray(t) && t.length ? t : DEFAULT_INSTALLMENTS;
}

export function isMethodEnabled(s: PaymentSettings, id: 'kart' | 'havale' | 'kapida'): boolean {
  return s.methods.find((m) => m.id === id)?.enabled ?? false;
}

export function providerConfigured(s: PaymentSettings, id: ProviderId): boolean {
  switch (id) {
    case 'iyzico':
      return Boolean(s.iyzico.apiKey && s.iyzico.secretKey);
    case 'paytr':
      return Boolean(s.paytr.merchantId && s.paytr.merchantKey && s.paytr.merchantSalt);
    case 'stripe':
      return Boolean(s.stripe.secretKey);
    default:
      return true;
  }
}
