// Vitrin kampanyaları — ürün sayfasında "10 Al 9 Öde!" gibi kutular için.
//
// Ürün sayfaları önbellekli/statik olduğu için kurallar küçük, etiketli bir
// önbellekten okunur; panelde kural eklenince/değişince `revalidateDiscountRules`
// ile tazelenir. Tarih penceresi istemcide de süzülür (bkz. CampaignBox).

import 'server-only';
import { cache } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '../db';
import { currentStore } from '../store-context';
import { jsonArray } from '../catalog/mapping';
import type { StoreId } from '@/lib/stores';
import type { DiscountRuleType } from '../pricing/discount-rules';

export const DISCOUNT_RULES_TAG = 'indirim-kurallari';

export interface StorefrontCampaignRule {
  id: string;
  name: string;
  type: DiscountRuleType;
  includeCategoryIds: string[];
  includeProductIds: string[];
  percentBps: number;
  minCartTotalMinor: number | null;
  buyQuantity: number | null;
  payQuantity: number | null;
  /** ISO tarih — önbellek Date taşımaz. */
  startsAt: string | null;
  endsAt: string | null;
}

async function readRules(store: StoreId): Promise<StorefrontCampaignRule[]> {
  const rows = await db.discountRule.findMany({
    where: { store, isActive: true },
    orderBy: { priority: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as DiscountRuleType,
    includeCategoryIds: jsonArray<string>(r.includeCategoryIds),
    includeProductIds: jsonArray<string>(r.includeProductIds),
    percentBps: r.percentBps,
    minCartTotalMinor: r.minCartTotalMinor,
    buyQuantity: r.buyQuantity,
    payQuantity: r.payQuantity,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
  }));
}

// Build'de yüzlerce ürün sayfası aynı listeyi ister; süreç başına tek okuma.
const buildTime = new Map<StoreId, Promise<StorefrontCampaignRule[]>>();

const loadRules = unstable_cache(
  (store: StoreId): Promise<StorefrontCampaignRule[]> => {
    if (process.env.NEXT_PHASE !== 'phase-production-build') return readRules(store);
    let pending = buildTime.get(store);
    if (!pending) {
      pending = readRules(store).catch((err: unknown) => {
        buildTime.delete(store);
        throw err;
      });
      buildTime.set(store, pending);
    }
    return pending;
  },
  ['vitrin-kampanyalar'],
  { tags: [DISCOUNT_RULES_TAG] },
);

const rulesFor = cache(loadRules);

export const getStorefrontCampaignRules = (): Promise<StorefrontCampaignRule[]> => rulesFor(currentStore());

export function revalidateDiscountRules(): void {
  revalidateTag(DISCOUNT_RULES_TAG, 'max');
}
