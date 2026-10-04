import type { Metadata } from 'next';
import { listProducts } from '@/storefront/catalog';
import { isSortKey } from '@/lib/product';
import { CatalogView, flatParams, type CatalogSearchParams } from '@/components/catalog/CatalogView';

export const metadata: Metadata = {
  title: 'Tüm ürünler',
  description: 'Likit, salt nikotin ve pod sistem ürünlerinin tamamı.',
  alternates: { canonical: '/urunler' },
};

export default async function ProductsPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  const params = flatParams(await searchParams);
  const sort = isSortKey(params.sirala) ? params.sirala : 'onerilen';
  const products = await listProducts({ sort, onlyInStock: params.stok === '1', onlySale: params.indirim === '1' });

  return (
    <CatalogView
      title="Tüm ürünler"
      eyebrow="Mağaza"
      crumbs={[{ label: 'Tüm ürünler' }]}
      products={products}
      sort={sort}
      page={Number(params.sayfa) || 1}
      basePath="/urunler"
      params={params}
    />
  );
}
