import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (n: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'sayfa') qs.set(k, v);
    if (n > 1) qs.set('sayfa', String(n));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  // Kısa sayfa listesi: ilk, son ve geçerlinin ±1 komşusu.
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  return (
    <nav aria-label="Sayfalar" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-secondary w-11 px-0" aria-label="Önceki sayfa">
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
      ) : null}
      {pages.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - pages[i - 1] > 1 && <span className="px-1 text-subtle">…</span>}
          <Link
            href={href(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cn('btn tabular w-11 px-0', n === page ? 'bg-accent text-accent-ink' : 'border border-line-strong bg-surface text-muted hover:text-fg')}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={href(page + 1)} className="btn-secondary w-11 px-0" aria-label="Sonraki sayfa">
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
