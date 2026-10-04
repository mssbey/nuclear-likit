'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ProductCardData } from '@/lib/product';
import { ProductCard } from './ProductCard';

/** Yatay kayan ürün rayı — dokunmatikte kaydırma, masaüstünde ok düğmeleri. */
export function ProductRail({
  title,
  eyebrow,
  href,
  products,
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  products: ProductCardData[];
}) {
  const ref = useRef<HTMLUListElement>(null);
  if (products.length === 0) return null;

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const titleId = `rail-${title.replace(/\s+/g, '-').toLocaleLowerCase('tr')}`;

  return (
    <section aria-labelledby={titleId} className="container-page py-10 sm:py-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h2 id={titleId} className="text-display-sm">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {href && (
            <Link href={href} className="btn-ghost hidden sm:inline-flex">
              Tümünü gör <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
          <button type="button" onClick={() => scroll(-1)} className="btn-secondary hidden w-11 px-0 md:inline-flex" aria-label={`${title}: geri kaydır`}>
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scroll(1)} className="btn-secondary hidden w-11 px-0 md:inline-flex" aria-label={`${title}: ileri kaydır`}>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
        {products.map((p) => (
          <li key={p.id} className="relative w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%] xl:w-[19%]">
            <ProductCard product={p} className="h-full" />
          </li>
        ))}
      </ul>
      {href && (
        <Link href={href} className="btn-secondary mt-5 w-full sm:hidden">
          Tümünü gör <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
