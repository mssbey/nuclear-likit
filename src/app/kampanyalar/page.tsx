import type { Metadata } from 'next';
import { listProducts } from '@/storefront/catalog';
import { isSortKey } from '@/lib/product';
import { CatalogView, flatParams, type CatalogSearchParams } from '@/components/catalog/CatalogView';

export const metadata: Metadata = {
  title: 'Kampanyalar',
  description: 'İndirimdeki likit ve pod ürünleri.',
  alternates: { canonical: '/kampanyalar' },
};

export default async function CampaignsPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  const params = flatParams(await searchParams);
  const sort = isSortKey(params.sirala) ? params.sirala : 'onerilen';
  const products = await listProducts({ sort, onlySale: true, onlyInStock: params.stok === '1' });

  return (
    <CatalogView
      title="Kampanyalar"
      eyebrow="Fırsatlar"
      description="İndirimli fiyatlar stoklarla sınırlıdır."
      crumbs={[{ label: 'Kampanyalar' }]}
      products={products}
      sort={sort}
      page={Number(params.sayfa) || 1}
      basePath="/kampanyalar"
      params={params}
      emptyText="Şu an aktif kampanya yok. Yakında yeni fırsatlar burada olacak."
    />
  );
}
