import type { Metadata } from 'next';
import { listProducts } from '@/storefront/catalog';
import { isSortKey } from '@/lib/product';
import { CatalogView, flatParams, type CatalogSearchParams } from '@/components/catalog/CatalogView';

export const metadata: Metadata = {
  title: 'Arama',
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  const params = flatParams(await searchParams);
  const q = (params.q ?? '').trim().slice(0, 80);
  const sort = isSortKey(params.sirala) ? params.sirala : 'onerilen';
  const products = q ? await listProducts({ q, sort, onlyInStock: params.stok === '1', onlySale: params.indirim === '1' }) : [];

  return (
    <CatalogView
      title={q ? `“${q}” için sonuçlar` : 'Arama'}
      crumbs={[{ label: 'Arama' }]}
      products={products}
      sort={sort}
      page={Number(params.sayfa) || 1}
      basePath="/arama"
      params={params}
      emptyText={q ? 'Farklı bir kelime ya da daha kısa bir arama dene.' : 'Aramak için üstteki büyüteç simgesini kullan.'}
    />
  );
}
