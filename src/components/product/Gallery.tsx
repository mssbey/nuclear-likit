'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ProductImage } from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';

export function Gallery({ images, name, activeSrc }: { images: { src: string; alt: string }[]; name: string; activeSrc?: string | null }) {
  const [index, setIndex] = useState(0);
  // Seçilen varyantın kendi görseli varsa o öne çıkar.
  const variantIndex = activeSrc ? images.findIndex((i) => i.src === activeSrc) : -1;
  const shownIndex = variantIndex >= 0 ? variantIndex : index;
  const current = activeSrc && variantIndex < 0 ? { src: activeSrc, alt: name } : images[shownIndex] ?? { src: '', alt: name };

  return (
    <div className="lg:sticky lg:top-24">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-surface-2 to-surface">
        <div className="pointer-events-none absolute inset-16 rounded-full bg-accent/10 blur-3xl" />
        <ProductImage key={current.src} src={current.src} alt={current.alt} sizes="(min-width: 1024px) 560px, 100vw" priority className="animate-fade-up p-8 sm:p-12" />
      </div>
      {images.length > 1 && (
        <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" aria-label="Ürün görselleri">
          {images.map((img, i) => (
            <li key={img.src} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Görsel ${i + 1}`}
                aria-current={shownIndex === i ? 'true' : undefined}
                className={cn(
                  'relative h-20 w-20 overflow-hidden rounded-xl border bg-surface-2 transition-colors',
                  shownIndex === i ? 'border-accent' : 'border-line hover:border-line-strong',
                )}
              >
                <Image src={img.src} alt="" fill sizes="80px" className="object-contain p-1.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
