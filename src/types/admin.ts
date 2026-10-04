// Admin paneli veri modeli — vitrin tarafındaki `Product` tipini bozmadan genişletir.
// Kaynak: veritabanı (Prisma). Vitrin, src/data/catalog-adapter.ts üzerinden
// bu modeli mevcut `Product` tipine indirger. Fiyatlar KURUŞ cinsindendir.

import type {
  BadgeKind,
  FlavorNote,
  FlavorProfile,
  ProductFaqItem,
  ProductForm,
  TasteRadar,
} from '@/types';

export const CATALOG_SCHEMA_VERSION = 1;

export type ProductStatus = 'taslak' | 'yayında' | 'arşiv';

export const productStatuses: ProductStatus[] = ['taslak', 'yayında', 'arşiv'];

export const statusLabels: Record<ProductStatus, string> = {
  taslak: 'Taslak',
  yayında: 'Yayında',
  arşiv: 'Arşiv',
};

export interface AdminImage {
  id: string;
  src: string;
  /** alt metni zorunlu — boş kaydedilemez */
  alt: string;
}

export interface OptionValue {
  id: string;
  label: string;
}

/** Ürün bazında seçenek tanımı: ör. "Aroma" → Vanilya / Fındık */
export interface ProductOption {
  id: string;
  name: string;
  values: OptionValue[];
  order: number;
}

/** Seçenek kombinasyonundan üretilen varyant. */
export interface AdminVariant {
  id: string;
  /**
   * Kombinasyon anahtarı: seçenek sırasına göre "optionId:valueId|optionId:valueId".
   * Seçeneksiz ürünlerde boş string. Matris yeniden üretilirken eşleştirme bununla yapılır.
   */
  comboKey: string;
  /** optionId -> valueId */
  optionValues: Record<string, string>;
  sku: string;
  /** Tam sayı KURUŞ (12990 = 129,90 ₺). Asla float tutulmaz. */
  priceMinor: number;
  /** Üstü çizili karşılaştırma fiyatı, kuruş. İndirim yoksa null. */
  compareAtPriceMinor: number | null;
  /**
   * Stok takibi (Stok Yönetimi ekranından yönetilir; ürün düzenleyici yazmaz).
   * false ise `stock` kullanılmaz, satılabilirlik `inStock` ile belirlenir.
   */
  trackStock?: boolean;
  inStock?: boolean;
  stock: number;
  barcode: string | null;
  image: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface AdminSeo {
  title: string;
  description: string;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  series: string;
  shortDescription: string;
  description: string;
  subcategory: string;
  categoryIds: string[];
  collectionIds: string[];
  tags: string[];
  images: AdminImage[];
  status: ProductStatus;
  seo: AdminSeo;
  flavorNotes: FlavorNote[];
  flavorProfiles: FlavorProfile[];
  badges: BadgeKind[];
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  /** "Yeni" damgası başlangıç/bitiş günü ('YYYY-MM-DD', TR takvimi). Boşsa süresiz. */
  newFrom: string | null;
  newUntil: string | null;
  taste: TasteRadar;
  form: ProductForm;
  /** Vitrinde placeholder gösterilir; admin tarafında düzenlenebilir bilgi olarak tutulur. */
  usageRate: string;
  steepTime: string;
  origin: string;
  /** Vitrin FAQ sekmesi için taşınan içerik (şimdilik düzenlenmiyor). */
  faq: ProductFaqItem[];
  options: ProductOption[];
  variants: AdminVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  cover: string;
  icon: string;
  /** Serbest metin alt kategori etiketleri (ürün filtresi) — kategori ağacından ayrıdır. */
  subcategories: string[];
  /** Üst kategori kimliği; kök kategorilerde null. */
  parentId: string | null;
  accent: 'purple' | 'gold' | 'fresh' | 'dark';
  order: number;
}

export interface AdminCollection {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  cover: string;
  atmosphere: string;
  order: number;
}

export interface CatalogFile {
  schemaVersion: number;
  updatedAt: string;
  categories: AdminCategory[];
  collections: AdminCollection[];
  products: AdminProduct[];
}

/** Liste uçları için sorgu sonucu zarfı. */
export interface ProductListResult {
  items: AdminProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminMutationMeta {
  /** Sunucu yazmaya açık mı (NODE_ENV !== production veya ADMIN_WRITE_ENABLED=true). */
  canWrite: boolean;
}
