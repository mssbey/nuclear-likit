'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Plus } from 'lucide-react';
import type { ProductCardData } from '@/lib/product';
import { useCart } from '@/store/cart';
import { Badge } from '@/components/ui/Badge';
import { Price } from '@/components/ui/Price';
import { ProductImage } from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';

const SIZES = '(min-width: 1280px) 280px, (min-width: 768px) 30vw, 46vw';

export function ProductCard({ product, priority, className }: { product: ProductCardData; priority?: boolean; className?: string }) {
  const add = useCart((s) => s.add);
  const href = `/urun/${product.slug}`;
  const visibleBadges = product.badges.filter((b) => b !== 'indirim');

  return (
    <article
      className={cn(
        'product-card group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift',
        !product.inStock && 'opacity-80',
        className,
      )}
    >
      <Link href={href} className="relative block aspect-square overflow-hidden bg-surface-2" tabIndex={-1} aria-hidden="true">
        {/* Hover'da yeşil radyal parıltı — dekoratif. */}
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(182,255,59,0.16),transparent_62%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <ProductImage
          src={product.image}
          alt={product.imageAlt}
          sizes={SIZES}
          priority={priority}
          className={cn('p-4 transition-[transform,opacity] duration-500 group-hover:scale-[1.04]', product.hoverImage && 'group-hover:opacity-0')}
        />
        {product.hoverImage && (
          <Image
            src={product.hoverImage}
            alt=""
            fill
            sizes={SIZES}
            className="object-contain p-4 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
      </Link>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
        {visibleBadges.map((b) => (
          <Badge key={b} kind={b} />
        ))}
      </div>
      {product.discountPercent > 0 && (
        <span className="pointer-events-none absolute right-3 top-3">
          <Badge kind="indirim" label={`-%${product.discountPercent}`} />
        </span>
      )}

      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.series && <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-subtle">{product.series}</p>}
        <h3 className="line-clamp-2 font-sans text-sm font-semibold leading-snug text-fg">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <Price priceMinor={product.priceMinor} compareAtMinor={product.compareAtMinor} maxPriceMinor={product.maxPriceMinor} />
          {product.quickAddVariantId ? (
            <button
              type="button"
              // Kart bağlantısının üstünde kalsın.
              className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink transition-[background-color,transform] hover:bg-accent-hover active:scale-95"
              aria-label={`${product.name} sepete ekle`}
              onClick={() =>
                add({
                  variantId: product.quickAddVariantId!,
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  variantLabel: '',
                  image: product.image,
                  priceMinor: product.priceMinor,
                })
              }
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          ) : (
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line-strong text-muted transition-colors group-hover:border-accent/60 group-hover:text-accent"
              aria-hidden="true"
            >
              <ArrowUpRight size={18} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
