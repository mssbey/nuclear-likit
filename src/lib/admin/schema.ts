// Paylaşılan Zod şemaları — hem istemci formu hem sunucu Route Handler'ları doğrular.

import { z } from 'zod';
import { CATALOG_SCHEMA_VERSION } from '@/types/admin';
import { flavorProfileIdSchema } from '@/lib/flavor-profiles';
import { DATE_ONLY } from '@/lib/new-badge';

// Tat profilleri panelden yönetilir; burada yalnız kimlik biçimi doğrulanır.
const flavorProfileSchema = flavorProfileIdSchema;

const badgeSchema = z.enum(['yeni', 'cok-satan', 'sinirli-seri', 'indirim']);
const formSchema = z.enum(['konsantre', 'shortfill', 'diy-kit', 'baz']);
const statusSchema = z.enum(['taslak', 'yayında', 'arşiv']);
const accentSchema = z.enum(['purple', 'gold', 'fresh', 'dark']);

const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug zorunlu')
  .max(80, 'Slug en fazla 80 karakter')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Yalnızca küçük harf, rakam ve tire kullanın');

const tasteSchema = z.object({
  sweetness: z.number().min(0).max(10),
  freshness: z.number().min(0).max(10),
  intensity: z.number().min(0).max(10),
  sourness: z.number().min(0).max(10),
  creaminess: z.number().min(0).max(10),
});

const flavorNoteSchema = z.object({
  label: z.string().trim().min(1),
  profile: flavorProfileSchema,
});

const faqItemSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

export const adminImageSchema = z.object({
  id: z.string().min(1),
  src: z.string().trim().min(1, 'Görsel yolu zorunlu'),
  alt: z.string().trim().min(1, 'Alternatif metin zorunlu'),
});

export const optionValueSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, 'Değer adı zorunlu').max(60),
});

export const productOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Seçenek adı zorunlu').max(60),
  values: z.array(optionValueSchema).max(24, 'En fazla 24 değer'),
  order: z.number().int().min(0),
});

export const adminVariantSchema = z.object({
  id: z.string().min(1),
  comboKey: z.string(),
  optionValues: z.record(z.string(), z.string()),
  sku: z.string().trim().max(64),
  priceMinor: z.number().int('Fiyat kuruş cinsinden tam sayı olmalı').min(0, 'Fiyat negatif olamaz').max(100_000_000),
  compareAtPriceMinor: z.number().int().min(0).max(100_000_000).nullable(),
  stock: z.number().int().min(0).max(1_000_000),
  barcode: z.string().trim().max(64).nullable(),
  image: z.string().trim().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

export const seoSchema = z.object({
  title: z.string().trim().max(70, 'SEO başlığı en fazla 70 karakter'),
  description: z.string().trim().max(180, 'SEO açıklaması en fazla 180 karakter'),
});

export const adminProductSchema = z
  .object({
    id: z.string().min(1),
    slug: slugSchema,
    name: z.string().trim().min(1, 'Ürün adı zorunlu').max(120),
    series: z.string().trim().max(80),
    shortDescription: z.string().trim().min(1, 'Kısa açıklama zorunlu').max(280),
    description: z.string().trim().max(6000),
    subcategory: z.string().trim().max(80),
    categoryIds: z.array(z.string().min(1)).min(1, 'En az bir kategori seçin'),
    collectionIds: z.array(z.string().min(1)),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    images: z.array(adminImageSchema),
    status: statusSchema,
    seo: seoSchema,
    flavorNotes: z.array(flavorNoteSchema).max(12),
    flavorProfiles: z.array(flavorProfileSchema).max(20),
    badges: z.array(badgeSchema).max(4),
    featured: z.boolean(),
    bestSeller: z.boolean(),
    newArrival: z.boolean(),
    newFrom: z.string().regex(DATE_ONLY, 'Geçersiz tarih').nullable().default(null),
    newUntil: z.string().regex(DATE_ONLY, 'Geçersiz tarih').nullable().default(null),
    taste: tasteSchema,
    form: formSchema,
    usageRate: z.string().trim().max(160),
    steepTime: z.string().trim().max(160),
    origin: z.string().trim().max(200),
    faq: z.array(faqItemSchema).max(20),
    options: z.array(productOptionSchema).max(6, 'En fazla 6 seçenek'),
    variants: z.array(adminVariantSchema).min(1, 'En az bir varyant gerekli'),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((product, ctx) => {
    if (product.newFrom && product.newUntil && product.newUntil < product.newFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bitiş tarihi başlangıçtan önce olamaz',
        path: ['newUntil'],
      });
    }
    const defaults = product.variants.filter((v) => v.isDefault);
    if (defaults.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tam olarak bir varsayılan varyant olmalı',
        path: ['variants'],
      });
    }
    if (defaults.length === 1 && !defaults[0].isActive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Varsayılan varyant pasif olamaz',
        path: ['variants'],
      });
    }
    const names = new Set<string>();
    for (const opt of product.options) {
      const key = opt.name.trim().toLocaleLowerCase('tr');
      if (names.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Seçenek adı tekrar ediyor: ${opt.name}`,
          path: ['options'],
        });
      }
      names.add(key);
    }
  });

export const adminCategorySchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  name: z.string().trim().min(1, 'Kategori adı zorunlu').max(80),
  // Slogan için karakter sınırı yok (veritabanında da metin alanı).
  tagline: z.string().trim(),
  description: z.string().trim().max(600),
  cover: z.string().trim().max(300),
  icon: z.string().trim().max(300),
  subcategories: z.array(z.string().trim().min(1).max(80)).max(40),
  // Eski kayıtlar/istemciler alanı hiç göndermeyebilir; yokluk = kök kategori.
  parentId: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  accent: accentSchema,
  // Sıra negatif olabilir: bir kaydı listenin başına sabitlemek için -1 gibi
  // değerler kullanılıyor (ör. puff-aromalar). min(0) kaydetmeyi engelliyordu.
  order: z.number().int(),
});

export const adminCollectionSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  name: z.string().trim().min(1, 'Koleksiyon adı zorunlu').max(80),
  subtitle: z.string().trim().max(160),
  description: z.string().trim().max(600),
  cover: z.string().trim().max(300),
  atmosphere: z.string().trim().max(200),
  order: z.number().int(),
});

export const catalogFileSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  updatedAt: z.string().min(1),
  categories: z.array(adminCategorySchema),
  collections: z.array(adminCollectionSchema),
  products: z.array(adminProductSchema),
});

// Yeni ürün formu: id/tarih alanları sunucuda üretildiği için opsiyonel giriş.
export const productDraftSchema = adminProductSchema;

export type AdminProductInput = z.infer<typeof adminProductSchema>;
export type AdminCategoryInput = z.infer<typeof adminCategorySchema>;
export type AdminCollectionInput = z.infer<typeof adminCollectionSchema>;
export type CatalogFileInput = z.infer<typeof catalogFileSchema>;

/** Zod hata listesini alan-yolu → mesaj sözlüğüne indirger. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
