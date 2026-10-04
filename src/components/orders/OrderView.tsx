import { ExternalLink, MapPin, Package, Truck } from 'lucide-react';
import type { PublicOrder } from '@/server/orders/view';
import { formatMinor } from '@/lib/money';
import { mediaUrl } from '@/lib/site';
import { ProductImage } from '@/components/ui/ProductImage';
import { cn } from '@/lib/utils';

const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });

const STATUS_TONE: Record<string, string> = {
  'ödeme-bekliyor': 'bg-hazard-soft text-hazard',
  ödendi: 'bg-accent-soft text-accent',
  hazırlanıyor: 'bg-accent-soft text-accent',
  kargolandı: 'bg-accent-soft text-accent',
  'teslim-edildi': 'bg-success-soft text-success',
  tamamlandı: 'bg-success-soft text-success',
  iptal: 'bg-danger-soft text-danger',
  başarısız: 'bg-danger-soft text-danger',
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return <span className={cn('inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold', STATUS_TONE[status] ?? 'bg-surface-3 text-muted')}>{label}</span>;
}

export function OrderView({ order }: { order: PublicOrder }) {
  const a = order.shippingAddress;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <section className="card p-5 sm:p-6" aria-labelledby="ov-items">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ov-items" className="text-lg">
              Sipariş {order.orderNumber}
            </h2>
            <StatusPill status={order.status} label={order.statusLabel} />
          </div>
          <p className="mt-1 text-xs text-muted">{dateFmt.format(new Date(order.placedAt))}</p>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  <ProductImage src={mediaUrl(i.imageUrl)} alt="" sizes="64px" className="p-1" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.name}</span>
                  {i.variantLabel && <span className="block text-xs text-muted">{i.variantLabel}</span>}
                  <span className="tabular block text-xs text-muted">
                    {i.quantity} × {formatMinor(i.unitPriceMinor)}
                    {i.refundedQuantity > 0 && <span className="ml-2 text-hazard">({i.refundedQuantity} iade)</span>}
                  </span>
                </span>
                <span className="tabular text-sm font-semibold">{formatMinor(i.lineTotalMinor - i.discountMinor)}</span>
              </li>
            ))}
          </ul>
        </section>

        {order.shipments.length > 0 && (
          <section className="card p-5 sm:p-6" aria-labelledby="ov-ship">
            <h2 id="ov-ship" className="flex items-center gap-2 text-lg">
              <Truck size={18} className="text-accent" aria-hidden="true" /> Kargo
            </h2>
            <ul className="mt-3 space-y-3">
              {order.shipments.map((s) => (
                <li key={s.id} className="rounded-xl bg-surface-2 p-3.5 text-sm">
                  <p className="font-medium capitalize">{s.carrier}</p>
                  {s.trackingNumber && (
                    <p className="tabular mt-0.5 text-muted">
                      Takip no: {s.trackingNumber}
                      {s.trackingUrl && (
                        <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="link ml-2 inline-flex items-center gap-1">
                          Takip et <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {order.events.length > 0 && (
          <section className="card p-5 sm:p-6" aria-labelledby="ov-events">
            <h2 id="ov-events" className="text-lg">
              Sipariş geçmişi
            </h2>
            <ol className="mt-4 space-y-4 border-l border-line pl-5">
              {order.events.map((e, i) => (
                <li key={i} className="relative">
                  <span className={cn('absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full', i === order.events.length - 1 ? 'bg-accent' : 'bg-line-strong')} aria-hidden="true" />
                  <p className="text-sm">{e.message}</p>
                  <p className="text-xs text-subtle">{dateFmt.format(new Date(e.at))}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <div className="space-y-5">
        <section className="card p-5" aria-label="Tutar">
          <dl className="tabular space-y-2 text-sm">
            <Row label="Ara toplam" value={formatMinor(order.itemsSubtotalMinor)} />
            {order.discountTotalMinor > 0 && <Row label="İndirim" value={`−${formatMinor(order.discountTotalMinor)}`} />}
            <Row label="Kargo" value={order.shippingTotalMinor === 0 ? 'Ücretsiz' : formatMinor(order.shippingTotalMinor)} />
            {order.surchargeMinor > 0 && <Row label="Kapıda ödeme bedeli" value={formatMinor(order.surchargeMinor)} />}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-semibold">Toplam</dt>
              <dd className="font-display text-xl font-semibold">{formatMinor(order.grandTotalMinor)}</dd>
            </div>
            {order.refundedTotalMinor > 0 && <Row label="İade edilen" value={formatMinor(order.refundedTotalMinor)} />}
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">Ödeme: {order.paymentMethodLabel}</p>
        </section>
        <section className="card p-5 text-sm" aria-label="Teslimat adresi">
          <p className="flex items-center gap-2 font-semibold">
            <MapPin size={16} className="text-accent" aria-hidden="true" /> Teslimat adresi
          </p>
          <p className="mt-2 leading-6 text-muted">
            {a.firstName} {a.lastName}
            <br />
            {a.addressLine}
            <br />
            {[a.neighborhood, a.district, a.city].filter(Boolean).join(', ')}
          </p>
          {order.shippingMethod && (
            <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <Package size={14} aria-hidden="true" /> {order.shippingMethod.name}
              {order.shippingMethod.estimatedDays && ` · ${order.shippingMethod.estimatedDays}`}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
