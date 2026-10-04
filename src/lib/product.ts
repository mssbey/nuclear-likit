// Vitrin ürün görünüm modelleri — saf, istemci ve sunucuda çalışır.
//
// Ortak katalog modeli (`AdminProduct`) panelin tam verisidir; vitrin yalnız
// burada türetilen hafif modelleri istemciye taşır. Stok ve "Yeni" kuralları
// Mixle vitriniyle aynıdır (bkz. Mixle `src/data/catalog-adapter.ts`).

import type { AdminProduct, AdminVariant } from '@/types/admin';
import type { FlavorNote } from '@/types';
import { hasNewWindow, isInNewWindow } from '@/lib/new-badge';
import { discountPercentMinor } from '@/lib/money';
import { mediaUrl } from '@/lib/site';

export type CardBadge = 'yeni' | 'indirim' | 'cok-satan' | 'tukendi';

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  series: string;
  image: string;
  imageAlt: string;
  hoverImage: string | null;
  priceMinor: number;
  /** Varyant fiyatları farklıysa en yüksek; aynıysa null. */
  maxPriceMinor: number | null;
  compareAtMinor: number | null;
  discountPercent: number;
  inStock: boolean;
  badges: CardBadge[];
  /** Tek varyantlı ve stokta: karttan doğrudan sepete eklenebilir. */
  quickAddVariantId: string | null;
  createdAt: string;
  bestSeller: boolean;
  featured: boolean;
}

export interface VariantView {
  id: string;
  sku: string;
  /** optionId → valueId */
  optionValues: Record<string, string>;
  label: string;
  priceMinor: number;
  compareAtMinor: number | null;
  inStock: boolean;
  /** Takip edilen stokta kalan adet; takip yoksa null. */
  stockLeft: number | null;
  image: string | null;
  isDefault: boolean;
}

export interface ProductDetailData extends ProductCardData {
  shortDescription: string;
  description: string;
  images: { src: string; alt: string }[];
  options: { id: string; name: string; values: { id: string; label: string }[] }[];
  variants: VariantView[];
  flavorNotes: FlavorNote[];
  faq: { question: string; answer: string }[];
  categoryIds: string[];
  tags: string[];
  seo: { title: string; description: string };
}

export function variantInStock(v: Pick<AdminVariant, 'trackStock' | 'inStock' | 'stock'>): boolean {
  return v.trackStock === false ? v.inStock !== false : v.stock > 0;
}

export function variantLabel(p: Pick<AdminProduct, 'options'>, v: Pick<AdminVariant, 'optionValues'>): string {
  return [...p.options]
    .sort((a, b) => a.order - b.order)
    .map((o) => o.values.find((x) => x.id === v.optionValues[o.id])?.label)
    .filter(Boolean)
    .join(' · ');
}

export function isNew(p: AdminProduct, now = new Date()): boolean {
  return hasNewWindow(p) ? isInNewWindow(p, now) : p.newArrival;
}

export function toCard(p: AdminProduct): ProductCardData {
  const active = p.variants.filter((v) => v.isActive);
  const sellable = active.filter(variantInStock);
  const pool = sellable.length ? sellable : active;
  const cheapest = [...pool].sort((a, b) => a.priceMinor - b.priceMinor)[0];
  const prices = active.map((v) => v.priceMinor);
  const max = prices.length ? Math.max(...prices) : 0;
  const priceMinor = cheapest?.priceMinor ?? 0;
  const compareAtMinor =
    cheapest?.compareAtPriceMinor && cheapest.compareAtPriceMinor > cheapest.priceMinor
      ? cheapest.compareAtPriceMinor
      : null;
  const inStock = sellable.length > 0;

  const badges: CardBadge[] = [];
  if (!inStock) badges.push('tukendi');
  else {
    if (isNew(p)) badges.push('yeni');
    if (compareAtMinor) badges.push('indirim');
    if (p.bestSeller) badges.push('cok-satan');
  }

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    series: p.series,
    image: mediaUrl(p.images[0]?.src),
    imageAlt: p.images[0]?.alt || p.name,
    hoverImage: p.images[1] ? mediaUrl(p.images[1].src) : null,
    priceMinor,
    maxPriceMinor: max > priceMinor ? max : null,
    compareAtMinor,
    discountPercent: discountPercentMinor(priceMinor, compareAtMinor),
    inStock,
    badges,
    quickAddVariantId: active.length === 1 && inStock ? active[0].id : null,
    createdAt: p.createdAt,
    bestSeller: p.bestSeller,
    featured: p.featured,
  };
}

export function toDetail(p: AdminProduct): ProductDetailData {
  const active = p.variants.filter((v) => v.isActive);
  return {
    ...toCard(p),
    shortDescription: p.shortDescription,
    description: p.description,
    images: p.images.map((i) => ({ src: mediaUrl(i.src), alt: i.alt || p.name })),
    options: [...p.options]
      .sort((a, b) => a.order - b.order)
      .map((o) => ({ id: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, label: v.label })) })),
    variants: active.map((v) => ({
      id: v.id,
      sku: v.sku,
      optionValues: v.optionValues,
      label: variantLabel(p, v),
      priceMinor: v.priceMinor,
      compareAtMinor: v.compareAtPriceMinor && v.compareAtPriceMinor > v.priceMinor ? v.compareAtPriceMinor : null,
      inStock: variantInStock(v),
      stockLeft: v.trackStock === false ? null : Math.max(0, v.stock),
      image: v.image ? mediaUrl(v.image) : null,
      isDefault: v.isDefault,
    })),
    flavorNotes: p.flavorNotes,
    faq: p.faq.map((f) => ({ question: f.question, answer: f.answer })),
    categoryIds: p.categoryIds,
    tags: p.tags,
    seo: p.seo,
  };
}

export const SORTS = {
  onerilen: 'Önerilen',
  yeni: 'En yeni',
  'fiyat-artan': 'Fiyat: düşükten yükseğe',
  'fiyat-azalan': 'Fiyat: yüksekten düşüğe',
  'cok-satan': 'Çok satanlar',
} as const;
export type SortKey = keyof typeof SORTS;

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === 'string' && v in SORTS;
}

export function sortCards(cards: ProductCardData[], sort: SortKey): ProductCardData[] {
  const list = [...cards];
  const stockFirst = (a: ProductCardData, b: ProductCardData) => Number(b.inStock) - Number(a.inStock);
  switch (sort) {
    case 'yeni':
      return list.sort((a, b) => stockFirst(a, b) || b.createdAt.localeCompare(a.createdAt));
    case 'fiyat-artan':
      return list.sort((a, b) => stockFirst(a, b) || a.priceMinor - b.priceMinor);
    case 'fiyat-azalan':
      return list.sort((a, b) => stockFirst(a, b) || b.priceMinor - a.priceMinor);
    case 'cok-satan':
      return list.sort((a, b) => stockFirst(a, b) || Number(b.bestSeller) - Number(a.bestSeller));
    default:
      return list.sort(
        (a, b) =>
          stockFirst(a, b) ||
          Number(b.featured) - Number(a.featured) ||
          Number(b.bestSeller) - Number(a.bestSeller) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }
}
