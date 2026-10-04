// Vitrin katalog sorguları — Nuclear Likit'e özgü.
//
// Veri ortak `getCatalogData()` üzerinden gelir: mağaza `STORE_ID` ile
// belirlenir (bu dağıtımda `nuclear`), sonuç `unstable_cache` ile önbelleklenir
// ve panelden yazma sonrası `katalog` etiketiyle düşürülür (bkz. /api/yenile).
// Yalnız "yayında" ürünler vitrine çıkar.

import 'server-only';
import { cache } from 'react';
import type { AdminCategory, AdminProduct } from '@/types/admin';
import { getAdminProductBySlugFresh, getCatalogData } from '@/server/catalog/queries';
import { mediaUrl } from '@/lib/site';
import { sortCards, toCard, toDetail, type ProductCardData, type ProductDetailData, type SortKey } from '@/lib/product';

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  cover: string;
  parentId: string | null;
  order: number;
  /** Bu kategori ve alt kategorilerindeki yayındaki ürün sayısı. */
  productCount: number;
  children: CategoryNode[];
}

interface Storefront {
  products: AdminProduct[];
  cards: ProductCardData[];
  categories: CategoryNode[];
  /** Kök kategoriler (sıralı). */
  roots: CategoryNode[];
  byId: Map<string, CategoryNode>;
  bySlug: Map<string, CategoryNode>;
}

function descendantIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(descendantIds)];
}

const load = cache(async (): Promise<Storefront> => {
  const data = await getCatalogData();
  const products = data.products.filter((p) => p.status === 'yayında');

  const nodes = new Map<string, CategoryNode>();
  for (const c of [...data.categories].sort((a: AdminCategory, b: AdminCategory) => a.order - b.order)) {
    nodes.set(c.id, {
      id: c.id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      description: c.description,
      cover: mediaUrl(c.cover),
      parentId: c.parentId,
      order: c.order,
      productCount: 0,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  for (const n of nodes.values()) {
    const ids = new Set(descendantIds(n));
    n.productCount = products.filter((p) => p.categoryIds.some((id) => ids.has(id))).length;
  }

  return {
    products,
    cards: products.map(toCard),
    categories: [...nodes.values()],
    roots,
    byId: nodes,
    bySlug: new Map([...nodes.values()].map((n) => [n.slug, n])),
  };
});

export async function getRootCategories(): Promise<CategoryNode[]> {
  return (await load()).roots.filter((c) => c.productCount > 0);
}

export async function getCategoryById(id: string): Promise<CategoryNode | undefined> {
  return (await load()).byId.get(id);
}

export async function getCategoryBySlug(slug: string): Promise<CategoryNode | undefined> {
  return (await load()).bySlug.get(slug);
}

/** Kökten kategoriye yol (içerik haritası için). */
export async function getCategoryTrail(node: CategoryNode): Promise<CategoryNode[]> {
  const { byId } = await load();
  const trail: CategoryNode[] = [];
  let cur: CategoryNode | undefined = node;
  while (cur && trail.length < 8) {
    trail.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return trail;
}

export interface ListQuery {
  categorySlug?: string;
  q?: string;
  sort?: SortKey;
  onlyInStock?: boolean;
  onlySale?: boolean;
}

function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

export async function listProducts(query: ListQuery = {}): Promise<ProductCardData[]> {
  const { products, cards, bySlug } = await load();
  let pool = products;

  if (query.categorySlug) {
    const node = bySlug.get(query.categorySlug);
    if (!node) return [];
    const ids = new Set(descendantIds(node));
    pool = pool.filter((p) => p.categoryIds.some((id) => ids.has(id)));
  }
  if (query.q) {
    const terms = normalize(query.q).split(/\s+/).filter(Boolean);
    pool = pool.filter((p) => {
      const hay = normalize([p.name, p.series, p.shortDescription, p.tags.join(' '), p.flavorNotes.map((n) => n.label).join(' ')].join(' '));
      return terms.every((t) => hay.includes(t));
    });
  }

  const allowed = new Set(pool.map((p) => p.id));
  let list = cards.filter((c) => allowed.has(c.id));
  if (query.onlyInStock) list = list.filter((c) => c.inStock);
  if (query.onlySale) list = list.filter((c) => c.compareAtMinor != null);
  return sortCards(list, query.sort ?? 'onerilen');
}

export async function getProductBySlug(slug: string): Promise<ProductDetailData | undefined> {
  const p = (await load()).products.find((x) => x.slug === slug);
  return p ? toDetail(p) : undefined;
}

/** Panel önizlemesi: önbelleksiz ve durumundan bağımsız (taslak da görünür). */
export async function getProductForPreview(slug: string): Promise<ProductDetailData | undefined> {
  const p = await getAdminProductBySlugFresh(slug);
  return p ? toDetail(p) : undefined;
}

/** Aynı kategorideki diğer ürünler; yetmezse çok satanlarla tamamlanır. */
export async function getRelated(product: ProductDetailData, limit = 8): Promise<ProductCardData[]> {
  const { products, cards } = await load();
  const cats = new Set(product.categoryIds);
  const sameCat = new Set(products.filter((p) => p.id !== product.id && p.categoryIds.some((c) => cats.has(c))).map((p) => p.id));
  const primary = sortCards(cards.filter((c) => sameCat.has(c.id)), 'onerilen');
  const rest = sortCards(cards.filter((c) => c.id !== product.id && !sameCat.has(c.id)), 'cok-satan');
  return [...primary, ...rest].slice(0, limit);
}

export interface HomeData {
  featured: ProductCardData[];
  newest: ProductCardData[];
  bestSellers: ProductCardData[];
  onSale: ProductCardData[];
  total: number;
}

export async function getHomeData(): Promise<HomeData> {
  const { cards } = await load();
  const inStock = cards.filter((c) => c.inStock);
  const featured = sortCards(inStock.filter((c) => c.featured), 'onerilen');
  const newest = sortCards(inStock, 'yeni');
  const best = sortCards(inStock.filter((c) => c.bestSeller), 'onerilen');
  return {
    featured: (featured.length >= 4 ? featured : sortCards(inStock, 'onerilen')).slice(0, 10),
    newest: newest.slice(0, 10),
    bestSellers: (best.length >= 4 ? best : sortCards(inStock, 'cok-satan')).slice(0, 10),
    onSale: sortCards(inStock.filter((c) => c.compareAtMinor != null), 'onerilen').slice(0, 10),
    total: cards.length,
  };
}

/** Site haritası için. */
export async function getAllSlugs(): Promise<{ products: { slug: string; updatedAt: string }[]; categories: string[] }> {
  const { products, categories } = await load();
  return {
    products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
    categories: categories.filter((c) => c.productCount > 0).map((c) => c.slug),
  };
}
