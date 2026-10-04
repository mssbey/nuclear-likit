// Test modu 3D Secure sayfası — YALNIZ DEMO_MODE=true.
// Gerçek sağlayıcıda müşteri bankanın sayfasına gider; burada sonucu müşteri
// seçer ve sipariş aynı durum makinesinden geçer (bkz. server/payments/mock).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { mockPaymentContext, MockPaymentError } from '@/server/payments/mock';
import { thankYouUrl } from '@/server/orders/access';
import { formatMinor } from '@/lib/money';
import { MockPaymentForm } from './MockPaymentForm';

export const metadata: Metadata = { title: 'Ödeme doğrulama (test)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MockPaymentPage({ searchParams }: { searchParams: Promise<{ siparis?: string; d?: string }> }) {
  const { siparis, d } = await searchParams;
  if (!siparis) notFound();

  let ctx;
  try {
    ctx = await mockPaymentContext(siparis);
  } catch (err) {
    if (err instanceof MockPaymentError && err.status === 404) notFound();
    throw err;
  }
  const done = ctx.status !== 'ödeme-bekliyor' && ctx.status !== 'başarısız';

  return (
    <div className="container-page flex justify-center py-16">
      <div className="card w-full max-w-md p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg">3D Secure doğrulama</h1>
            <p className="text-xs text-hazard">Test modu — gerçek ödeme alınmaz</p>
          </div>
        </div>
        <dl className="tabular mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Sipariş</dt>
          <dd className="font-semibold">{ctx.orderNumber}</dd>
          <dt className="text-muted">Tutar</dt>
          <dd className="font-semibold">{formatMinor(ctx.grandTotalMinor)}</dd>
          <dt className="text-muted">Kart</dt>
          <dd>TEST •••• 0000 · {ctx.installment > 1 ? `${ctx.installment} taksit` : 'tek çekim'}</dd>
        </dl>
        <p className="mt-5 rounded-xl bg-surface-2 p-3.5 text-xs leading-5 text-muted">
          Canlı mağazada burada bankanın doğrulama ekranı açılır. Test modunda sonucu sen seçersin; iki seçenek de siparişi gerçek akıştaki gibi ilerletir.
        </p>
        {done ? (
          <p className="mt-6 text-sm" role="status">
            Bu siparişin ödemesi zaten sonuçlanmış (durum: {ctx.status}).
          </p>
        ) : (
          <MockPaymentForm
            orderId={ctx.id}
            token={ctx.token}
            attempt={ctx.attempt}
            doneUrl={d && d.startsWith('/siparis/tamamlandi') ? d : thankYouUrl(ctx.orderNumber, ctx.id)}
          />
        )}
      </div>
    </div>
  );
}
