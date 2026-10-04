'use client';

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { checkoutApi } from '@/lib/checkout-client';
import type { PublicOrder } from '@/server/orders/view';
import { OrderView } from '@/components/orders/OrderView';

export function TrackOrderForm({ initialNo }: { initialNo: string }) {
  const [no, setNo] = useState(initialNo);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await checkoutApi.trackOrder(no.trim().toUpperCase(), email.trim());
      setOrder(r.order);
    } catch (err) {
      setOrder(null);
      setError(err instanceof Error ? err.message : 'Sipariş bulunamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="card mt-8 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
        <div>
          <label htmlFor="tr-no" className="field-label">
            Sipariş numarası
          </label>
          <input id="tr-no" className="field uppercase" placeholder="NL-2026-000001" value={no} onChange={(e) => setNo(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="tr-email" className="field-label">
            E-posta
          </label>
          <input id="tr-email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />} Sorgula
        </button>
        <p role="alert" className="text-sm text-danger sm:col-span-3 empty:hidden">
          {error ?? ''}
        </p>
      </form>
      {order && (
        <div className="mt-8 animate-fade-up">
          <OrderView order={order} />
        </div>
      )}
    </>
  );
}
