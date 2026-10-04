// Katalog yazma katmanı — `src/lib/admin/store.ts` (dosya yazımı) yerine geçer.
//
// TASARIM: Doğrulama ve normalizasyon mantığı `src/lib/admin/mutations.ts`
// içindeki SAF fonksiyonlarda kalır (slug tekilliği, varyant matrisi, tek
// varsayılan varyant, kategori varlığı). Route Handler'lar şu akışı izler:
//
//   1. `readCatalog()`   → veritabanından tam katalog (doğrulama bağlamı)
//   2. saf mutasyon      → yeni CatalogFile + etkilenen kayıt
//   3. `saveProduct(...)`→ YALNIZCA etkilenen kaydı veritabanına yazar
//
// Böylece davranış dosya tabanlı sürümle birebir aynı kalır ama yazma
// dar kapsamlıdır: varyant kimlikleri (ve onlara bağlı stok hareketleri)
// gereksiz yere silinmez.

import 'server-only';
import type {
  AdminCategory,
  AdminCollection,
  AdminProduct,
  CatalogFile,
} from '@/types/admin';
import { CATALOG_SCHEMA_VERSION } from '@/types/admin';
import { AdminError } from '@/lib/admin/mutations';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import {
  categoryScalars,
  collectionScalars,
  productScalars,
  rowToCategory,
  rowToCollection,
  rowToProduct,
} from './mapping';
import { loadProductRows } from './load';
import { revalidateCatalog } from './queries';

/** Veritabanındaki kataloğun tamamı — saf mutasyonların çalışma bağlamı. */
export async function readCatalog(): Promise<CatalogFile> {
  const store = currentStore();
  const [products, categories, collections] = await Promise.all([
    loadProductRows({ store }),
    db.category.findMany({ where: { store }, orderBy: { sortOrder: 'asc' } }),
    db.collection.findMany({ where: { store }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    products: products.map(rowToProduct),
    categories: categories.map(rowToCategory),
    collections: collections.map(rowToCollection),
  };
}

/**
 * Kataloğun ürün işlemleri için yeten DİLİMİ: tüm kategori/koleksiyonlar +
 * yalnızca kimliği ya da slug'ı verilen ürünler.
 *
 * `createProduct` / `updateProduct` / `deleteProduct` saf mutasyonları ürün
 * listesini yalnızca slug/kimlik çakışması ve kategori doğrulaması için
 * kullanır; 900+ ürünü alt kayıtlarıyla uzak veritabanından çekmek (15–20 sn)
 * hem gereksizdir hem de sunucusuz ortamda fonksiyon zaman aşımına yol açar.
 */
export async function readCatalogSlice(match: {
  productIds?: string[];
  slugs?: string[];
}): Promise<CatalogFile> {
  const ids = (match.productIds ?? []).filter(Boolean);
  const slugs = (match.slugs ?? []).filter(Boolean);
  const or = [
    ...(ids.length ? [{ id: { in: ids } }] : []),
    ...(slugs.length ? [{ slug: { in: slugs } }] : []),
  ];

  // Ürünler mağaza filtresi OLMADAN eşlenir: slug ve kimlik tüm mağazalarda
  // tekildir, saf mutasyon başka mağazadaki aynı slug'ı da çakışma saymalı.
  // Kategoriler ise yalnız bu mağazanınkiler — ürün başka mağazanın
  // kategorisine bağlanamaz.
  const store = currentStore();
  const [products, categories, collections] = await Promise.all([
    or.length ? loadProductRows({ OR: or }) : Promise.resolve([]),
    db.category.findMany({ where: { store }, orderBy: { sortOrder: 'asc' } }),
    db.collection.findMany({ where: { store }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    products: products.map(rowToProduct),
    categories: categories.map(rowToCategory),
    collections: collections.map(rowToCollection),
  };
}

// ------------------------------------------------------------ mağaza ayrımı ---

/** Kayıt başka mağazaya aitse yazma reddedilir (kimlikler tüm mağazalarda tekildir). */
function assertSameStore(owner: { store: string } | null, store: string, label: string): void {
  if (owner && owner.store !== store) {
    throw new AdminError(`${label} başka bir mağazaya ait; bu mağazadan düzenlenemez.`, 409);
  }
}

/** Slug tüm mağazalarda tekildir; başka mağazadaki çakışma anlaşılır bir 409'a çevrilir. */
async function uniqueSlug<T>(label: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AdminError(`${label} kısa adı (slug) başka bir mağazada kullanılıyor; farklı bir slug girin.`, 409, {
        slug: 'Bu slug kullanılıyor',
      });
    }
    throw err;
  }
}

// ------------------------------------------------------------------ ürün ----

/**
 * Ürünü ve alt kayıtlarını yazar.
 *
 * Varyantlar `id` üzerinden upsert edilir; artık bulunmayanlar silinir. Bu
 * önemlidir: `StockMovement` ve `OrderItem` varyant kimliğine bağlıdır, o
 * yüzden "hepsini sil, yeniden yaz" yapılmaz.
 */
export interface SaveActor {
  /** Stok farkı hareket kaydına "işlemi yapan" olarak yazılır. */
  userId?: string | null;
  /** Hareket notu — ör. "Ürün düzenleme", "CSV aktarımı". */
  stockNote?: string;
  stockReason?: string;
}

export async function saveProduct(product: AdminProduct, actor: SaveActor = {}): Promise<void> {
  const scalars = productScalars(product);

  // Uzak veritabanında (Neon / Prisma Postgres) ~12 sıralı sorgu Prisma'nın
  // varsayılan 5 sn'lik etkileşimli transaction süresini aşabiliyor;
  // "Transaction already closed" ile kayıt yarım kalmasın.
  const limits = { maxWait: 10_000, timeout: 60_000 };

  const store = currentStore();
  await db.$transaction(async (tx) => {
    const owner = await tx.product.findUnique({ where: { id: product.id }, select: { store: true } });
    assertSameStore(owner, store, 'Ürün');
    await tx.product.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        store,
        ...scalars,
        createdAt: new Date(product.createdAt),
        updatedAt: new Date(product.updatedAt),
      },
      update: { ...scalars, updatedAt: new Date(product.updatedAt) },
    });

    // --- görseller: kimliğe göre upsert, kalanları sil
    const imageIds = product.images.map((i) => i.id);
    await tx.productImage.deleteMany({
      where: { productId: product.id, id: { notIn: imageIds.length ? imageIds : ['__yok__'] } },
    });
    for (const [i, img] of product.images.entries()) {
      await tx.productImage.upsert({
        where: { id: img.id },
        create: { id: img.id, productId: product.id, src: img.src, alt: img.alt, position: i },
        update: { src: img.src, alt: img.alt, position: i },
      });
    }

    // --- seçenekler: ürün içi `localId` ile eşleştirilir
    const optionLocalIds = product.options.map((o) => o.id);
    await tx.productOption.deleteMany({
      where: {
        productId: product.id,
        localId: { notIn: optionLocalIds.length ? optionLocalIds : ['__yok__'] },
      },
    });

    for (const [i, opt] of product.options.entries()) {
      const savedOption = await tx.productOption.upsert({
        where: { productId_localId: { productId: product.id, localId: opt.id } },
        create: { productId: product.id, localId: opt.id, name: opt.name, position: i },
        update: { name: opt.name, position: i },
      });

      const valueLocalIds = opt.values.map((v) => v.id);
      await tx.optionValue.deleteMany({
        where: {
          optionId: savedOption.id,
          localId: { notIn: valueLocalIds.length ? valueLocalIds : ['__yok__'] },
        },
      });
      for (const [vi, val] of opt.values.entries()) {
        await tx.optionValue.upsert({
          where: { optionId_localId: { optionId: savedOption.id, localId: val.id } },
          create: { optionId: savedOption.id, localId: val.id, label: val.label, position: vi },
          update: { label: val.label, position: vi },
        });
      }
    }

    // --- varyantlar
    // Stok farkları geçmişe yazılsın diye mevcut adetler önce okunur.
    const stockBefore = new Map(
      (
        await tx.variant.findMany({ where: { productId: product.id }, select: { id: true, stock: true } })
      ).map((v) => [v.id, v.stock]),
    );
    const variantIds = product.variants.map((v) => v.id);
    await tx.variant.deleteMany({
      where: {
        productId: product.id,
        id: { notIn: variantIds.length ? variantIds : ['__yok__'] },
      },
    });
    for (const [i, v] of product.variants.entries()) {
      const data = {
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
      };
      await tx.variant.upsert({
        where: { id: v.id },
        create: { id: v.id, productId: product.id, ...data },
        update: data,
      });
      const prev = stockBefore.get(v.id);
      if (prev !== undefined && prev !== v.stock) {
        await tx.stockMovement.create({
          data: {
            variantId: v.id,
            delta: v.stock - prev,
            reason: actor.stockReason ?? 'manuel',
            note: actor.stockNote ?? 'Ürün düzenleme',
            stockAfter: v.stock,
            createdByUserId: actor.userId ?? null,
          },
        });
      }
    }

    // --- kategori / koleksiyon bağları (sıra korunur: position 0 birincildir)
    await tx.productCategory.deleteMany({ where: { productId: product.id } });
    if (product.categoryIds.length) {
      await tx.productCategory.createMany({
        data: product.categoryIds.map((categoryId, i) => ({
          productId: product.id,
          categoryId,
          position: i,
        })),
      });
    }

    await tx.productCollection.deleteMany({ where: { productId: product.id } });
    if (product.collectionIds.length) {
      await tx.productCollection.createMany({
        data: product.collectionIds.map((collectionId, i) => ({
          productId: product.id,
          collectionId,
          position: i,
        })),
      });
    }
  }, limits);

  revalidateCatalog();
}

/** Toplu işlemler için — yalnız değişen ürünleri yazar. */
export async function saveProducts(products: AdminProduct[], actor: SaveActor = {}): Promise<void> {
  for (const p of products) await saveProduct(p, actor);
}

/** Yalnız SEO sütunlarını yazar — toplu SEO doldurma yüzlerce üründe hızlı kalsın. */
export async function saveProductSeo(products: AdminProduct[]): Promise<void> {
  if (products.length === 0) return;
  await db.$transaction(
    products.map((p) =>
      db.product.update({
        where: { id: p.id, store: currentStore() },
        data: { seoTitle: p.seo.title, seoDescription: p.seo.description },
      }),
    ),
  );
  revalidateCatalog();
}

// -------------------------------------------------------------- taksonomi ---

export async function saveCategory(category: AdminCategory): Promise<void> {
  const data = categoryScalars(category);
  const store = currentStore();
  assertSameStore(await db.category.findUnique({ where: { id: category.id }, select: { store: true } }), store, 'Kategori');
  await uniqueSlug('Kategori', () =>
    db.category.upsert({
      where: { id: category.id },
      create: { id: category.id, store, ...data },
      update: data,
    }),
  );
  revalidateCatalog();
}

/**
 * Kategoriyi siler. WordPress gibi, altındaki kategoriler silinmez; silinen
 * kategorinin üstüne (yoksa köke) taşınır.
 */
export async function removeCategory(id: string, newParentId: string | null = null): Promise<void> {
  const store = currentStore();
  await db.$transaction([
    db.category.updateMany({ where: { parentId: id, store }, data: { parentId: newParentId } }),
    db.category.delete({ where: { id, store } }),
  ]);
  revalidateCatalog();
}

export async function saveCollection(collection: AdminCollection): Promise<void> {
  const data = collectionScalars(collection);
  const store = currentStore();
  assertSameStore(await db.collection.findUnique({ where: { id: collection.id }, select: { store: true } }), store, 'Koleksiyon');
  await uniqueSlug('Koleksiyon', () =>
    db.collection.upsert({
      where: { id: collection.id },
      create: { id: collection.id, store, ...data },
      update: data,
    }),
  );
  revalidateCatalog();
}

export async function removeCollection(id: string): Promise<void> {
  await db.collection.delete({ where: { id, store: currentStore() } });
  revalidateCatalog();
}

/** Sıralamayı toplu yazar (sürükle-bırak sonrası). */
export async function saveCategoryOrder(categories: AdminCategory[]): Promise<void> {
  await db.$transaction(
    categories.map((c) =>
      db.category.update({ where: { id: c.id, store: currentStore() }, data: { sortOrder: c.order } }),
    ),
  );
  revalidateCatalog();
}

export async function saveCollectionOrder(collections: AdminCollection[]): Promise<void> {
  await db.$transaction(
    collections.map((c) =>
      db.collection.update({ where: { id: c.id, store: currentStore() }, data: { sortOrder: c.order } }),
    ),
  );
  revalidateCatalog();
}

/** Ebeveynleri çocuklarından önce sıralar (FK sırası). Döngüye karşı korumalı. */
function sortCategoriesParentsFirst(categories: AdminCategory[]): AdminCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: AdminCategory[] = [];
  const done = new Set<string>();
  const visit = (c: AdminCategory, seen: Set<string>) => {
    if (done.has(c.id) || seen.has(c.id)) return;
    seen.add(c.id);
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent) visit(parent, seen);
    if (!done.has(c.id)) {
      done.add(c.id);
      out.push(c);
    }
  };
  for (const c of categories) visit(c, new Set());
  return out;
}

/**
 * Tüm kataloğu yazar — YALNIZCA içe aktarma (JSON yükleme) için.
 * Ürünlerin alt kayıtları kimliğe göre eşleştirilir; kaynakta olmayanlar silinir.
 */
export async function replaceCatalog(next: CatalogFile): Promise<void> {
  const keepProducts = next.products.map((p) => p.id);
  const keepCategories = next.categories.map((c) => c.id);
  const keepCollections = next.collections.map((c) => c.id);

  // Üst kategori yabancı anahtarı için ebeveynler çocuklarından önce yazılmalı.
  for (const c of sortCategoriesParentsFirst(next.categories)) await saveCategory(c);
  for (const c of next.collections) await saveCollection(c);
  for (const p of next.products) await saveProduct(p);

  // Silme YALNIZ geçerli mağazada: başka mağazanın kataloğu içe aktarmadan etkilenmez.
  const store = currentStore();
  await db.product.deleteMany({
    where: { store, id: { notIn: keepProducts.length ? keepProducts : ['__yok__'] } },
  });
  await db.category.deleteMany({
    where: { store, id: { notIn: keepCategories.length ? keepCategories : ['__yok__'] } },
  });
  await db.collection.deleteMany({
    where: { store, id: { notIn: keepCollections.length ? keepCollections : ['__yok__'] } },
  });

  revalidateCatalog();
}
