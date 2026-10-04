'use client';

// Sipariş özeti: kalemler, kupon, toplamlar. Tutarların hepsi sunucu
// teklifinden (/api/checkout/quote) gelir; burada yalnız biçimlendirilir.

import { useState } from 'react';
import { Loader2, Tag, X } from 'lucide-react';
import { bpsToPercent, formatMinor } from '@/lib/money';
import type { QuoteResponse } from '@/lib/checkout-client';
import { mediaUrl } from '@/lib/site';
import { ProductImage } from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';

export function OrderSummary({
  quote,
  loading,
  couponCode,
  onCouponChange,
  showLines = true,
  className,
  children,
}: {
  quote: QuoteResponse | null;
  loading: boolean;
  couponCode: string;
  onCouponChange: (code: string) => void;
  showLines?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(couponCode);
  const t = quote?.totals;

  return (
    <aside className={cn('card p-5 sm:p-6', className)} aria-label="Sipariş özeti">
      <h2 className="flex items-center justify-between text-base">
        Sipariş özeti
        {loading && <Loader2 size={16} className="animate-spin text-muted" aria-label="Hesaplanıyor" />}
      </h2>

      {showLines && (
        <ul className="mt-4 divide-y divide-line">
          {quote?.lines.map((l) => (
            <li key={l.variantId} className="flex gap-3 py-3">
              <div className="relative h-14 w-14 shrink-0 rounded-lg bg-surface-2">
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  <ProductImage src={mediaUrl(l.imageUrl)} alt="" sizes="56px" className="p-1" />
                </div>
                <span className="tabular absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-[10px] font-bold text-bg">{l.quantity}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                {l.variantLabel && <p className="text-xs text-muted">{l.variantLabel}</p>}
                {l.discountMinor > 0 && <p className="text-xs text-success">−{formatMinor(l.discountMinor)} indirim</p>}
              </div>
              <p className="tabular text-sm font-semibold">{formatMinor(l.netLineMinor)}</p>
            </li>
          ))}
          {!quote && <li className="py-6 text-center text-sm text-muted">Hesaplanıyor…</li>}
        </ul>
      )}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          onCouponChange(draft.trim().toUpperCase());
        }}
      >
        <label htmlFor="coupon" className="field-label">
          Kupon kodu
        </label>
        <div className="flex gap-2">
          <input id="coupon" className="field uppercase" value={draft} placeholder="KOD" onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
          {couponCode ? (
            <button
              type="button"
              className="btn-secondary w-11 shrink-0 px-0"
              aria-label="Kuponu kaldır"
              onClick={() => {
                setDraft('');
                onCouponChange('');
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" className="btn-secondary shrink-0 px-4" disabled={!draft.trim()}>
              <Tag size={15} aria-hidden="true" /> Uygula
            </button>
          )}
        </div>
        {quote?.coupon && (
          <p className={cn('mt-1.5 text-xs', quote.coupon.ok ? 'text-success' : 'text-danger')} role="status">
            {quote.coupon.ok
              ? quote.coupon.freeShipping
                ? `${quote.coupon.code}: ücretsiz kargo uygulandı`
                : `${quote.coupon.code}: ${formatMinor(quote.coupon.discountMinor)} indirim`
              : quote.coupon.reason}
          </p>
        )}
        {quote?.appliedDiscounts?.length ? (
          <ul className="mt-1.5 space-y-0.5 text-xs text-success" role="status">
            {quote.appliedDiscounts.map((d) => (
              <li key={d.id}>
                {d.name}: −{formatMinor(d.discountMinor)}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <dl className="tabular mt-5 space-y-2 border-t border-line pt-4 text-sm">
        <Row label="Ara toplam" value={t ? formatMinor(t.itemsSubtotalMinor) : '—'} />
        {t && t.discountTotalMinor > 0 && <Row label="İndirim" value={`−${formatMinor(t.discountTotalMinor)}`} className="text-success" />}
        <Row
          label="Kargo"
          value={!quote?.selectedShippingId ? 'Adreste hesaplanır' : t?.shippingTotalMinor === 0 ? 'Ücretsiz' : formatMinor(t?.shippingTotalMinor ?? 0)}
        />
        {t && t.surchargeMinor > 0 && <Row label="Kapıda ödeme bedeli" value={formatMinor(t.surchargeMinor)} />}
        {t && quote?.pricesIncludeTax && t.taxBreakdown.length > 0 && (
          <div className="space-y-0.5 pt-1 text-xs text-subtle">
            {t.taxBreakdown.map((r) => (
              <div key={r.rateBps} className="flex justify-between">
                <span>KDV %{bpsToPercent(r.rateBps)} (dahil)</span>
                <span>{formatMinor(r.taxMinor)}</span>
              </div>
            ))}
          </div>
        )}
        {t && !quote?.pricesIncludeTax && <Row label="KDV" value={formatMinor(t.taxTotalMinor)} />}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="font-semibold">Toplam</dt>
          <dd className="font-display text-2xl font-semibold" aria-live="polite">
            {t ? formatMinor(t.grandTotalMinor) : '—'}
          </dd>
        </div>
      </dl>
      {children}
    </aside>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-4', className)}>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
