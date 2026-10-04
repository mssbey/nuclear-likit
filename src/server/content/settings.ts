// Panelden düzenlenebilir site içeriği — SSS, ana sayfa kampanya bandı ve üst menü.
//
// Mevcut `Setting` anahtar-değer tablosu kullanılır (yeni model gerekmez).
// Kayıt yoksa `src/data/content.ts`'teki statik varsayılan döner — vitrin
// admin hiç düzenlemese de her zaman içerik gösterir; ilk kayıttan sonra DB
// devreye girer. Diğer içerik (rehber konuları, yorumlar, süreç adımları,
// hakkımızda) bilinçli olarak bu kapsamın dışındadır — bkz. README "Kapsam dışı".
//
// Önbellek: `catalog/queries.ts` ile AYNI desen — `unstable_cache` + `revalidateTag`
// (`cacheComponents` kapalıyken belgelerin önerdiği yol). Düz bir Prisma
// okuması `revalidatePath` ile geçersiz kılınmaz (denendi, çalışmadı — Full
// Route Cache yalnız `fetch`/`unstable_cache` çıktısını izler); bu yüzden
// `/sss` ve `/` içeriği burada olduğu gibi ETİKETLİ önbelleğe alınmalı.
// Not: `revalidateTag` "isteğe bağlı yeniden doğrulama"dır — panelden kayıttan
// hemen sonraki TEK bir istek nadiren henüz eski içeriği görebilir, bir
// sonraki istek her zaman tazedir (bkz. `scripts/admin-orders-smoke.mts`
// `fetchUntil`). Gerçek kullanımda (yönetici kaydeder, ziyaretçi dakikalar
// sonra bakar) bunun pratik bir etkisi yoktur.

import 'server-only';
import { cache } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';
import { z } from 'zod';
import { DEFAULT_STORE, type StoreId } from '@/lib/stores';
import { readSettingValue, writeSetting } from '../settings';
import { currentStore } from '../store-context';
import { notifyStorefronts } from '../storefront-sync';
import { faqGroups as defaultFaqGroups, campaign as defaultCampaign } from '@/data/content';
import { primaryNav as defaultPrimaryNav } from '@/data/nav';

export const faqContentSchema = z.object({
  groups: z
    .array(
      z.object({
        heading: z.string().trim().min(1, 'Başlık gerekli').max(80),
        items: z.array(z.object({ q: z.string().trim().min(1, 'Soru gerekli').max(300), a: z.string().trim().min(1, 'Cevap gerekli').max(2000) })).max(30),
      }),
    )
    .max(20),
});
export type FaqContent = z.output<typeof faqContentSchema>;

export const campaignContentSchema = z.object({
  eyebrow: z.string().trim().max(40).default(''),
  title: z.string().trim().min(1, 'Başlık gerekli').max(120),
  description: z.string().trim().max(400).default(''),
  code: z.string().trim().max(30).default(''),
  codeNote: z.string().trim().max(200).default(''),
  cta: z.object({ label: z.string().trim().min(1).max(40), href: z.string().trim().min(1).max(200) }),
  image: z.string().trim().min(1, 'Görsel gerekli').max(300),
});
export type CampaignContent = z.output<typeof campaignContentSchema>;

/** Header'daki "Tüm Kategoriler" butonunun yanındaki hızlı erişim linkleri. */
export const navMenuContentSchema = z.object({
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Menü adı gerekli').max(40),
        href: z
          .string()
          .trim()
          .min(1, 'Bağlantı gerekli')
          .max(200)
          .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), 'Bağlantı / ile ya da http(s):// ile başlamalı'),
        emphasis: z.boolean().default(false),
      }),
    )
    .max(8, 'En fazla 8 menü öğesi'),
});
export type NavMenuContent = z.output<typeof navMenuContentSchema>;

const KEYS = { faq: 'sayfa-sss', campaign: 'sayfa-kampanya', navMenu: 'menu-ust' } as const;
const FAQ_TAG = 'sayfa-sss';
const CAMPAIGN_TAG = 'sayfa-kampanya';
const NAV_MENU_TAG = 'menu-ust';

// Önbellek anahtarına `unstable_cache` argümanları da girer: mağaza argüman
// olarak verildiği için iki mağazanın içeriği ayrı önbelleklenir. Statik
// varsayılanlar (`src/data/*`) Mixle'ındır; diğer mağaza kayıt girilene dek boş
// içerik görür.
const loadFaq = unstable_cache(
  async (store: StoreId): Promise<FaqContent> => {
    const parsed = faqContentSchema.safeParse(await readSettingValue(KEYS.faq, store));
    if (parsed.success) return parsed.data;
    return { groups: store === DEFAULT_STORE ? defaultFaqGroups : [] };
  },
  ['sayfa-sss-icerik'],
  { tags: [FAQ_TAG] },
);
/** İstek başına teklenir, istekler arası `revalidateTag` ile geçersiz kılınana dek önbelleklenir. */
const faqFor = cache(loadFaq);
export const getFaqContent = (): Promise<FaqContent> => faqFor(currentStore());

const loadCampaign = unstable_cache(
  async (store: StoreId): Promise<CampaignContent> => {
    const parsed = campaignContentSchema.safeParse(await readSettingValue(KEYS.campaign, store));
    return parsed.success ? parsed.data : defaultCampaign;
  },
  ['sayfa-kampanya-icerik'],
  { tags: [CAMPAIGN_TAG] },
);
const campaignFor = cache(loadCampaign);
export const getCampaignContent = (): Promise<CampaignContent> => campaignFor(currentStore());

const loadNavMenu = unstable_cache(
  async (store: StoreId): Promise<NavMenuContent> => {
    const parsed = navMenuContentSchema.safeParse(await readSettingValue(KEYS.navMenu, store));
    if (parsed.success) return parsed.data;
    if (store !== DEFAULT_STORE) return { links: [] };
    return { links: defaultPrimaryNav.map((l) => ({ ...l, emphasis: l.emphasis ?? false })) };
  },
  ['menu-ust-icerik'],
  { tags: [NAV_MENU_TAG] },
);
const navMenuFor = cache(loadNavMenu);
export const getNavMenuContent = (): Promise<NavMenuContent> => navMenuFor(currentStore());

export async function saveFaqContent(raw: unknown, updatedByUserId: string): Promise<FaqContent> {
  const parsed = faqContentSchema.parse(raw);
  await writeSetting(KEYS.faq, parsed, updatedByUserId);
  revalidateTag(FAQ_TAG, 'max');
  notifyStorefronts();
  return parsed;
}

export async function saveCampaignContent(raw: unknown, updatedByUserId: string): Promise<CampaignContent> {
  const parsed = campaignContentSchema.parse(raw);
  await writeSetting(KEYS.campaign, parsed, updatedByUserId);
  revalidateTag(CAMPAIGN_TAG, 'max');
  notifyStorefronts();
  return parsed;
}

export async function saveNavMenuContent(raw: unknown, updatedByUserId: string): Promise<NavMenuContent> {
  const parsed = navMenuContentSchema.parse(raw);
  await writeSetting(KEYS.navMenu, parsed, updatedByUserId);
  revalidateTag(NAV_MENU_TAG, 'max');
  notifyStorefronts();
  return parsed;
}

export const CONTENT_SETTING_KEYS = KEYS;
