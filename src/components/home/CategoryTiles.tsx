import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import type { CategoryNode } from '@/storefront/catalog';

export function CategoryTiles({ categories }: { categories: CategoryNode[] }) {
  if (categories.length === 0) return null;
  const list = categories.slice(0, 8);
  // Büyük ilk kart yalnız ızgarayı dolduracak kadar kategori varsa (≥5); azsa eşit sütunlar.
  const feature = list.length >= 5;
  const cols = feature ? 'lg:grid-cols-4' : ({ 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' } as Record<number, string>)[list.length];
  return (
    <section aria-labelledby="cat-title" className="container-page py-12 sm:py-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Kategoriler</p>
          <h2 id="cat-title" className="text-display-sm">
            Ne arıyorsun?
          </h2>
        </div>
        <Link href="/kategori" className="btn-ghost hidden sm:inline-flex">
          Tüm kategoriler <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${cols}`}>
        {list.map((c, i) => (
          <li key={c.id} className={i === 0 && feature ? 'col-span-2 lg:row-span-2' : ''}>
            <Link
              href={`/kategori/${c.slug}`}
              className="group relative flex h-full min-h-40 flex-col justify-end overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50 sm:min-h-48"
            >
              {c.cover ? (
                <Image
                  src={c.cover}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover opacity-40 transition-[opacity,transform] duration-500 group-hover:scale-105 group-hover:opacity-55"
                />
              ) : (
                <span className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl transition-opacity group-hover:bg-accent/20" />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
              <span className="relative">
                <span className="tabular text-xs font-semibold text-accent">{c.productCount} ürün</span>
                <span className={`mt-1 flex items-center justify-between gap-2 font-display font-semibold text-fg ${i === 0 && feature ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>
                  {c.name}
                  <ArrowUpRight size={20} className="shrink-0 text-muted transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                </span>
                {(i === 0 || !feature) && c.tagline && <span className="mt-1 block max-w-sm text-sm text-muted">{c.tagline}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
