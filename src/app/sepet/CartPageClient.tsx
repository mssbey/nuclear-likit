'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '@/store/cart';
import { useDebounced, useMounted } from '@/lib/hooks';
import { formatMinor } from '@/lib/money';
import { checkoutApi, type QuoteResponse } from '@/lib/checkout-client';
import { ProductImage } from '@/components/ui/ProductImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/cart/QuantityStepper';
import { OrderSummary } from '@/components/checkout/OrderSummary';

export function CartPageClient() {
  const mounted = useMounted();
  const lines = useCart((s) => s.lines);
  const couponCode = useCart((s) => s.couponCode);
  const setCoupon = useCart((s) => s.setCoupon);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useDebounced(JSON.stringify({ l: lines.map((l) => [l.variantId, l.quantity]), c: couponCode }), 250);

  useEffect(() => {
    if (!mounted || lines.length === 0) {
      setQuote(null);
      return;
    }
    let alive = true;
    setLoading(true);
    checkoutApi
      .quote({ lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), couponCode: couponCode || undefined })
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Tutar hesaplanamadı'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mounted]);

  if (!mounted) return <div className="mt-8 h-64 animate-pulse rounded-2xl bg-surface" />;

  if (lines.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        icon={ShoppingBag}
        title="Sepetin boş"
        description="Beğendiğin ürünleri sepete ekle, siparişini birkaç adımda tamamla."
        action={
          <Link href="/urunler" className="btn-primary">
            Alışverişe başla
          </Link>
        }
      />
    );
  }

  const shortage = new Map((quote?.availability ?? []).filter((a) => a.available < a.requested).map((a) => [a.variantId, a.available]));

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        {quote?.problems.length ? (
          <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-hazard/40 bg-hazard-soft p-4 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-hazard" aria-hidden="true" />
            <ul className="space-y-1">
              {quote.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="card divide-y divide-line">
          {lines.map((l) => {
            const available = shortage.get(l.variantId);
            return (
              <li key={l.variantId} className="flex gap-4 p-4 sm:p-5">
                <Link href={`/urun/${l.slug}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  <ProductImage src={l.image} alt={l.name} sizes="96px" className="p-2" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/urun/${l.slug}`} className="line-clamp-2 font-medium hover:text-accent">
                        {l.name}
                      </Link>
                      {l.variantLabel && <p className="mt-0.5 text-sm text-muted">{l.variantLabel}</p>}
                    </div>
                    <button type="button" onClick={() => remove(l.variantId)} className="btn-ghost -mr-2 -mt-2 w-11 px-0" aria-label={`${l.name} sepetten çıkar`}>
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {available !== undefined && (
                    <p className="mt-1 text-xs text-hazard">{available === 0 ? 'Bu ürün şu an stokta yok.' : `Stokta yalnız ${available} adet var.`}</p>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    <QuantityStepper value={l.quantity} onChange={(n) => setQuantity(l.variantId, n)} label={l.name} />
                    <span className="tabular font-display text-lg font-semibold">{formatMinor(l.priceMinor * l.quantity)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Link href="/urunler" className="btn-ghost mt-4">
          Alışverişe devam et
        </Link>
      </div>

      <OrderSummary quote={quote} loading={loading} couponCode={couponCode} onCouponChange={setCoupon} showLines={false} className="lg:sticky lg:top-24 lg:self-start">
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Link href="/odeme" className="btn-primary mt-5 h-12 w-full text-base">
          Ödemeye geç <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <p className="mt-3 text-center text-xs text-subtle">Kargo ücreti adres adımında hesaplanır.</p>
      </OrderSummary>
    </div>
  );
}
