'use client';

import Link from 'next/link';
import { ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart, cartSubtotalMinor, cartCount } from '@/store/cart';
import { formatMinor } from '@/lib/money';
import { useEscape, useLockBody, useMounted } from '@/lib/hooks';
import { ProductImage } from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';
import { QuantityStepper } from './QuantityStepper';

export function CartDrawer() {
  const mounted = useMounted();
  const open = useCart((s) => s.drawerOpen);
  const close = useCart((s) => s.closeDrawer);
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const isOpen = mounted && open;

  useLockBody(isOpen);
  useEscape(isOpen, close);

  return (
    <div className={cn('fixed inset-0 z-50', isOpen ? 'visible' : 'invisible')} aria-hidden={!isOpen}>
      <div className={cn('absolute inset-0 bg-black/60 transition-opacity duration-300', isOpen ? 'opacity-100' : 'opacity-0')} onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Sepet"
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <h2 className="text-lg">
            Sepetim <span className="tabular text-sm font-normal text-muted">({cartCount(lines)})</span>
          </h2>
          <button type="button" className="btn-ghost -mr-2 w-11 px-0" onClick={close} aria-label="Sepeti kapat">
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line-strong bg-surface-2 text-accent">
              <ShoppingBag size={26} aria-hidden="true" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">Sepetin boş</p>
            <p className="mt-1 text-sm text-muted">Favori aromanı bulmak için ürünlere göz at.</p>
            <Link href="/urunler" onClick={close} className="btn-primary mt-6">
              Alışverişe başla
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.variantId} className="flex gap-3 py-4">
                  <Link href={`/urun/${l.slug}`} onClick={close} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    <ProductImage src={l.image} alt={l.name} sizes="80px" className="p-1.5" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/urun/${l.slug}`} onClick={close} className="line-clamp-2 text-sm font-medium text-fg hover:text-accent">
                      {l.name}
                    </Link>
                    {l.variantLabel && <p className="mt-0.5 text-xs text-muted">{l.variantLabel}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QuantityStepper size="sm" value={l.quantity} onChange={(n) => setQuantity(l.variantId, n)} label={l.name} />
                      <span className="tabular text-sm font-semibold">{formatMinor(l.priceMinor * l.quantity)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(l.variantId)} className="btn-ghost -mr-2 h-9 min-h-9 w-9 self-start px-0" aria-label={`${l.name} sepetten çıkar`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t border-line p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Ara toplam</span>
                <span className="tabular font-display text-xl font-semibold">{formatMinor(cartSubtotalMinor(lines))}</span>
              </div>
              <p className="text-xs text-subtle">Kargo, kupon ve kampanya indirimleri ödeme adımında hesaplanır.</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/sepet" onClick={close} className="btn-secondary">
                  Sepete git
                </Link>
                <Link href="/odeme" onClick={close} className="btn-primary">
                  Ödemeye geç
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
