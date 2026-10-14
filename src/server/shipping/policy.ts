// Vitrin metinleri için kargo özeti — duyuru bandı, ürün sayfası, teslimat sayfası.
//
// Kaynak checkout ile AYNIDIR: mağazanın panelden girilen bölge/yöntemleri
// (`ShippingZone` / `ShippingMethod`). Sabit "1500 ₺ üzeri" metni yoktur; eşik
// ve ücret, sepetin adres bilinmeden kullandığı tahmini yöntemden
// (`estimateShipping`) okunur. Bölgeye göre farklılık varsa `varies` ile
// bildirilir ki tek bir rakam herkes için geçerliymiş gibi sunulmasın.
//
// Önbellek: `unstable_cache` + `kargo` etiketi; panelde kargo ayarı yazılınca
// `invalidateShippingPolicy()` düşürür (diğer vitrin dağıtımlarına da haber verir).

import 'server-only';
import { cache } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';
import type { StoreId } from '@/lib/stores';
import { currentStore } from '../store-context';
import { notifyStorefronts } from '../storefront-sync';
import { estimateShipping, methodThreshold, type ShippingMethodType, type ShippingZoneRule } from '../pricing/shipping-rates';
import { readShippingZones } from './zones';

export const SHIPPING_TAG = 'kargo';

export interface ShippingPolicyMethod {
  name: string;
  type: ShippingMethodType;
  /** Sabit ücret, kuruş; kademeli tarifelerde ilk kademe yerine null (sepete göre değişir). */
  priceMinor: number | null;
  /** Kademeler (desi: kg, tutara-göre: kuruş). */
  tiers: { upTo: number | null; priceMinor: number }[] | null;
  thresholdMinor: number | null;
  estimatedDays: string;
}

export interface ShippingPolicy {
  /** Adres bilinmeden geçerli eşik, kuruş; yoksa null. */
  thresholdMinor: number | null;
  /** Adres bilinmeden geçerli ücret, kuruş; kademeli/bilinmiyorsa null. */
  feeMinor: number | null;
  /** Bazı bölgelerde ücret/eşik farklı: metinler genelleme yapmamalı. */
  varies: boolean;
  zones: { name: string; cities: string[]; methods: ShippingPolicyMethod[] }[];
}

const EMPTY: ShippingPolicy = { thresholdMinor: null, feeMinor: null, varies: false, zones: [] };

/** Saf: bölgelerden vitrin özeti. */
export function buildShippingPolicy(zones: ShippingZoneRule[], country = 'TR'): ShippingPolicy {
  const estimate = estimateShipping(zones, { country, cartTotalMinor: 0, desi: null, freeShippingCoupon: false });
  if (!estimate) return { ...EMPTY, zones: summarizeZones(zones) };
  const tiered = (estimate.method.type === 'desi' || estimate.method.type === 'tutara-göre') && !!estimate.method.tiers?.length;
  return {
    thresholdMinor: estimate.thresholdMinor,
    feeMinor: tiered ? null : estimate.baseFeeMinor,
    varies: estimate.varies || tiered,
    zones: summarizeZones(zones),
  };
}

function summarizeZones(zones: ShippingZoneRule[]): ShippingPolicy['zones'] {
  return [...zones]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((z) => ({
      name: z.name,
      cities: z.cities,
      methods: [...z.methods]
        .filter((m) => m.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => {
          const tiered = (m.type === 'desi' || m.type === 'tutara-göre') && !!m.tiers?.length;
          return {
            name: m.name,
            type: m.type,
            priceMinor: m.type === 'ücretsiz' ? 0 : tiered ? null : m.priceMinor,
            tiers: tiered ? m.tiers : null,
            thresholdMinor: methodThreshold(m),
            estimatedDays: m.estimatedDays,
          };
        }),
    }))
    .filter((z) => z.methods.length > 0);
}

// Mağaza argüman olduğu için önbellek anahtarı mağazaya göre ayrılır.
const loadPolicy = unstable_cache(
  async (store: StoreId): Promise<ShippingPolicy> => buildShippingPolicy(await readShippingZones(store)),
  ['kargo-politika'],
  { tags: [SHIPPING_TAG] },
);
const policyFor = cache(loadPolicy);

/**
 * Geçerli mağazanın kargo özeti. Okunamazsa (veritabanı erişilemez) sayfa
 * düşmez: vaat içermeyen boş özet döner; hata önbelleğe yazılmaz (yakalama
 * önbellek DIŞINDA), bir sonraki istek yeniden dener.
 */
export async function getShippingPolicy(): Promise<ShippingPolicy> {
  try {
    return await policyFor(currentStore());
  } catch (err) {
    console.error('[kargo] Kargo özeti okunamadı:', err);
    return EMPTY;
  }
}

/** Panelde kargo bölgesi/yöntemi değişti: vitrin metinleri hemen tazelensin. */
export function invalidateShippingPolicy(): void {
  revalidateTag(SHIPPING_TAG, { expire: 0 });
  notifyStorefronts();
}
