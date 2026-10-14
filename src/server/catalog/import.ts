// Katalog içe aktarımı: JSON dosyasından veritabanına.
//
// İKİ YERDE KULLANILIR:
//   1. scripts/migrate-catalog-to-db.ts — tek seferlik geçiş (catalog.json)
//   2. prisma/seed.ts — "demo verisine sıfırla" (catalog.seed.json)
//
// Bu dosya `server-only` import ETMEZ; `PrismaClient`'ı parametre olarak alır,
// böylece hem Route Handler'lardan hem de tsx betiklerinden çağrılabilir.
//
// ÖNEMLİ: Bu fonksiyon ürünün alt kayıtlarını (varyant/görsel/seçenek) siler ve
// yeniden yazar. Normal panel düzenlemeleri için DEĞİL, yalnız içe aktarım/seed
// için kullanılır — varyant kimliklerine bağlı stok hareketleri bu yolla silinir.

import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { AdminProduct, CatalogFile } from '@/types/admin';
import { DEFAULT_STORE, type StoreId } from '@/lib/stores';
import { toMinor } from '@/lib/money';
import {
  categoryScalars,
  collectionScalars,
  productScalars,
} from './mapping';

// ------------------------------------------------- eski (TL) JSON şeması ---

// catalog.json fiyatları TL float olarak tutuyordu. Yeni model kuruş bekliyor;
// dönüşüm burada, tek noktada yapılır. Şema kasten gevşek: amaç doğrulama değil,
// dosyanın okunabilir olduğunu garanti etmek.
const legacyVariantSchema = z.object({
  id: z.string(),
  comboKey: z.string().default(''),
  optionValues: z.record(z.string(), z.string()).default({}),
  sku: z.string().default(''),
  price: z.number().default(0),
  compareAtPrice: z.number().nullable().default(null),
  stock: z.number().default(0),
  barcode: z.string().nullable().default(null),
  image: z.string().nullable().default(null),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const legacyProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  series: z.string().default(''),
  shortDescription: z.string().default(''),
  description: z.string().default(''),
  subcategory: z.string().default(''),
  categoryIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  images: z.array(z.object({ id: z.string(), src: z.string(), alt: z.string() })).default([]),
  status: z.string().default('yayında'),
  seo: z.object({ title: z.string().default(''), description: z.string().default('') }),
  flavorNotes: z.array(z.object({ label: z.string(), profile: z.string() })).default([]),
  flavorProfiles: z.array(z.string()).default([]),
  badges: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  bestSeller: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  newFrom: z.string().nullable().default(null),
  newUntil: z.string().nullable().default(null),
  taste: z.object({
    sweetness: z.number().default(0),
    freshness: z.number().default(0),
    intensity: z.number().default(0),
    sourness: z.number().default(0),
    creaminess: z.number().default(0),
  }),
  form: z.string().default('konsantre'),
  usageRate: z.string().default(''),
  steepTime: z.string().default(''),
  origin: z.string().default(''),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  options: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        order: z.number().default(0),
        values: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      }),
    )
    .default([]),
  variants: z.array(legacyVariantSchema).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export const legacyCatalogSchema = z.object({
  schemaVersion: z.number(),
  updatedAt: z.string(),
  categories: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      tagline: z.string().default(''),
      description: z.string().default(''),
      cover: z.string().default(''),
      icon: z.string().default(''),
      subcategories: z.array(z.string()).default([]),
      parentId: z.string().nullish().transform((v) => v ?? null),
      accent: z.string().default('purple'),
      order: z.number().default(0),
    }),
  ),
  collections: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      subtitle: z.string().default(''),
      description: z.string().default(''),
      cover: z.string().default(''),
      atmosphere: z.string().default(''),
      order: z.number().default(0),
    }),
  ),
  products: z.array(legacyProductSchema),
});

export type LegacyCatalog = z.infer<typeof legacyCatalogSchema>;

/** Eski TL fiyatlı kataloğu yeni (kuruş) modele çevirir. */
export function legacyToCatalog(legacy: LegacyCatalog): CatalogFile {
  return {
    schemaVersion: legacy.schemaVersion,
    updatedAt: legacy.updatedAt,
    categories: legacy.categories as CatalogFile['categories'],
    collections: legacy.collections as CatalogFile['collections'],
    products: legacy.products.map(
      (p): AdminProduct =>
        ({
          ...p,
          variants: p.variants.map((v) => ({
            id: v.id,
            comboKey: v.comboKey,
            optionValues: v.optionValues,
            sku: v.sku,
            priceMinor: toMinor(v.price),
            compareAtPriceMinor: v.compareAtPrice == null ? null : toMinor(v.compareAtPrice),
            stock: v.stock,
            barcode: v.barcode,
            image: v.image,
            isDefault: v.isDefault,
            isActive: v.isActive,
          })),
        }) as AdminProduct,
    ),
  };
}

// ------------------------------------------------------------ içe aktarım ---

export interface ImportReport {
  categories: number;
  collections: number;
  products: number;
  variants: number;
  images: number;
  options: number;
  optionValues: number;
  /** Doğrulama toplamı: tüm varyant fiyatlarının kuruş toplamı. */
  totalPriceMinor: number;
  /** Toplam stok adedi. */
  totalStock: number;
}

export function reportOf(catalog: CatalogFile): ImportReport {
  const variants = catalog.products.flatMap((p) => p.variants);
  return {
    categories: catalog.categories.length,
    collections: catalog.collections.length,
    products: catalog.products.length,
    variants: variants.length,
    images: catalog.products.reduce((s, p) => s + p.images.length, 0),
    options: catalog.products.reduce((s, p) => s + p.options.length, 0),
    optionValues: catalog.products.reduce(
      (s, p) => s + p.options.reduce((n, o) => n + o.values.length, 0),
      0,
    ),
    totalPriceMinor: variants.reduce((s, v) => s + v.priceMinor, 0),
    totalStock: variants.reduce((s, v) => s + v.stock, 0),
  };
}

/**
 * Bir mağazanın katalog tablolarını boşaltır (yabancı anahtar sırasına dikkat
 * ederek). Diğer mağazaların kayıtlarına dokunmaz.
 */
export async function wipeCatalog(db: PrismaClient, store: StoreId = DEFAULT_STORE): Promise<void> {
  // Alt kayıtlar `onDelete: Cascade` ile bağlı; yine de sıra açıkça yazılır ki
  // Postgres'e geçişte davranış aynı kalsın.
  const product = { store };
  await db.optionValue.deleteMany({ where: { option: { product } } });
  await db.productOption.deleteMany({ where: { product } });
  await db.productImage.deleteMany({ where: { product } });
  await db.variant.deleteMany({ where: { product } });
  await db.productCategory.deleteMany({ where: { product } });
  await db.productCollection.deleteMany({ where: { product } });
  await db.product.deleteMany({ where: { store } });
  await db.category.deleteMany({ where: { store } });
  await db.collection.deleteMany({ where: { store } });
}

/**
 * Kataloğu veritabanına yazar. Idempotenttir: aynı dosyayla iki kez
 * çalıştırıldığında sonuç aynıdır (kayıtlar `id` üzerinden upsert edilir).
 */
export async function importCatalog(
  db: PrismaClient,
  catalog: CatalogFile,
  options: { wipe?: boolean; store?: StoreId } = {},
): Promise<ImportReport> {
  const store = options.store ?? DEFAULT_STORE;
  if (options.wipe) await wipeCatalog(db, store);

  for (const c of catalog.categories) {
    const data = categoryScalars(c);
    await db.category.upsert({ where: { id: c.id }, create: { id: c.id, store, ...data }, update: data });
  }

  for (const c of catalog.collections) {
    const data = collectionScalars(c);
    await db.collection.upsert({
      where: { id: c.id },
      create: { id: c.id, store, ...data },
      update: data,
    });
  }

  const categoryIds = new Set(catalog.categories.map((c) => c.id));
  const collectionIds = new Set(catalog.collections.map((c) => c.id));

  for (const p of catalog.products) {
    const scalars = productScalars(p);

    await db.$transaction(async (tx) => {
      await tx.product.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          store,
          ...scalars,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        },
        update: scalars,
      });

      // Alt kayıtlar tamamen yeniden yazılır — içe aktarım kaynağı otoritedir.
      await tx.optionValue.deleteMany({ where: { option: { productId: p.id } } });
      await tx.productOption.deleteMany({ where: { productId: p.id } });
      await tx.productImage.deleteMany({ where: { productId: p.id } });
      await tx.variant.deleteMany({ where: { productId: p.id } });
      await tx.productCategory.deleteMany({ where: { productId: p.id } });
      await tx.productCollection.deleteMany({ where: { productId: p.id } });

      if (p.images.length) {
        await tx.productImage.createMany({
          data: p.images.map((img, i) => ({
            id: img.id,
            productId: p.id,
            src: img.src,
            alt: img.alt,
            position: i,
          })),
        });
      }

      for (const [i, opt] of p.options.entries()) {
        // Seçenek kimlikleri ürünler arasında tekrar ettiği için (opt-hacim 100
        // üründe geçiyor) birincil anahtarı veritabanı üretir; ürün içi kimlik
        // `localId` sütununda saklanır.
        const created = await tx.productOption.create({
          data: { productId: p.id, localId: opt.id, name: opt.name, position: opt.order ?? i },
        });
        if (opt.values.length) {
          await tx.optionValue.createMany({
            data: opt.values.map((val, vi) => ({
              optionId: created.id,
              localId: val.id,
              label: val.label,
              position: vi,
            })),
          });
        }
      }

      if (p.variants.length) {
        await tx.variant.createMany({
          data: p.variants.map((v, i) => ({
            id: v.id,
            productId: p.id,
            comboKey: v.comboKey,
            optionValues: v.optionValues,
            sku: v.sku,
            priceMinor: v.priceMinor,
            compareAtPriceMinor: v.compareAtPriceMinor,
            stock: v.stock,
            barcode: v.barcode,
            image: v.image,
            isDefault: v.isDefault,
            isActive: v.isActive,
            position: i,
          })),
        });
      }

      // Vitrin birincil kategoriyi position=0'dan okur; sıra korunmalı.
      const cats = p.categoryIds.filter((id) => categoryIds.has(id));
      if (cats.length) {
        await tx.productCategory.createMany({
          data: cats.map((categoryId, i) => ({ productId: p.id, categoryId, position: i })),
        });
      }

      const cols = p.collectionIds.filter((id) => collectionIds.has(id));
      if (cols.length) {
        await tx.productCollection.createMany({
          data: cols.map((collectionId, i) => ({ productId: p.id, collectionId, position: i })),
        });
      }
    }, { maxWait: 15_000, timeout: 60_000 }); // uzak DB (Neon) gecikmesi: varsayılan 5 sn yetmiyor
  }

  return reportOf(catalog);
}
