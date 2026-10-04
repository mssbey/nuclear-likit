'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';
import { SORTS, type SortKey } from '@/lib/product';

/** Sıralama + hızlı filtreler. Durum URL'de tutulur (paylaşılabilir, geri tuşu çalışır). */
export function CatalogToolbar({ total, sort }: { total: number; sort: SortKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('sayfa');
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (key: string) => update(key, params.get(key) ? null : '1');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="tabular mr-2 text-sm text-muted" aria-live="polite">
          {total} ürün
        </p>
        <button type="button" className="chip" data-active={params.get('stok') === '1'} aria-pressed={params.get('stok') === '1'} onClick={() => toggle('stok')}>
          Stokta olanlar
        </button>
        {!pathname.startsWith('/kampanyalar') && (
          <button type="button" className="chip" data-active={params.get('indirim') === '1'} aria-pressed={params.get('indirim') === '1'} onClick={() => toggle('indirim')}>
            İndirimdekiler
          </button>
        )}
      </div>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Sırala</span>
        <ArrowUpDown size={15} className="pointer-events-none absolute left-3 text-muted" aria-hidden="true" />
        <select
          value={sort}
          onChange={(e) => update('sirala', e.target.value === 'onerilen' ? null : e.target.value)}
          className="field min-h-10 cursor-pointer appearance-none py-2 pl-9 pr-8 text-sm"
        >
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORTS[k]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
