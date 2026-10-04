import type { ReactNode } from 'react';
import { PackageSearch } from 'lucide-react';
import type { ProductCardData, SortKey } from '@/lib/product';
import { ProductGrid } from '@/components/product/ProductGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs';
import { CatalogToolbar } from './CatalogToolbar';
import { Pagination } from './Pagination';

export const PAGE_SIZE = 24;

/** Liste sayfalarının ortak düzeni: başlık, araç çubuğu, ızgara, sayfalama. */
export function CatalogView({
  title,
  eyebrow,
  description,
  crumbs,
  products,
  sort,
  page,
  basePath,
  params,
  children,
  emptyText = 'Bu seçimde ürün bulunamadı. Filtreleri değiştirmeyi dene.',
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  crumbs: Crumb[];
  products: ProductCardData[];
  sort: SortKey;
  page: number;
  basePath: string;
  params: Record<string, string | undefined>;
  /** Başlık ile araç çubuğu arası (alt kategori çipleri vb.). */
  children?: ReactNode;
  emptyText?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const slice = products.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="container-page pb-6 pt-8">
      <Breadcrumbs items={crumbs} />
      <header className="mt-6 max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-display-md">{title}</h1>
        {description && <p className="mt-3 text-base leading-7 text-muted">{description}</p>}
      </header>
      {children && <div className="mt-6">{children}</div>}
      <div className="mt-6">
        <CatalogToolbar total={products.length} sort={sort} />
      </div>
      <div className="mt-6">
        {slice.length ? <ProductGrid products={slice} /> : <EmptyState icon={PackageSearch} title="Ürün bulunamadı" description={emptyText} />}
      </div>
      <Pagination page={current} pageCount={pageCount} basePath={basePath} params={params} />
    </div>
  );
}

export type CatalogSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** URL parametrelerini tek değerli düz nesneye indirger. */
export function flatParams(raw: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
