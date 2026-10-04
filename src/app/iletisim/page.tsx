import type { Metadata } from 'next';
import { Mail, MapPin, Phone } from 'lucide-react';
import { getStoreInfo } from '@/server/settings';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

export const metadata: Metadata = { title: 'İletişim', alternates: { canonical: '/iletisim' } };

export default async function ContactPage() {
  const info = await getStoreInfo();
  const items = [
    info.phone && { icon: Phone, label: 'Telefon', value: info.phone, href: `tel:${info.phone.replace(/\s/g, '')}` },
    info.email && { icon: Mail, label: 'E-posta', value: info.email, href: `mailto:${info.email}` },
    (info.address || info.city) && { icon: MapPin, label: 'Adres', value: [info.address, info.city].filter(Boolean).join(', ') },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string }[];

  return (
    <div className="container-page max-w-3xl pb-6 pt-8">
      <Breadcrumbs items={[{ label: 'İletişim' }]} />
      <h1 className="mt-6 text-display-md">İletişim</h1>
      <p className="mt-3 text-muted">Sipariş, ürün ya da iade hakkında sorularını yanıtlamaktan memnuniyet duyarız.</p>
      {items.length === 0 ? (
        <p className="card mt-8 p-6 text-sm text-muted">İletişim bilgileri yakında burada olacak.</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {items.map(({ icon: Icon, label, value, href }) => (
            <li key={label} className="card flex gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted">{label}</span>
                {href ? (
                  <a href={href} className="mt-0.5 block break-words font-medium hover:text-accent">
                    {value}
                  </a>
                ) : (
                  <span className="mt-0.5 block font-medium">{value}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {info.legalName && (
        <p className="mt-8 text-xs text-subtle">
          {info.legalName}
          {info.taxOffice && ` · ${info.taxOffice} V.D.`}
          {info.taxNumber && ` · ${info.taxNumber}`}
          {info.mersisNo && ` · MERSİS ${info.mersisNo}`}
        </p>
      )}
    </div>
  );
}
