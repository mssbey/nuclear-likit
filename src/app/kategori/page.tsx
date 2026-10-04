import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, FolderOpen } from 'lucide-react';
import { getRootCategories } from '@/storefront/catalog';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Kategoriler',
  alternates: { canonical: '/kategori' },
};

export default async function CategoriesPage() {
  const roots = await getRootCategories();
  return (
    <div className="container-page pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'Kategoriler' }]} />
      <h1 className="mt-6 text-display-md">Kategoriler</h1>
      {roots.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Henüz kategori yok" className="mt-8" />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roots.map((c) => (
            <li key={c.id} className="card flex flex-col p-6">
              <Link href={`/kategori/${c.slug}`} className="group flex items-start justify-between gap-3">
                <span>
                  <span className="tabular text-xs font-semibold text-accent">{c.productCount} ürün</span>
                  <span className="mt-1 block font-display text-xl font-semibold group-hover:text-accent">{c.name}</span>
                  {c.tagline && <span className="mt-1 block text-sm text-muted">{c.tagline}</span>}
                </span>
                <ArrowUpRight size={20} className="shrink-0 text-muted group-hover:text-accent" aria-hidden="true" />
              </Link>
              {c.children.some((x) => x.productCount > 0) && (
                <ul className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  {c.children
                    .filter((x) => x.productCount > 0)
                    .map((x) => (
                      <li key={x.id}>
                        <Link href={`/kategori/${x.slug}`} className="chip">
                          {x.name}
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
