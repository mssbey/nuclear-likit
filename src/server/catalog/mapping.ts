// Veritabanı satırları ↔ uygulama modeli (`AdminProduct` / `AdminCategory` /
// `AdminCollection`) dönüşümü.
//
// Bu dosya BİLEREK `server-only` import ETMEZ ve `db.ts`'e bağlı değildir:
// hem Route Handler'lar hem de `scripts/*.ts` (tsx ile Node'da çalışan)
// betikler aynı dönüşümü kullanabilsin diye saf tutulmuştur.

import type {
  AdminCategory,
  AdminCollection,
  AdminImage,
  AdminProduct,
  AdminVariant,
  ProductOption,
  ProductStatus,
} from '@/types/admin';
import type {
  BadgeKind,
  FlavorNote,
  FlavorProfile,
  ProductFaqItem,
  ProductForm,
} from '@/types';
import type { Prisma } from '@/generated/prisma/client';
import { toTrDay, trDayEnd, trDayStart } from '@/lib/new-badge';

/**
 * `Json` sütunlarına yazarken tip köprüsü. Uygulama tipleri (FlavorNote[] gibi)
 * yapısal olarak JSON'dur ama Prisma'nın `InputJsonValue` tipi dizin imzası
 * ister; dönüşüm burada tek noktada yapılır.
 */
const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

// ------------------------------------------------------------ Json yardımı --

/**
 * Prisma `Json` sütunları `unknown` döner. SQLite/Postgres arasında taşınabilir
 * olsun diye dizi/nesne okumaları tek noktadan ve savunmacı yapılır: bozuk veri
 * uygulamayı düşürmez, boş değere düşer.
 */
export function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function jsonRecord(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

// ------------------------------------------------------- DB satır tipleri ---

/** `include` ile çekilen ürün satırının ihtiyaç duyulan alanları. */
export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  series: string;
  shortDescription: string;
  description: string;
  subcategory: string;
  status: string;
  seoTitle: string;
  seoDescription: string;
  tags: unknown;
  flavorNotes: unknown;
  flavorProfiles: unknown;
  badges: unknown;
  faq: unknown;
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  newFrom: Date | null;
  newUntil: Date | null;
  tasteSweetness: number;
  tasteFreshness: number;
  tasteIntensity: number;
  tasteSourness: number;
  tasteCreaminess: number;
  form: string;
  usageRate: string;
  steepTime: string;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
  images: { id: string; src: string; alt: string; position: number }[];
  options: {
    id: string;
    /** Ürün içi kimlik — `variant.optionValues` ve `comboKey` buna referans verir. */
    localId: string;
    name: string;
    position: number;
    values: { id: string; localId: string; label: string; position: number }[];
  }[];
  variants: {
    id: string;
    comboKey: string;
    optionValues: unknown;
    sku: string;
    priceMinor: number;
    compareAtPriceMinor: number | null;
    stock: number;
    trackStock?: boolean;
    inStock?: boolean;
    barcode: string | null;
    image: string | null;
    isDefault: boolean;
    isActive: boolean;
    position: number;
  }[];
  categories: { categoryId: string; position: number }[];
  collections: { collectionId: string; position: number }[];
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  cover: string;
  icon: string;
  subcategories: unknown;
  parentId: string | null;
  accent: string;
  sortOrder: number;
}

export interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  cover: string;
  atmosphere: string;
  sortOrder: number;
}

/** Ürünü ilişkileriyle çekmek için ortak `include` — tek yerden yönetilir. */
export const productInclude = {
  images: { orderBy: { position: 'asc' } },
  options: {
    orderBy: { position: 'asc' },
    include: { values: { orderBy: { position: 'asc' } } },
  },
  variants: { orderBy: { position: 'asc' } },
  categories: { orderBy: { position: 'asc' } },
  collections: { orderBy: { position: 'asc' } },
} as const;

// ------------------------------------------------------------ DB → model ---

function toVariant(row: ProductRow['variants'][number]): AdminVariant {
  return {
    id: row.id,
    comboKey: row.comboKey,
    optionValues: jsonRecord(row.optionValues),
    sku: row.sku,
    priceMinor: row.priceMinor,
    compareAtPriceMinor: row.compareAtPriceMinor,
    stock: row.stock,
    trackStock: row.trackStock ?? true,
    inStock: row.inStock ?? true,
    barcode: row.barcode,
    image: row.image,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

function toOption(row: ProductRow['options'][number]): ProductOption {
  // Uygulama modeli ürün içi kimlikleri kullanır; veritabanı birincil anahtarı
  // (cuid) dışarı sızmaz — aksi halde varyantların optionValues eşlemesi kırılır.
  return {
    id: row.localId,
    name: row.name,
    order: row.position,
    values: row.values.map((v) => ({ id: v.localId, label: v.label })),
  };
}

function toImage(row: ProductRow['images'][number]): AdminImage {
  return { id: row.id, src: row.src, alt: row.alt };
}

export function rowToProduct(row: ProductRow): AdminProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    series: row.series,
    shortDescription: row.shortDescription,
    description: row.description,
    subcategory: row.subcategory,
    categoryIds: row.categories.map((c) => c.categoryId),
    collectionIds: row.collections.map((c) => c.collectionId),
    tags: jsonArray<string>(row.tags),
    images: row.images.map(toImage),
    status: row.status as ProductStatus,
    seo: { title: row.seoTitle, description: row.seoDescription },
    flavorNotes: jsonArray<FlavorNote>(row.flavorNotes),
    flavorProfiles: jsonArray<FlavorProfile>(row.flavorProfiles),
    badges: jsonArray<BadgeKind>(row.badges),
    featured: row.featured,
    bestSeller: row.bestSeller,
    newArrival: row.newArrival,
    newFrom: row.newFrom ? toTrDay(row.newFrom) : null,
    newUntil: row.newUntil ? toTrDay(row.newUntil) : null,
    taste: {
      sweetness: row.tasteSweetness,
      freshness: row.tasteFreshness,
      intensity: row.tasteIntensity,
      sourness: row.tasteSourness,
      creaminess: row.tasteCreaminess,
    },
    form: row.form as ProductForm,
    usageRate: row.usageRate,
    steepTime: row.steepTime,
    origin: row.origin,
    faq: jsonArray<ProductFaqItem>(row.faq),
    options: row.options.map(toOption),
    variants: row.variants.map(toVariant),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToCategory(row: CategoryRow): AdminCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    cover: row.cover,
    icon: row.icon,
    subcategories: jsonArray<string>(row.subcategories),
    parentId: row.parentId ?? null,
    accent: row.accent as AdminCategory['accent'],
    order: row.sortOrder,
  };
}

export function rowToCollection(row: CollectionRow): AdminCollection {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    cover: row.cover,
    atmosphere: row.atmosphere,
    order: row.sortOrder,
  };
}

// ------------------------------------------------------------ model → DB ---

/** `Product` tablosunun skaler alanları (ilişkiler hariç). */
export function productScalars(p: AdminProduct) {
  return {
    slug: p.slug,
    name: p.name,
    series: p.series,
    shortDescription: p.shortDescription,
    description: p.description,
    subcategory: p.subcategory,
    status: p.status,
    seoTitle: p.seo.title,
    seoDescription: p.seo.description,
    tags: asJson(p.tags),
    flavorNotes: asJson(p.flavorNotes),
    flavorProfiles: asJson(p.flavorProfiles),
    badges: asJson(p.badges),
    faq: asJson(p.faq),
    featured: p.featured,
    bestSeller: p.bestSeller,
    newArrival: p.newArrival,
    newFrom: p.newFrom ? trDayStart(p.newFrom) : null,
    newUntil: p.newUntil ? trDayEnd(p.newUntil) : null,
    tasteSweetness: p.taste.sweetness,
    tasteFreshness: p.taste.freshness,
    tasteIntensity: p.taste.intensity,
    tasteSourness: p.taste.sourness,
    tasteCreaminess: p.taste.creaminess,
    form: p.form,
    usageRate: p.usageRate,
    steepTime: p.steepTime,
    origin: p.origin,
  };
}

export function categoryScalars(c: AdminCategory) {
  return {
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    cover: c.cover,
    icon: c.icon,
    subcategories: asJson(c.subcategories),
    parentId: c.parentId ?? null,
    accent: c.accent,
    sortOrder: c.order,
  };
}

export function collectionScalars(c: AdminCollection) {
  return {
    slug: c.slug,
    name: c.name,
    subtitle: c.subtitle,
    description: c.description,
    cover: c.cover,
    atmosphere: c.atmosphere,
    sortOrder: c.order,
  };
}
