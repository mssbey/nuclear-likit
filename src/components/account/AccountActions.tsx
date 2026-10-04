'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, XCircle } from 'lucide-react';
import { accountApi } from '@/lib/checkout-client';
import { toast } from '@/store/toast';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await accountApi.logout().catch(() => {});
        router.replace('/');
        router.refresh();
      }}
    >
      <LogOut size={17} aria-hidden="true" /> Çıkış yap
    </button>
  );
}

/** Kargolanmamış siparişi iptal — geri alınamaz, önce onay istenir. */
export function CancelOrderButton({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    try {
      await accountApi.cancelOrder(orderNumber);
      toast.success('Sipariş iptal edildi', 'Ödeme yapıldıysa iade süreci başlatılır.');
      router.refresh();
    } catch (err) {
      toast.error('İptal edilemedi', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <button type="button" className="btn-secondary text-danger" onClick={() => setConfirming(true)}>
        <XCircle size={17} aria-hidden="true" /> Siparişi iptal et
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="İptal onayı" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm">
      <span>Sipariş iptal edilsin mi? Bu işlem geri alınamaz.</span>
      <button type="button" className="btn bg-danger px-4 text-black hover:bg-danger/90" onClick={cancel} disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Evet, iptal et
      </button>
      <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
        Vazgeç
      </button>
    </div>
  );
}
