import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategoryBySlug, getCategoryTrail, listProducts } from '@/storefront/catalog';
import { isSortKey } from '@/lib/product';
import { CatalogView, flatParams, type CatalogSearchParams } from '@/components/catalog/CatalogView';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).slug);
  if (!category) return { title: 'Kategori bulunamadı' };
  return {
    title: category.name,
    description: category.tagline || category.description || `${category.name} kategorisindeki ürünler.`,
    alternates: { canonical: `/kategori/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: CatalogSearchParams }) {
  const category = await getCategoryBySlug((await params).slug);
  if (!category) notFound();

  const query = flatParams(await searchParams);
  const sort = isSortKey(query.sirala) ? query.sirala : 'onerilen';
  const [products, trail] = await Promise.all([
    listProducts({ categorySlug: category.slug, sort, onlyInStock: query.stok === '1', onlySale: query.indirim === '1' }),
    getCategoryTrail(category),
  ]);
  const children = category.children.filter((c) => c.productCount > 0);
  const parent = trail.length > 1 ? trail[trail.length - 2] : undefined;

  return (
    <CatalogView
      title={category.name}
      eyebrow={parent?.name ?? 'Kategori'}
      description={category.tagline || category.description || undefined}
      crumbs={[
        { label: 'Kategoriler', href: '/kategori' },
        ...trail.slice(0, -1).map((c) => ({ label: c.name, href: `/kategori/${c.slug}` })),
        { label: category.name },
      ]}
      products={products}
      sort={sort}
      page={Number(query.sayfa) || 1}
      basePath={`/kategori/${category.slug}`}
      params={query}
    >
      {children.length > 0 && (
        <nav aria-label="Alt kategoriler" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <span className="chip shrink-0" data-active="true">
            Tümü
          </span>
          {children.map((c) => (
            <Link key={c.id} href={`/kategori/${c.slug}`} className="chip shrink-0">
              {c.name} <span className="tabular text-xs text-subtle">{c.productCount}</span>
            </Link>
          ))}
        </nav>
      )}
    </CatalogView>
  );
}
