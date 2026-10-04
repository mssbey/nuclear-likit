'use client';

// Ürün sayfasının etkileşimli üst bölümü: galeri + seçenekler + sepete ekle.
//
// Varyant seçimi: her seçenek için bir değer seçilir; seçimle eşleşen aktif
// varyant fiyatı, stoğu ve (varsa) görseli belirler. Diğer seçimlerle hiç
// eşleşmeyen değerler devre dışı, eşleşip stokta olmayanlar üstü çizili görünür.

import { useMemo, useState, type ReactNode } from 'react';
import { Check, ShoppingBag, Truck } from 'lucide-react';
import type { ProductDetailData, VariantView } from '@/lib/product';
import { discountPercentMinor } from '@/lib/money';
import { useCart } from '@/store/cart';
import { toast } from '@/store/toast';
import { Price } from '@/components/ui/Price';
import { Badge } from '@/components/ui/Badge';
import { QuantityStepper } from '@/components/cart/QuantityStepper';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';
import { Gallery } from './Gallery';

type Selection = Record<string, string>;

function initialSelection(p: ProductDetailData): Selection {
  const start = p.variants.find((v) => v.isDefault && v.inStock) ?? p.variants.find((v) => v.inStock) ?? p.variants[0];
  return start ? { ...start.optionValues } : {};
}

function matches(v: VariantView, sel: Selection): boolean {
  return Object.entries(sel).every(([optionId, valueId]) => v.optionValues[optionId] === valueId);
}

export function ProductBuyBox({ product, children }: { product: ProductDetailData; children?: ReactNode }) {
  const add = useCart((s) => s.add);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product));
  const [quantity, setQuantity] = useState(1);

  const variant = useMemo(
    () => (product.options.length ? product.variants.find((v) => matches(v, selection)) : product.variants[0]),
    [product, selection],
  );
  const complete = product.options.every((o) => selection[o.id]);
  const maxQty = variant?.stockLeft != null ? Math.max(1, Math.min(20, variant.stockLeft)) : 20;

  const valueState = (optionId: string, valueId: string): 'ok' | 'stokta-yok' | 'yok' => {
    const trial = { ...selection, [optionId]: valueId };
    const candidates = product.variants.filter((v) => matches(v, trial));
    if (!candidates.length) return 'yok';
    return candidates.some((v) => v.inStock) ? 'ok' : 'stokta-yok';
  };

  const choose = (optionId: string, valueId: string) => {
    let next = { ...selection, [optionId]: valueId };
    // Yeni seçim diğerleriyle eşleşmiyorsa, bu değeri içeren ilk uygun varyanta geç.
    if (!product.variants.some((v) => matches(v, next))) {
      const fallback = product.variants.find((v) => v.optionValues[optionId] === valueId && v.inStock) ?? product.variants.find((v) => v.optionValues[optionId] === valueId);
      if (fallback) next = { ...fallback.optionValues };
    }
    setSelection(next);
    setQuantity(1);
  };

  const addToCart = () => {
    if (!variant || !variant.inStock) return;
    add(
      {
        variantId: variant.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantLabel: variant.label,
        image: variant.image ?? product.image,
        priceMinor: variant.priceMinor,
      },
      quantity,
    );
    toast.success('Sepete eklendi', `${product.name}${variant.label ? ` · ${variant.label}` : ''} × ${quantity}`);
  };

  const priceMinor = variant?.priceMinor ?? product.priceMinor;
  const compareAt = variant ? variant.compareAtMinor : product.compareAtMinor;
  const discount = discountPercentMinor(priceMinor, compareAt);
  const canBuy = Boolean(variant?.inStock) && complete;
  const lowStock = variant?.stockLeft != null && variant.stockLeft > 0 && variant.stockLeft <= 5;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
      <Gallery images={product.images} name={product.name} activeSrc={variant?.image} />

      <div className="pb-24 lg:pb-0">
        <div className="flex flex-wrap gap-1.5">
          {product.badges
            .filter((b) => b !== 'indirim' && b !== 'tukendi')
            .map((b) => (
              <Badge key={b} kind={b} />
            ))}
          {discount > 0 && <Badge kind="indirim" label={`-%${discount}`} />}
        </div>
        {product.series && <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{product.series}</p>}
        <h1 className="mt-2 text-display-sm">{product.name}</h1>
        {product.shortDescription && <p className="mt-3 text-base leading-7 text-muted">{product.shortDescription}</p>}

        <div className="mt-6">
          <Price priceMinor={priceMinor} compareAtMinor={compareAt} size="lg" />
          <p className="mt-1 text-xs text-subtle">KDV dahil</p>
        </div>

        {product.options.map((o) => (
          <fieldset key={o.id} className="mt-7">
            <legend className="mb-2.5 text-sm font-semibold">
              {o.name}
              {selection[o.id] && <span className="ml-2 font-normal text-muted">{o.values.find((v) => v.id === selection[o.id])?.label}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((v) => {
                const state = valueState(o.id, v.id);
                const active = selection[o.id] === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => choose(o.id, v.id)}
                    disabled={state === 'yok'}
                    aria-pressed={active}
                    className={cn(
                      'relative min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                      active ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong bg-surface text-fg hover:border-subtle',
                      state === 'stokta-yok' && 'text-subtle line-through decoration-subtle',
                    )}
                  >
                    {v.label}
                    {state === 'stokta-yok' && <span className="sr-only"> (stokta yok)</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <p className="mt-6 flex items-center gap-2 text-sm" aria-live="polite">
          {!complete ? (
            <span className="text-muted">Lütfen seçim yapın.</span>
          ) : variant?.inStock ? (
            <>
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <span className="text-success">{lowStock ? `Son ${variant.stockLeft} adet` : 'Stokta'}</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
              <span className="text-danger">Bu seçenek şu an stokta yok</span>
            </>
          )}
        </p>

        <div className="mt-4 hidden items-center gap-3 lg:flex">
          <QuantityStepper value={quantity} onChange={setQuantity} max={maxQty} label={product.name} />
          <button type="button" className="btn-primary h-12 flex-1 text-base" onClick={addToCart} disabled={!canBuy}>
            <ShoppingBag size={19} aria-hidden="true" /> {canBuy ? 'Sepete ekle' : 'Tükendi'}
          </button>
        </div>

        <ul className="mt-6 grid gap-2.5 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          <li className="flex items-center gap-2.5">
            <Truck size={17} className="shrink-0 text-accent" aria-hidden="true" /> {site.commerce.estimatedDelivery}
          </li>
          <li className="flex items-center gap-2.5">
            <Check size={17} className="shrink-0 text-accent" aria-hidden="true" /> Sızdırmaz ve gizli paketleme
          </li>
          <li className="flex items-center gap-2.5">
            <Check size={17} className="shrink-0 text-accent" aria-hidden="true" /> Kart, havale/EFT ve kapıda ödeme
          </li>
        </ul>

        {children}
      </div>

      {/* Mobil yapışkan satın alma çubuğu — birincil eylem başparmak erişiminde. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} max={maxQty} label={product.name} />
          <button type="button" className="btn-primary h-12 flex-1" onClick={addToCart} disabled={!canBuy}>
            <ShoppingBag size={18} aria-hidden="true" /> {canBuy ? 'Sepete ekle' : 'Tükendi'}
          </button>
        </div>
      </div>
    </div>
  );
}
