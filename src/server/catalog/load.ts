// Ürün satırlarını ilişkileriyle YÜKLEME — düz, paralel sorgularla.
//
// Neden `include` değil: Prisma iç içe include'u ilişki başına SIRALI sorguya
// çevirir (ürün → görsel → seçenek → değer → varyant → kategori → koleksiyon).
// Uzak veritabanında (Neon / Prisma Postgres) her gidiş-dönüş ~1 sn olunca tam
// katalog 5+ sn sürüyordu. Burada 7 sorgu TEK turda paralel atılır, birleştirme
// bellekte yapılır; sonuç `rowToProduct`'ın beklediği `ProductRow` biçimindedir.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import type { ProductRow } from './mapping';

type Tx = Prisma.TransactionClient | typeof db;

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/**
 * `where` verilirse yalnızca eşleşen ürünler (ve onların alt kayıtları) gelir;
 * verilmezse tüm katalog. Sıralama `include` sürümüyle birebir aynıdır.
 */
export async function loadProductRows(
  where?: Prisma.ProductWhereInput,
  client: Tx = db,
): Promise<ProductRow[]> {
  const byProduct = where ? { product: where } : undefined;

  const [products, images, options, values, variants, categories, collections] =
    await Promise.all([
      client.product.findMany({ where, orderBy: { createdAt: 'asc' } }),
      client.productImage.findMany({ where: byProduct, orderBy: { position: 'asc' } }),
      client.productOption.findMany({ where: byProduct, orderBy: { position: 'asc' } }),
      client.optionValue.findMany({
        where: where ? { option: { product: where } } : undefined,
        orderBy: { position: 'asc' },
      }),
      client.variant.findMany({ where: byProduct, orderBy: { position: 'asc' } }),
      client.productCategory.findMany({ where: byProduct, orderBy: { position: 'asc' } }),
      client.productCollection.findMany({ where: byProduct, orderBy: { position: 'asc' } }),
    ]);

  const imagesBy = groupBy(images, (r) => r.productId);
  const optionsBy = groupBy(options, (r) => r.productId);
  const valuesBy = groupBy(values, (r) => r.optionId);
  const variantsBy = groupBy(variants, (r) => r.productId);
  const categoriesBy = groupBy(categories, (r) => r.productId);
  const collectionsBy = groupBy(collections, (r) => r.productId);

  return products.map((p) => ({
    ...p,
    images: imagesBy.get(p.id) ?? [],
    options: (optionsBy.get(p.id) ?? []).map((o) => ({
      ...o,
      values: valuesBy.get(o.id) ?? [],
    })),
    variants: variantsBy.get(p.id) ?? [],
    categories: categoriesBy.get(p.id) ?? [],
    collections: collectionsBy.get(p.id) ?? [],
  })) as unknown as ProductRow[];
}
