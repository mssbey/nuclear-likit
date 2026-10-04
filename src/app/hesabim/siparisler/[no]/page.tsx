import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db';
import { getCurrentCustomer } from '@/server/customers/auth';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { OrderView } from '@/components/orders/OrderView';
import { CancelOrderButton } from '@/components/account/AccountActions';
import { RetryPaymentButton } from '@/components/orders/RetryPaymentButton';

export const metadata: Metadata = { title: 'Sipariş detayı', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const CANCELLABLE = new Set(['ödeme-bekliyor', 'başarısız', 'ödendi', 'hazırlanıyor']);

export default async function OrderPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const me = await getCurrentCustomer();
  if (!me) redirect(`/giris?next=/hesabim/siparisler/${encodeURIComponent(no)}`);

  const row = await db.order.findFirst({ where: { customerId: me.id, orderNumber: decodeURIComponent(no).toUpperCase() }, include: publicOrderInclude });
  if (!row) notFound();
  const order = publicOrderView(row);

  return (
    <div className="container-page pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'Hesabım', href: '/hesabim' }, { label: order.orderNumber }]} />
      <div className="mb-6 mt-6 flex flex-wrap items-center gap-3">
        {order.canRetryPayment && <RetryPaymentButton orderId={order.id} />}
        {CANCELLABLE.has(order.status) && <CancelOrderButton orderNumber={order.orderNumber} />}
      </div>
      <OrderView order={order} />
    </div>
  );
}
