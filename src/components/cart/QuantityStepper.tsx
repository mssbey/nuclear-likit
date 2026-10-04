'use client';

import { Minus, Plus } from 'lucide-react';
import { MAX_QTY } from '@/store/cart';
import { cn } from '@/lib/utils';

export function QuantityStepper({
  value,
  onChange,
  max = MAX_QTY,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  /** Ekran okuyucu için: hangi ürünün adedi. */
  label: string;
  size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  return (
    <div className={cn('inline-flex items-center rounded-xl border border-line-strong bg-surface', h)} role="group" aria-label={`${label} adet`}>
      <button
        type="button"
        className={cn('grid place-items-center text-muted transition-colors hover:text-fg disabled:opacity-40', size === 'sm' ? 'w-9' : 'w-11', h)}
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label="Azalt"
      >
        <Minus size={15} aria-hidden="true" />
      </button>
      <span className="tabular w-7 text-center text-sm font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn('grid place-items-center text-muted transition-colors hover:text-fg disabled:opacity-40', size === 'sm' ? 'w-9' : 'w-11', h)}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Artır"
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
