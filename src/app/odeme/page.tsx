// Ödeme — sunucu kabuğu: müşteri oturumu, adres defteri, yasal metinlerin
// güncel sürümleri ve mağaza bilgisi okunup istemci akışına verilir.

import type { Metadata } from 'next';
import { getCurrentCustomer } from '@/server/customers/auth';
import { listAddresses } from '@/server/customers/addresses';
import { ensureDefaultLegalDocuments, getCurrentLegal } from '@/server/legal/documents';
import { getStoreInfo, getStoreSettings } from '@/server/settings';
import { publicCustomer } from '@/server/customers/public';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { CheckoutClient } from './CheckoutClient';

export const metadata: Metadata = { title: 'Ödeme', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  await ensureDefaultLegalDocuments();
  const [customer, info, settings, ds, pi, kvkk] = await Promise.all([
    getCurrentCustomer(),
    getStoreInfo(),
    getStoreSettings(),
    getCurrentLegal('mesafeli-satis'),
    getCurrentLegal('on-bilgilendirme'),
    getCurrentLegal('kvkk-aydinlatma'),
  ]);
  const addresses = customer ? await listAddresses(customer.id) : [];

  return (
    <div className="container-page pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'Sepet', href: '/sepet' }, { label: 'Ödeme' }]} />
      <h1 className="mt-6 text-display-md">Ödeme</h1>
      <CheckoutClient
        customer={customer ? publicCustomer(customer) : null}
        addresses={addresses}
        legal={{
          distanceSales: { version: ds.version, title: ds.title, body: ds.body },
          preInfo: { version: pi.version, title: pi.title, body: pi.body },
          kvkk: { version: kvkk.version, title: kvkk.title, body: kvkk.body },
        }}
        store={{
          legalName: info.legalName,
          address: [info.address, info.city].filter(Boolean).join(', '),
          phone: info.phone,
          email: info.email,
          tax: [info.taxOffice, info.taxNumber].filter(Boolean).join(' / '),
          withdrawalDays: settings.withdrawalDays,
        }}
      />
    </div>
  );
}
