'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Search, X } from 'lucide-react';
import type { ProductCardData } from '@/lib/product';
import { formatMinor } from '@/lib/money';
import { useDebounced, useEscape, useLockBody } from '@/lib/hooks';
import { ProductImage } from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProductCardData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(q.trim(), 220);

  const close = useCallback(() => {
    onClose();
    setQ('');
    setResults(null);
  }, [onClose]);

  useLockBody(open);
  useEscape(open, close);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/ara?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ items: ProductCardData[] }>)
      .then((r) => setResults(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debounced]);

  const goAll = () => {
    if (!q.trim()) return;
    router.push(`/arama?q=${encodeURIComponent(q.trim())}`);
    close();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    goAll();
  };

  return (
    <div className={cn('fixed inset-0 z-50', open ? 'visible' : 'invisible')} aria-hidden={!open}>
      <div className={cn('absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')} onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ürün ara"
        className={cn(
          'relative mx-auto mt-0 w-full max-w-2xl border-b border-line bg-surface p-4 transition-[transform,opacity] duration-200 sm:mt-20 sm:rounded-2xl sm:border',
          open ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
        )}
      >
        <form onSubmit={submit} role="search" className="flex items-center gap-2">
          <Search size={20} className="ml-1 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="site-search" className="sr-only">
            Ürün, aroma veya marka ara
          </label>
          <input
            ref={inputRef}
            id="site-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ürün, aroma veya marka ara…"
            autoComplete="off"
            className="min-h-12 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-subtle focus-visible:outline-none"
          />
          {loading && <Loader2 size={18} className="animate-spin text-muted" aria-hidden="true" />}
          <button type="button" className="btn-ghost w-11 px-0" onClick={close} aria-label="Aramayı kapat">
            <X size={20} aria-hidden="true" />
          </button>
        </form>

        <div aria-live="polite" className="mt-2">
          {results && results.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted">“{debounced}” için sonuç bulunamadı.</p>
          )}
          {results && results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((p) => (
                <li key={p.id}>
                  <Link href={`/urun/${p.slug}`} onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      <ProductImage src={p.image} alt={p.imageAlt} sizes="56px" className="p-1" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                      {p.series && <span className="block truncate text-xs text-muted">{p.series}</span>}
                    </span>
                    <span className="tabular text-sm font-semibold">{formatMinor(p.priceMinor)}</span>
                  </Link>
                </li>
              ))}
              <li>
                <button type="button" onClick={goAll} className="btn-ghost mt-1 w-full justify-between">
                  Tüm sonuçları gör <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
