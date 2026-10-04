import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Package } from 'lucide-react';
import { db } from '@/server/db';
import { getCurrentCustomer } from '@/server/customers/auth';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { formatMinor } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/orders/OrderView';
import { LogoutButton } from '@/components/account/AccountActions';

export const metadata: Metadata = { title: 'Hesabım', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: 'Europe/Istanbul' });

export default async function AccountPage() {
  const me = await getCurrentCustomer();
  if (!me) redirect('/giris?next=/hesabim');

  const rows = await db.order.findMany({
    where: { customerId: me.id, status: { not: 'taslak' } },
    orderBy: { placedAt: 'desc' },
    take: 50,
    include: publicOrderInclude,
  });
  const orders = rows.map(publicOrderView);

  return (
    <div className="container-page pb-6 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Hesabım</p>
          <h1 className="text-display-md">Merhaba, {me.firstName}</h1>
          <p className="mt-2 text-sm text-muted">{me.email}</p>
        </div>
        <LogoutButton />
      </div>

      <section aria-labelledby="orders-h" className="mt-10">
        <h2 id="orders-h" className="text-xl">
          Siparişlerim
        </h2>
        {orders.length === 0 ? (
          <EmptyState
            className="mt-5"
            icon={Package}
            title="Henüz siparişin yok"
            action={
              <Link href="/urunler" className="btn-primary">
                Alışverişe başla
              </Link>
            }
          />
        ) : (
          <ul className="card mt-5 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/hesabim/siparisler/${encodeURIComponent(o.orderNumber)}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 transition-colors hover:bg-surface-2 sm:p-5">
                  <span className="min-w-[150px]">
                    <span className="tabular block font-semibold">{o.orderNumber}</span>
                    <span className="block text-xs text-muted">{dateFmt.format(new Date(o.placedAt))}</span>
                  </span>
                  <StatusPill status={o.status} label={o.statusLabel} />
                  <span className="text-sm text-muted">{o.items.reduce((n, i) => n + i.quantity, 0)} ürün</span>
                  <span className="tabular ml-auto font-display font-semibold">{formatMinor(o.grandTotalMinor)}</span>
                  <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
