// Ürün sayfası için: ürüne uyan kampanya kurallarını vitrin metnine çevirir.
// Uygunluk checkout'taki motorla aynı: ürün listesi + kategori listesi (boşsa hepsi).

import 'server-only';
import type { Product, ProductCampaign } from '@/types';
import { getAdminCategories } from '../catalog/queries';
import { formatMinor, bpsToPercent } from '@/lib/money';
import { getStorefrontCampaignRules } from './campaigns';

/** `renderedAt`: sayfanın üretildiği an — istemcideki ilk çizim buna göre süzer (hidrasyon). */
export async function getProductCampaigns(
  product: Product,
): Promise<{ campaigns: ProductCampaign[]; renderedAt: number }> {
  const [rules, categories] = await Promise.all([getStorefrontCampaignRules(), getAdminCategories()]);
  const slugOf = new Map(categories.map((c) => [c.id, c.slug]));
  const now = Date.now();

  const campaigns = rules
    .filter((r) => !r.endsAt || Date.parse(r.endsAt) >= now)
    .filter((r) => !r.includeProductIds.length || r.includeProductIds.includes(product.id))
    .filter(
      (r) =>
        !r.includeCategoryIds.length ||
        r.includeCategoryIds.some((id) => (product.categories as string[]).includes(slugOf.get(id) ?? '')),
    )
    .flatMap((r): ProductCampaign[] => {
      if (r.type === 'x-al-y-ode') {
        const buy = r.buyQuantity ?? 0;
        const pay = r.payQuantity ?? 0;
        if (buy <= 0 || buy <= pay) return [];
        const free = buy - pay;
        return [{
          id: r.id,
          title: `${buy} Al ${pay} Öde!`,
          detail: `Kampanyalı ürünlerimizden ${buy} adet alımda ${free} adet ürün bedava.\nKampanya sepette otomatik uygulanacaktır.`,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
        }];
      }
      if (r.percentBps <= 0) return [];
      const pct = bpsToPercent(r.percentBps);
      return [{
        id: r.id,
        title: `%${pct} İndirim`,
        detail: r.minCartTotalMinor
          ? `Kampanyalı ürünlerde ${formatMinor(r.minCartTotalMinor)} ve üzeri alışverişe %${pct} indirim. Sepette otomatik uygulanır.`
          : `Bu üründe %${pct} indirim sepette otomatik uygulanır.`,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
      }];
    });
  return { campaigns, renderedAt: now };
}
