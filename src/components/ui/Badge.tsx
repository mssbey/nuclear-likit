import type { CardBadge } from '@/lib/product';
import { cn } from '@/lib/utils';

const STYLES: Record<CardBadge, { label: string; cls: string }> = {
  yeni: { label: 'Yeni', cls: 'bg-accent text-accent-ink' },
  indirim: { label: 'İndirim', cls: 'bg-hazard text-black' },
  'cok-satan': { label: 'Çok satan', cls: 'border border-line-strong bg-bg/80 text-fg backdrop-blur' },
  tukendi: { label: 'Tükendi', cls: 'border border-line-strong bg-bg/85 text-muted backdrop-blur' },
};

export function Badge({ kind, label, className }: { kind: CardBadge; label?: string; className?: string }) {
  const s = STYLES[kind];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-bold uppercase tracking-wide',
        s.cls,
        className,
      )}
    >
      {label ?? s.label}
    </span>
  );
}
