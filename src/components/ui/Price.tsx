import { formatMinor } from '@/lib/money';
import { cn } from '@/lib/utils';

export function Price({
  priceMinor,
  compareAtMinor,
  maxPriceMinor,
  size = 'md',
  className,
}: {
  priceMinor: number;
  compareAtMinor?: number | null;
  /** Varyant fiyatları farklıysa "x ₺ – y ₺" yerine "x ₺'den başlayan". */
  maxPriceMinor?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const main = { sm: 'text-sm', md: 'text-base', lg: 'text-3xl' }[size];
  return (
    <span className={cn('tabular inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {maxPriceMinor ? <span className="text-xs text-muted">en düşük</span> : null}
      <span className={cn('font-display font-semibold text-fg', main)}>{formatMinor(priceMinor)}</span>
      {compareAtMinor ? (
        <span className={cn('text-subtle line-through', size === 'lg' ? 'text-base' : 'text-xs')}>
          <span className="sr-only">İndirimsiz fiyat: </span>
          {formatMinor(compareAtMinor)}
        </span>
      ) : null}
    </span>
  );
}
