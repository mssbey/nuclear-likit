'use client';

// "Ödemeyi tamamla": ödemeyi sağlayıcıda (test modunda mock sayfada) yeniden başlatır.

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

export function RetryPaymentButton({ orderId, token }: { orderId: string; token?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/yeniden', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, token }),
      });
      const body = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !body.url) throw new Error(body.message ?? 'Ödeme başlatılamadı');
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödeme başlatılamadı');
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className="btn-primary" onClick={start} disabled={busy}>
        {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <CreditCard size={17} aria-hidden="true" />}
        {busy ? 'Yönlendiriliyor…' : 'Ödemeyi tamamla'}
      </button>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
