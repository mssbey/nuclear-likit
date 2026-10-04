// Merkezi tip tanımları — Nefis Aroma
// Backend bağlanınca bu tipler API sözleşmesine dönüştürülebilir.

/** Kategori/koleksiyon listesi veritabanından gelir; slug sabit bir küme değildir. */
export type CategorySlug = string;

export type CollectionSlug = string;

/** Tat profili kimliği (slug) — liste panelden yönetilir, bkz. `lib/flavor-profiles.ts`. */
export type FlavorProfile = string;

export type ProductForm = 'konsantre' | 'shortfill' | 'diy-kit' | 'baz';

export type BadgeKind = 'yeni' | 'cok-satan' | 'sinirli-seri' | 'indirim';

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

/**
 * Hacim seçeneğinin etiketi — serbest metin ("10ml", "15ml",
 * "30ml DIY Kit (9ml aroma)"). Sıralama admin'deki seçenek sırasını izler.
 */
export type VariantVolume = string;
export type VariantType = 'Konsantre Aroma' | 'DIY Kit' | 'Shortfill' | 'Mix Aroma';
export type VariantIntensity = 'Standart' | 'Yoğun' | 'Extra Fresh';

export interface ProductVariant {
  id: string;
  sku: string;
  volume: VariantVolume;
  type: VariantType;
  intensity: VariantIntensity;
  price: number;
  oldPrice?: number;
  stock: StockStatus;
  stockCount: number;
  image: string;
  onSale: boolean;
  /** Seçenek kimliği → değer kimliği (paneldeki seçenek matrisi). */
  selection: Record<string, string>;
  /** Seçenek değerlerinin sırayla birleşimi: "250 ML / 3 Mg / %100 VG". */
  label: string;
}

/** Ürün sayfasında bir seçenek satırı (Hacim, Sertlik, VG / PG Oranı…). */
export interface ProductOptionGroup {
  id: string;
  name: string;
  values: { id: string; label: string }[];
}

export interface FlavorNote {
  label: string;
  /** tat ailesi rengi için */
  profile: FlavorProfile;
}

export interface TasteRadar {
  sweetness: number; // 0-10
  freshness: number;
  intensity: number;
  sourness: number;
  creaminess: number;
}

export interface ProductFaqItem {
  question: string;
  answer: string;
}

export interface ProductImage {
  src: string;
  alt: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  series: string; // marka/seri adı, ör. "Signature", "Lab Serisi"
  shortDescription: string;
  longDescription: string;
  /** Arama motoru başlığı/açıklaması (panelden; boşsa açıklamadan üretilir). */
  seo?: { title: string; description: string };
  /** Birincil kategori (paneldeki ilk sıradaki). */
  category: CategorySlug;
  /** Ürünün bağlı olduğu tüm kategoriler (birincil dahil). */
  categories: CategorySlug[];
  subcategory: string;
  collection?: CollectionSlug;
  /** Ürünün bağlı olduğu tüm koleksiyonlar. */
  collections: CollectionSlug[];
  flavorNotes: FlavorNote[];
  flavorProfiles: FlavorProfile[];
  badges: BadgeKind[];
  images: ProductImage[];
  gallery: ProductImage[];
  /** true: panelden görsel yüklenmemiş; nötr "Görsel yok" yer tutucusu gösteriliyor. */
  noPhoto: boolean;
  videoPlaceholder?: string;
  basePrice: number;
  oldPrice?: number;
  rating: number; // 0-5
  reviewCount: number;
  stockStatus: StockStatus;
  ingredientsNote: string; // içerik bilgisi placeholder
  usageRate: string; // aroma kullanım oranı, ör. "%8 - %12"
  steepTime: string; // önerilen bekleme/demlenme
  origin: string; // menşei — düzenlenebilir placeholder
  storage: string;
  warnings: string;
  taste: TasteRadar;
  form: ProductForm;
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  /** Paneldeki seçenekler, paneldeki sırayla. Seçeneksiz üründe boş. */
  options: ProductOptionGroup[];
  variants: ProductVariant[];
  relatedProductIds: string[];
  faq: ProductFaqItem[];
}

export interface Category {
  slug: CategorySlug;
  name: string;
  tagline: string;
  description: string;
  cover: string;
  icon: string;
  subcategories: string[];
  /** Üst kategorinin slug'ı; kök kategorilerde null. */
  parentSlug: CategorySlug | null;
  accent: 'purple' | 'gold' | 'fresh' | 'dark';
}

export interface Collection {
  slug: CollectionSlug;
  name: string;
  subtitle: string;
  description: string;
  cover: string;
  atmosphere: string;
}

export interface CartLine {
  key: string; // productId + variantId
  productId: string;
  variantId: string;
  qty: number;
  addedAt: number;
}

export interface CartLineDetailed extends CartLine {
  product: Product;
  variant: ProductVariant;
  lineTotal: number;
  lineOldTotal: number;
}

