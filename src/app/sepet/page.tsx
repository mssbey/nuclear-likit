import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { CartPageClient } from './CartPageClient';

export const metadata: Metadata = { title: 'Sepet', robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <div className="container-page pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'Sepet' }]} />
      <h1 className="mt-6 text-display-md">Sepetim</h1>
      <CartPageClient />
    </div>
  );
}
