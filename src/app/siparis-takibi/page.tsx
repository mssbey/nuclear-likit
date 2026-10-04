import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { TrackOrderForm } from './TrackOrderForm';

export const metadata: Metadata = { title: 'Sipariş takibi', robots: { index: false, follow: true } };

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const { no } = await searchParams;
  return (
    <div className="container-page pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'Sipariş takibi' }]} />
      <h1 className="mt-6 text-display-md">Sipariş takibi</h1>
      <p className="mt-3 max-w-xl text-muted">Sipariş numaranı ve siparişte kullandığın e-posta adresini gir; durumunu ve kargo bilgisini gör.</p>
      <TrackOrderForm initialNo={no ?? ''} />
    </div>
  );
}
