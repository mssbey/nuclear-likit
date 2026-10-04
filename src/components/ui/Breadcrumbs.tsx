import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: 'Ana sayfa', href: '/' }, ...items];
  return (
    <nav aria-label="Konum" className="text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {all.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-subtle" aria-hidden="true" />}
            {c.href && i < all.length - 1 ? (
              <Link href={c.href} className="transition-colors hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === all.length - 1 ? 'page' : undefined} className="text-fg">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
