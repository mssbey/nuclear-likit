// Sipariş tamamlandı. Erişim: imzalı `t` jetonu veya siparişin sahibi olan
// oturumlu müşteri; ikisi de yoksa yalnız "alındı" mesajı gösterilir.

import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock, Landmark, XCircle } from 'lucide-react';
import { db } from '@/server/db';
import { currentStore } from '@/server/store-context';
import { getCurrentCustomer } from '@/server/customers/auth';
import { verifyOrderAccessToken } from '@/server/orders/access';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { getPaymentSettings } from '@/server/payments/settings';
import { getStoreInfo } from '@/server/settings';
import { formatMinor } from '@/lib/money';
import { OrderView } from '@/components/orders/OrderView';
import { RetryPaymentButton } from '@/components/orders/RetryPaymentButton';
import { ClearCartOnMount } from './ClearCartOnMount';

export const metadata: Metadata = { title: 'Sipariş alındı', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ThankYouPage({ searchParams }: { searchParams: Promise<{ no?: string; t?: string }> }) {
  const { no, t } = await searchParams;
  const orderNumber = (no ?? '').toUpperCase();
  const row = orderNumber
    ? await db.order.findFirst({ where: { orderNumber, store: currentStore() }, include: { ...publicOrderInclude, customer: { select: { email: true } } } })
    : null;
  const me = await getCurrentCustomer();
  const authorized = row != null && (verifyOrderAccessToken(row.id, t) || (me != null && row.customerId === me.id));

  if (!row || !authorized) {
    return (
      <div className="container-page flex justify-center py-20">
        <div className="max-w-md text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CheckCircle2 size={32} aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-display-sm">Siparişin alındı</h1>
          <p className="mt-3 text-muted">
            {orderNumber ? `${orderNumber} numaralı siparişin için teşekkürler.` : 'Teşekkürler.'} Detayları sipariş numaran ve e-posta adresinle görebilirsin.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={`/siparis-takibi${orderNumber ? `?no=${encodeURIComponent(orderNumber)}` : ''}`} className="btn-primary">
              Siparişi takip et
            </Link>
            <Link href="/urunler" className="btn-secondary">
              Alışverişe devam et
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const order = publicOrderView(row);
  const email = row.customer?.email ?? row.guestEmail ?? '';
  const waiting = order.status === 'ödeme-bekliyor';
  const failed = order.status === 'başarısız';
  const [payment, info] = waiting && order.paymentMethod === 'havale' ? await Promise.all([getPaymentSettings(), getStoreInfo()]) : [null, null];
  const Icon = failed ? XCircle : waiting ? Clock : CheckCircle2;

  return (
    <div className="container-page pb-6 pt-10">
      {!failed && <ClearCartOnMount />}
      <div className="card relative mb-6 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${failed ? 'bg-danger-soft text-danger' : waiting ? 'bg-hazard-soft text-hazard' : 'bg-accent-soft text-accent'}`}>
            <Icon size={28} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-display-sm">{failed ? 'Ödeme alınamadı' : waiting ? 'Siparişin alındı — ödeme bekleniyor' : 'Teşekkürler, siparişin alındı!'}</h1>
            <p className="mt-2 text-sm text-muted">
              Sipariş numaran <strong className="text-fg">{order.orderNumber}</strong>.{email && <> Onay e-postası <strong className="text-fg">{email}</strong> adresine gönderildi.</>}
            </p>

            {payment && (
              <div className="mt-5 rounded-xl border border-line-strong bg-surface-2 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <Landmark size={16} className="text-accent" aria-hidden="true" /> Havale / EFT bilgileri
                </p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-muted">Alıcı</dt>
                  <dd>{payment.havale.accountHolder || info?.legalName}</dd>
                  {payment.havale.bankName && (
                    <>
                      <dt className="text-muted">Banka</dt>
                      <dd>{payment.havale.bankName}</dd>
                    </>
                  )}
                  <dt className="text-muted">IBAN</dt>
                  <dd className="tabular break-all font-medium">{payment.havale.iban || 'Mağaza tarafından e-posta ile iletilecek'}</dd>
                  <dt className="text-muted">Tutar</dt>
                  <dd className="tabular font-semibold">{formatMinor(order.grandTotalMinor)}</dd>
                  <dt className="text-muted">Açıklama</dt>
                  <dd className="font-semibold">{order.orderNumber}</dd>
                </dl>
                {payment.havale.instructions && <p className="mt-3 text-xs text-muted">{payment.havale.instructions}</p>}
              </div>
            )}

            {order.canRetryPayment && (
              <div className="mt-5">
                <RetryPaymentButton orderId={row.id} token={t} />
              </div>
            )}
          </div>
        </div>
      </div>

      <OrderView order={order} />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/urunler" className="btn-secondary">
          Alışverişe devam et
        </Link>
        {me ? (
          <Link href="/hesabim" className="btn-primary">
            Siparişlerim
          </Link>
        ) : (
          <Link href={`/kayit?eposta=${encodeURIComponent(email)}`} className="btn-primary">
            Hesap oluştur, siparişlerini takip et
          </Link>
        )}
      </div>
    </div>
  );
}
