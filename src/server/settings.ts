// Mağaza ayarları — `Setting` tablosu üzerinde tipli erişim.
//
// Her anahtarın varsayılanı burada tanımlıdır; tablo boşken de uygulama
// çalışır. Yazma tarafı F7'de (sekmeli ayarlar ekranı) genişler; F1 yalnız
// checkout'un ihtiyaç duyduğu anahtarları okur.

import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_STORE, STORE_META, storeSettingKey, type StoreId } from '@/lib/stores';
import { db } from './db';
import { currentStore, deploymentStore } from './store-context';
import { site } from '@/lib/site';

export const storeSettingsSchema = z.object({
  /** Fiyatlar KDV dahil mi (Türkiye perakendede evet). */
  pricesIncludeTax: z.boolean().default(true),
  /** Ürün bazında override yoksa uygulanan oran, on binde. */
  defaultTaxRateBps: z.number().int().min(0).max(10_000).default(2000),
  /** Kargo hizmeti KDV oranı, on binde. */
  shippingTaxRateBps: z.number().int().min(0).max(10_000).default(2000),
  /** Kapıda ödeme ek hizmet bedeli, kuruş. */
  codSurchargeMinor: z.number().int().min(0).default(1500),
  /** Kapıda ödeme için üst sipariş tutarı, kuruş (null = sınırsız). */
  codMaxTotalMinor: z.number().int().min(0).nullable().default(300_000),
  /** Checkout'ta stok rezervasyonu süresi, dakika. */
  reservationMinutes: z.number().int().min(5).max(120).default(30),
  /** Düşük stok uyarı eşiği (panel). */
  lowStockThreshold: z.number().int().min(0).default(5),
  /** Cayma hakkı süresi, gün. */
  withdrawalDays: z.number().int().min(0).default(14),
  currency: z.literal('TRY').default('TRY'),
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const storeInfoSchema = z.object({
  legalName: z.string().default('Mixle Lezzet Sepeti'),
  tradeName: z.string().default('Mixle Lezzet Sepeti'),
  address: z.string().default(''),
  city: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  taxOffice: z.string().default(''),
  taxNumber: z.string().default(''),
  mersisNo: z.string().default(''),
  /** Sipariş bildirimlerinin gideceği yönetici e-postası. */
  notifyEmail: z.string().default(''),
  /**
   * Vitrin adresi (https://…). E-postalardaki bağlantılar bununla kurulur;
   * boşsa bu dağıtımın kendi mağazası için `NEXT_PUBLIC_SITE_URL` kullanılır.
   * Panel başka mağazanın e-postasını gönderebildiği için o mağazada doldurulmalı.
   */
  siteUrl: z.string().trim().max(200).default(''),
});

export type StoreInfo = z.infer<typeof storeInfoSchema>;

const KEYS = {
  store: 'magaza',
  info: 'magaza-bilgileri',
} as const;

/**
 * Geçerli mağazanın ayar satırı. Anahtar mağazaya göre öneklenir
 * (`storeSettingKey`); Mixle'ın anahtarları öneksizdir.
 */
export async function readSettingValue(key: string, store: StoreId = currentStore()): Promise<unknown> {
  const row = await db.setting.findUnique({ where: { key: storeSettingKey(store, key) } });
  return row?.value;
}

// `z.output<S>`: `.default()` alanları çıktıda zorunludur; düz `ZodType<T>`
// generic'i giriş tipini (opsiyonel) yakalayıp her alanı `| undefined` yapıyordu.
async function readKey<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  store: StoreId,
  defaults: Record<string, unknown> = {},
): Promise<z.output<S>> {
  const value = await readSettingValue(key, store);
  const input = value && typeof value === 'object' ? { ...defaults, ...value } : defaults;
  const parsed = schema.safeParse(input);
  // Bozuk kayıt varsayılanı düşürmesin: geçersizse varsayılanlara dön.
  return parsed.success ? parsed.data : schema.parse(defaults);
}

// React `cache()` argümana göre teker; mağaza argüman olduğu için iki mağaza
// aynı istekte karışmaz.
const storeSettingsFor = cache((store: StoreId) => readKey(KEYS.store, storeSettingsSchema, store));
const storeInfoFor = cache((store: StoreId) => {
  // Varsayılan unvan Mixle'ınkidir; diğer mağazada kayıt yoksa kendi adı görünsün.
  const label = STORE_META[store].label;
  const defaults = store === DEFAULT_STORE ? {} : { legalName: label, tradeName: label };
  return readKey(KEYS.info, storeInfoSchema, store, defaults);
});

export const getStoreSettings = () => storeSettingsFor(currentStore());
export const getStoreInfo = () => storeInfoFor(currentStore());

/** Geçerli mağazanın ayarını yazar (anahtar mağazaya göre öneklenir). */
export async function writeSetting(
  key: string,
  value: unknown,
  updatedByUserId: string | null,
  options: { isSecret?: boolean } = {},
): Promise<void> {
  const storedKey = storeSettingKey(currentStore(), key);
  const secret = options.isSecret === undefined ? {} : { isSecret: options.isSecret };
  await db.setting.upsert({
    where: { key: storedKey },
    create: { key: storedKey, value: value as Prisma.InputJsonValue, updatedByUserId, ...secret },
    update: { value: value as Prisma.InputJsonValue, updatedByUserId, ...secret },
  });
}

export const SETTING_KEYS = KEYS;

export interface StoreBrand {
  /** E-posta imzası ve gönderen adı. */
  name: string;
  /** Bağlantıların kökü, sonda `/` olmadan; bilinmiyorsa boş. */
  url: string;
}

/** Geçerli mağazanın adı ve vitrin adresi — e-posta şablonları için. */
export async function getStoreBrand(): Promise<StoreBrand> {
  const store = currentStore();
  const info = await getStoreInfo();
  // Ayarlarda "Vitrin adresi" boşsa: bu dağıtımın kendi mağazası için site
  // adresi, diğer mağazalar için `STORE_URL_<KİMLİK>` (ör. STORE_URL_KANZI).
  const fallbackUrl = store === deploymentStore() ? site.domain : (process.env[`STORE_URL_${store.toUpperCase()}`] ?? '');
  return {
    name: info.tradeName || STORE_META[store].label,
    url: (info.siteUrl || fallbackUrl).replace(/\/$/, ''),
  };
}
