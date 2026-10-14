// Katalog üzerinde saf mutasyonlar. Route Handler'lar bunları çağırır;
// her biri yeni bir CatalogFile döndürür (veya AdminError fırlatır).

import type {
  AdminCategory,
  AdminCollection,
  AdminProduct,
  CatalogFile,
  ProductListResult,
  ProductStatus,
} from '@/types/admin';
import {
  adminCategorySchema,
  adminCollectionSchema,
  adminProductSchema,
  fieldErrors,
} from './schema';
import { comboKeyOf, ensureSingleDefault, generateMatrix, localId } from './variants';
import { buildProductSeo } from './seo-autofill';

export class AdminError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly issues: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------- ürünler ----

/** Kayıt öncesi ürünü normalize eder: varyant matrisi + tek varsayılan. */
export function normalizeProduct(input: AdminProduct): AdminProduct {
  const variants = ensureSingleDefault(
    generateMatrix(input.options, input.variants),
    input.variants,
  );
  return { ...input, variants };
}

function validateProduct(product: AdminProduct): AdminProduct {
  const parsed = adminProductSchema.safeParse(product);
  if (!parsed.success) {
    throw new AdminError('Ürün doğrulaması başarısız', 422, fieldErrors(parsed.error));
  }
  return parsed.data as AdminProduct;
}

export function createProduct(catalog: CatalogFile, input: AdminProduct): {
  catalog: CatalogFile;
  product: AdminProduct;
} {
  const next = clone(catalog);
  const stamp = now();
  const candidate = normalizeProduct({
    ...input,
    createdAt: stamp,
    updatedAt: stamp,
  });

  if (next.products.some((p) => p.slug === candidate.slug)) {
    throw new AdminError('Bu slug zaten kullanımda', 409, { slug: 'Bu slug zaten kullanımda' });
  }
  if (next.products.some((p) => p.id === candidate.id)) {
    candidate.id = `${candidate.slug}-${Date.now().toString(36)}`;
  }
  assertCategoriesExist(next, candidate);

  const product = validateProduct(candidate);
  next.products.push(product);
  return { catalog: next, product };
}

/**
 * "Çoğalt" için aday slug listesi: `x-kopya`, `x-kopya-2`, … Yalnızca bu
 * slug'lar veritabanından okunur, tüm katalog çekilmez.
 */
export function duplicateSlugCandidates(slug: string, count = 30): string[] {
  const base = `${slug}-kopya`;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base}-${i + 1}`));
}

/**
 * WordPress'teki "Çoğalt" / "Kopyala" davranışı: kaynağın tüm alanları
 * kopyalanır, kopya doğrudan YAYINDA açılır ve adı/slug'ı çakışmayacak
 * şekilde numaralandırılır. Görseller, seçenekler ve varyantlar yeni kimlik
 * alır; varyant eşleşmeleri (comboKey/optionValues) yeni kimliklere göre
 * yeniden kurulur.
 */
/**
 * Metni `max` karaktere sığdırır (mümkünse kelime sınırında). İçe aktarılmış
 * eski ürünlerde alanlar bugünkü doğrulama sınırlarını aşabiliyor; kopya bu
 * yüzden reddedilmemeli.
 */
function fit(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

/** Ek sona sığsın diye tabanı kısaltır: "Uzun ad… (Kopya)". */
function withSuffix(base: string, suffix: string, max: number): string {
  return `${fit(base, max - suffix.length - 1)} ${suffix}`;
}

export function duplicateProduct(
  catalog: CatalogFile,
  id: string,
): { catalog: CatalogFile; product: AdminProduct } {
  const next = clone(catalog);
  const source = next.products.find((p) => p.id === id);
  if (!source) throw new AdminError('Ürün bulunamadı', 404);

  const taken = new Set(next.products.map((p) => p.slug));
  const candidates = duplicateSlugCandidates(source.slug);
  const index = candidates.findIndex((c) => !taken.has(c));
  if (index === -1) {
    throw new AdminError('Çok fazla kopya var; önce eski kopyaları temizleyin', 409);
  }
  const slug = candidates[index];
  const suffix = index === 0 ? '(Kopya)' : `(Kopya ${index + 1})`;

  // Seçenek/değer kimlikleri yeniden üretilir; varyantlar bunlara göre eşlenir.
  const optionIdMap = new Map<string, string>();
  const valueIdMap = new Map<string, string>();
  const options = source.options.map((o) => {
    const newOptionId = localId('opt');
    optionIdMap.set(o.id, newOptionId);
    return {
      ...o,
      id: newOptionId,
      values: o.values.map((v) => {
        const newValueId = localId('val');
        valueIdMap.set(v.id, newValueId);
        return { ...v, id: newValueId };
      }),
    };
  });

  const variants = source.variants.map((v) => {
    const optionValues: Record<string, string> = {};
    for (const [optionId, valueId] of Object.entries(v.optionValues)) {
      optionValues[optionIdMap.get(optionId) ?? optionId] = valueIdMap.get(valueId) ?? valueId;
    }
    return {
      ...v,
      id: localId('var'),
      optionValues,
      comboKey: comboKeyOf(options, optionValues),
      // SKU'lar stok raporlarında karışmasın diye işaretlenir.
      sku: v.sku ? `${fit(v.sku, 58)}-KOPYA` : '',
      barcode: null,
    };
  });

  const stamp = now();
  const copy: AdminProduct = {
    ...clone(source),
    id: localId('prd'),
    slug,
    name: withSuffix(source.name, suffix, 120),
    series: fit(source.series, 80),
    subcategory: fit(source.subcategory, 80),
    shortDescription: fit(source.shortDescription || source.name, 280),
    description: fit(source.description, 6000),
    usageRate: fit(source.usageRate, 160),
    steepTime: fit(source.steepTime, 160),
    origin: fit(source.origin, 200),
    // Mağaza isteği: eklenen/kopyalanan ürün beklemeden vitrine çıkar.
    status: 'yayında',
    seo: {
      title: source.seo.title ? withSuffix(source.seo.title, suffix, 70) : '',
      description: fit(source.seo.description, 180),
    },
    images: source.images.map((img) => ({ ...img, id: localId('img') })),
    options,
    variants,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const product = validateProduct(normalizeProduct(copy));
  next.products.push(product);
  return { catalog: next, product };
}

export function updateProduct(
  catalog: CatalogFile,
  id: string,
  patch: Partial<AdminProduct>,
): { catalog: CatalogFile; product: AdminProduct } {
  const next = clone(catalog);
  const index = next.products.findIndex((p) => p.id === id);
  if (index === -1) throw new AdminError('Ürün bulunamadı', 404);

  const merged: AdminProduct = {
    ...next.products[index],
    ...patch,
    id: next.products[index].id,
    createdAt: next.products[index].createdAt,
    updatedAt: now(),
  };

  if (
    merged.slug !== next.products[index].slug &&
    next.products.some((p) => p.slug === merged.slug && p.id !== id)
  ) {
    throw new AdminError('Bu slug zaten kullanımda', 409, { slug: 'Bu slug zaten kullanımda' });
  }
  assertCategoriesExist(next, merged);

  const product = validateProduct(normalizeProduct(merged));
  next.products[index] = product;
  return { catalog: next, product };
}

export function deleteProduct(catalog: CatalogFile, id: string): CatalogFile {
  const next = clone(catalog);
  const before = next.products.length;
  next.products = next.products.filter((p) => p.id !== id);
  if (next.products.length === before) throw new AdminError('Ürün bulunamadı', 404);
  return next;
}

export type BulkAction =
  | { action: 'activate'; ids: string[] }
  | { action: 'deactivate'; ids: string[] }
  | { action: 'status'; ids: string[]; status: ProductStatus }
  | { action: 'category'; ids: string[]; categoryIds: string[] }
  | { action: 'delete'; ids: string[] }
  | { action: 'seo'; ids: string[] };

export function bulkProducts(catalog: CatalogFile, op: BulkAction): CatalogFile {
  const next = clone(catalog);
  const idSet = new Set(op.ids);
  const stamp = now();

  if (op.action === 'delete') {
    next.products = next.products.filter((p) => !idSet.has(p.id));
    return next;
  }

  next.products = next.products.map((p) => {
    if (!idSet.has(p.id)) return p;
    if (op.action === 'activate') return { ...p, status: 'yayında', updatedAt: stamp };
    if (op.action === 'deactivate') return { ...p, status: 'taslak', updatedAt: stamp };
    if (op.action === 'status') return { ...p, status: op.status, updatedAt: stamp };
    if (op.action === 'seo') {
      const seo = buildProductSeo(p, {
        categoryName: (cid) => next.categories.find((c) => c.id === cid)?.name ?? '',
      });
      // Değişmeyen ürün yeniden yazılmasın (rota yalnız farklı olanları kaydeder).
      if (seo.title === p.seo.title && seo.description === p.seo.description) return p;
      return { ...p, seo, updatedAt: stamp };
    }
    if (op.action === 'category') {
      const valid = op.categoryIds.filter((cid) => next.categories.some((c) => c.id === cid));
      if (valid.length === 0) throw new AdminError('Geçerli kategori seçilmedi', 422);
      return { ...p, categoryIds: valid, updatedAt: stamp };
    }
    return p;
  });
  return next;
}

function assertCategoriesExist(catalog: CatalogFile, product: AdminProduct): void {
  const missing = product.categoryIds.filter((cid) => !catalog.categories.some((c) => c.id === cid));
  if (missing.length > 0) {
    throw new AdminError(`Bilinmeyen kategori: ${missing.join(', ')}`, 422, {
      categoryIds: 'Seçilen kategori bulunamadı',
    });
  }
}

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  collectionId?: string;
  status?: ProductStatus | 'all';
  sort?: 'created' | 'updated' | 'name' | 'price' | 'stock';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export function listProducts(catalog: CatalogFile, query: ProductQuery): ProductListResult {
  const {
    search = '',
    categoryId,
    collectionId,
    status = 'all',
    // Varsayılan: yüklenme tarihi — düzenlenen ürün listede yer değiştirmez.
    sort = 'created',
    dir = 'desc',
    page = 1,
    pageSize = 20,
  } = query;

  const term = search.trim().toLocaleLowerCase('tr');
  // WordPress'te olduğu gibi üst kategori filtresi alt kategorileri de kapsar.
  const categoryIds = categoryId
    ? new Set(categoryDescendantIds(catalog.categories, categoryId))
    : null;
  let items = catalog.products.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (categoryIds && !p.categoryIds.some((id) => categoryIds.has(id))) return false;
    if (collectionId && !p.collectionIds.includes(collectionId)) return false;
    if (term) {
      const haystack = [
        p.name,
        p.slug,
        p.series,
        p.subcategory,
        ...p.tags,
        ...p.variants.map((v) => v.sku),
      ]
        .join(' ')
        .toLocaleLowerCase('tr');
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const minPrice = (p: AdminProduct) =>
    Math.min(...p.variants.filter((v) => v.isActive).map((v) => v.priceMinor).concat(Infinity));
  const totalStock = (p: AdminProduct) =>
    p.variants.filter((v) => v.isActive).reduce((sum, v) => sum + v.stock, 0);

  const factor = dir === 'asc' ? 1 : -1;
  items = [...items].sort((a, b) => {
    switch (sort) {
      case 'name':
        return factor * a.name.localeCompare(b.name, 'tr');
      case 'price':
        return factor * (minPrice(a) - minPrice(b));
      case 'stock':
        return factor * (totalStock(a) - totalStock(b));
      case 'updated':
        return factor * (Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
      default:
        return factor * (Date.parse(a.createdAt) - Date.parse(b.createdAt)) || a.id.localeCompare(b.id);
    }
  });

  const total = items.length;
  const size = Math.max(1, Math.min(200, pageSize));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;

  return {
    items: items.slice(start, start + size),
    total,
    page: current,
    pageSize: size,
    pageCount,
  };
}

// ----------------------------------------------------------- kategoriler ----

/**
 * Bir kategorinin tüm alt ağacı (kendisi dahil). Üst kategori seçiminde
 * döngüyü engellemek ve silmede çocukları taşımak için kullanılır.
 */
export function categoryDescendantIds(categories: AdminCategory[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i += 1) {
    for (const c of categories) {
      if (c.parentId === out[i] && !out.includes(c.id)) out.push(c.id);
    }
  }
  return out;
}

/**
 * Kategori ağacını "önce üst, hemen ardından altları" sırasında düzleştirir.
 * Panel listeleri WordPress gibi girintili göstermek için `depth` kullanır.
 */
export function categoryTree(
  categories: AdminCategory[],
  parentId: string | null = null,
  depth = 0,
): { category: AdminCategory; depth: number }[] {
  return categories
    .filter((c) => (c.parentId ?? null) === parentId)
    .flatMap((c) => [{ category: c, depth }, ...categoryTree(categories, c.id, depth + 1)]);
}

/** Kök → yaprak derinliği (kök = 0). Döngüye karşı korumalıdır. */
export function categoryDepth(categories: AdminCategory[], id: string): number {
  let depth = 0;
  let current = categories.find((c) => c.id === id);
  const seen = new Set<string>([id]);
  while (current?.parentId) {
    const parent = categories.find((c) => c.id === current?.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
    depth += 1;
  }
  return depth;
}

export function upsertCategory(
  catalog: CatalogFile,
  input: AdminCategory,
): { catalog: CatalogFile; category: AdminCategory } {
  const parsed = adminCategorySchema.safeParse(input);
  if (!parsed.success) {
    throw new AdminError('Kategori doğrulaması başarısız', 422, fieldErrors(parsed.error));
  }
  const category = parsed.data as AdminCategory;
  const next = clone(catalog);
  const index = next.categories.findIndex((c) => c.id === category.id);

  if (next.categories.some((c) => c.slug === category.slug && c.id !== category.id)) {
    throw new AdminError('Bu slug zaten kullanımda', 409, { slug: 'Bu slug zaten kullanımda' });
  }

  // Üst kategori: var olmalı, kendisi olmamalı ve kendi alt ağacından seçilmemeli.
  if (category.parentId) {
    if (category.parentId === category.id) {
      throw new AdminError('Kategori kendi üst kategorisi olamaz', 422, {
        parentId: 'Kategori kendi üst kategorisi olamaz',
      });
    }
    if (!next.categories.some((c) => c.id === category.parentId)) {
      throw new AdminError('Üst kategori bulunamadı', 422, {
        parentId: 'Üst kategori bulunamadı',
      });
    }
    if (index !== -1 && categoryDescendantIds(next.categories, category.id).includes(category.parentId)) {
      throw new AdminError('Üst kategori kendi alt kategorilerinden biri olamaz', 422, {
        parentId: 'Üst kategori kendi alt kategorilerinden biri olamaz',
      });
    }
  }

  if (index === -1) {
    category.order = next.categories.length;
    next.categories.push(category);
  } else {
    next.categories[index] = { ...category, order: next.categories[index].order };
  }
  return { catalog: next, category };
}

export function deleteCategory(catalog: CatalogFile, id: string): CatalogFile {
  const next = clone(catalog);
  const target = next.categories.find((c) => c.id === id);
  if (!target) throw new AdminError('Kategori bulunamadı', 404);

  const used = next.products.filter((p) => p.categoryIds.includes(id));
  const orphans = used.filter((p) => p.categoryIds.length === 1);
  if (orphans.length > 0) {
    throw new AdminError(
      `Bu kategori ${orphans.length} üründe tek kategori; önce başka kategori atayın`,
      409,
    );
  }
  next.categories = next.categories.filter((c) => c.id !== id);
  // WordPress davranışı: silinen kategorinin altları bir üst seviyeye taşınır.
  next.categories = next.categories.map((c) =>
    c.parentId === id ? { ...c, parentId: target.parentId ?? null } : c,
  );
  next.products = next.products.map((p) =>
    p.categoryIds.includes(id)
      ? { ...p, categoryIds: p.categoryIds.filter((cid) => cid !== id) }
      : p,
  );
  next.categories.forEach((c, i) => {
    c.order = i;
  });
  return next;
}

export function reorderCategories(catalog: CatalogFile, orderedIds: string[]): CatalogFile {
  return reorder(catalog, 'categories', orderedIds);
}

// ---------------------------------------------------------- koleksiyonlar ----

export function upsertCollection(
  catalog: CatalogFile,
  input: AdminCollection,
): { catalog: CatalogFile; collection: AdminCollection } {
  const parsed = adminCollectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new AdminError('Koleksiyon doğrulaması başarısız', 422, fieldErrors(parsed.error));
  }
  const collection = parsed.data as AdminCollection;
  const next = clone(catalog);
  const index = next.collections.findIndex((c) => c.id === collection.id);

  if (next.collections.some((c) => c.slug === collection.slug && c.id !== collection.id)) {
    throw new AdminError('Bu slug zaten kullanımda', 409, { slug: 'Bu slug zaten kullanımda' });
  }

  if (index === -1) {
    collection.order = next.collections.length;
    next.collections.push(collection);
  } else {
    next.collections[index] = { ...collection, order: next.collections[index].order };
  }
  return { catalog: next, collection };
}

export function deleteCollection(catalog: CatalogFile, id: string): CatalogFile {
  const next = clone(catalog);
  if (!next.collections.some((c) => c.id === id)) {
    throw new AdminError('Koleksiyon bulunamadı', 404);
  }
  next.collections = next.collections.filter((c) => c.id !== id);
  next.products = next.products.map((p) =>
    p.collectionIds.includes(id)
      ? { ...p, collectionIds: p.collectionIds.filter((cid) => cid !== id) }
      : p,
  );
  next.collections.forEach((c, i) => {
    c.order = i;
  });
  return next;
}

export function reorderCollections(catalog: CatalogFile, orderedIds: string[]): CatalogFile {
  return reorder(catalog, 'collections', orderedIds);
}

function reorder(
  catalog: CatalogFile,
  key: 'categories' | 'collections',
  orderedIds: string[],
): CatalogFile {
  const next = clone(catalog);
  const list = next[key] as Array<{ id: string; order: number }>;
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  list.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  list.forEach((item, i) => {
    item.order = i;
  });
  return next;
}
