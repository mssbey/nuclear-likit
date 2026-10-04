// Kargo ayarları — taşıyıcı API bağlantıları + kapıda ödeme kısıtları.
//
// Taşıyıcı anahtarları `ayar:yaz` iznine sahip herkes tarafından girilebilir
// (ödeme sağlayıcı anahtarlarının aksine sahibe özel değildir). AES-256-GCM ile
// şifrelenir, panele maskeli döner. Kapıda ödeme hizmet bedeli/üst tutarı
// mağaza ayarlarında (`Setting.magaza`) saklanır; bu dosya onu da okur/yazar
// ki tek ekranda ("/admin/ayarlar/kargo") yönetilebilsin.

import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import type { StoreId } from '@/lib/stores';
import { currentStore } from '../store-context';
import { seal, tryOpen, isEncryptionConfigured } from '../crypto/secret-box';
import { getStoreSettings, readSettingValue, writeSetting, SETTING_KEYS } from '../settings';
import { CARRIERS } from './carriers';

const NAMED_CARRIERS = CARRIERS.filter((c) => c !== 'manuel' && c !== 'kendi-kuryemiz');

const carrierSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().default(''),
  apiSecret: z.string().default(''),
  /** MNG gibi bazı firmalarda ayrıca müşteri/bayi kodu istenir. */
  customerCode: z.string().default(''),
});
export type CarrierSettings = z.output<typeof carrierSchema>;

export const shippingSettingsSchema = z.object({
  providers: z
    .object({
      yurtici: carrierSchema.default({}),
      aras: carrierSchema.default({}),
      mng: carrierSchema.default({}),
      surat: carrierSchema.default({}),
      ptt: carrierSchema.default({}),
    })
    .default({}),
});
export type ShippingSettings = z.output<typeof shippingSettingsSchema>;

const SECRET_FIELDS: (keyof CarrierSettings)[] = ['apiKey', 'apiSecret', 'customerCode'];
export const SHIPPING_SETTING_KEY = 'kargo-saglayici';

function decryptSecrets(s: ShippingSettings): ShippingSettings {
  const out = structuredClone(s);
  for (const carrier of NAMED_CARRIERS) {
    const section = out.providers[carrier as keyof ShippingSettings['providers']] as unknown as Record<string, string>;
    for (const f of SECRET_FIELDS) {
      const v = section[f];
      if (v && v.startsWith('v1.')) section[f] = tryOpen(v) ?? '';
    }
  }
  return out;
}

/** Sunucu içi: çözülmüş anahtarlarla. Panele verilmez. */
const shippingSettingsFor = cache(async (store: StoreId): Promise<ShippingSettings> => {
  const value = await readSettingValue(SHIPPING_SETTING_KEY, store);
  const parsed = shippingSettingsSchema.safeParse(value ?? {});
  const base = parsed.success ? parsed.data : shippingSettingsSchema.parse({});
  return decryptSecrets(base);
});

/** Geçerli mağazanın ayarları (istek başına teklenir). */
export const getShippingSettings = (): Promise<ShippingSettings> => shippingSettingsFor(currentStore());

function maskSecret(value: string): string {
  if (!value) return '';
  return `••••${value.slice(-4)}`;
}

/** Panel görünümü: gizli alanlar maskeli. */
export async function getShippingSettingsMasked() {
  const s = await getShippingSettings();
  const out = structuredClone(s) as unknown as { providers: Record<string, Record<string, unknown>> };
  for (const carrier of NAMED_CARRIERS) {
    const section = out.providers[carrier];
    for (const f of SECRET_FIELDS) {
      const v = section[f] as string;
      section[f] = maskSecret(v);
      section[`${f}Set`] = Boolean(v);
    }
  }
  return out as unknown as ShippingSettings;
}

export async function saveShippingSettings(raw: unknown, updatedByUserId: string): Promise<void> {
  const incoming = shippingSettingsSchema.parse(raw);
  const existingValue = await readSettingValue(SHIPPING_SETTING_KEY);
  const existing = shippingSettingsSchema.safeParse(existingValue ?? {});
  const stored = existing.success ? existing.data : shippingSettingsSchema.parse({});

  const next = structuredClone(incoming) as unknown as { providers: Record<string, Record<string, unknown>> };
  const storedProviders = stored.providers as unknown as Record<string, Record<string, unknown>>;
  for (const carrier of NAMED_CARRIERS) {
    const section = next.providers[carrier];
    const prevSection = storedProviders[carrier];
    for (const f of SECRET_FIELDS) {
      const v = String(section[f] ?? '');
      const prev = String(prevSection?.[f] ?? '');
      if (!v || v.startsWith('••••')) {
        section[f] = prev; // değiştirme
      } else {
        if (!isEncryptionConfigured()) {
          throw Object.assign(new Error('ENCRYPTION_KEY tanımlı değil; taşıyıcı anahtarları şifrelenemeden kaydedilemez.'), { status: 422 });
        }
        section[f] = seal(v);
      }
    }
  }

  await writeSetting(SHIPPING_SETTING_KEY, next, updatedByUserId, { isSecret: true });
}

export const codLimitsSchema = z.object({
  codSurchargeMinor: z.number().int().min(0),
  codMaxTotalMinor: z.number().int().min(0).nullable(),
});
export type CodLimits = z.output<typeof codLimitsSchema>;

export async function getCodLimits(): Promise<CodLimits> {
  const s = await getStoreSettings();
  return { codSurchargeMinor: s.codSurchargeMinor, codMaxTotalMinor: s.codMaxTotalMinor };
}

export async function saveCodLimits(raw: unknown, updatedByUserId: string): Promise<void> {
  const patch = codLimitsSchema.parse(raw);
  const current = await getStoreSettings();
  await writeSetting(SETTING_KEYS.store, { ...current, ...patch }, updatedByUserId);
}
