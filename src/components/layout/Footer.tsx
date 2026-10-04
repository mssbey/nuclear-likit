import Link from 'next/link';
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { getStoreInfo } from '@/server/settings';
import { getRootCategories } from '@/storefront/catalog';
import { Logo } from '@/components/ui/Logo';
import { site } from '@/lib/site';
import { NewsletterForm } from './NewsletterForm';

const HELP = [
  { href: '/siparis-takibi', label: 'Sipariş takibi' },
  { href: '/hesabim', label: 'Hesabım' },
  { href: '/sss', label: 'Sıkça sorulan sorular' },
  { href: '/iletisim', label: 'İletişim' },
];

const LEGAL = [
  { href: '/yasal/mesafeli-satis', label: 'Mesafeli satış sözleşmesi' },
  { href: '/yasal/on-bilgilendirme', label: 'Ön bilgilendirme formu' },
  { href: '/yasal/kvkk-aydinlatma', label: 'KVKK aydınlatma metni' },
];

export async function Footer() {
  const [info, categories] = await Promise.all([getStoreInfo(), getRootCategories()]);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted">{site.description}</p>
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold">Bültene katıl</p>
            <NewsletterForm />
          </div>
        </div>

        <nav aria-label="Kategoriler">
          <p className="mb-4 text-sm font-semibold">Kategoriler</p>
          <ul className="space-y-2.5 text-sm text-muted">
            <li>
              <Link href="/urunler" className="hover:text-fg">
                Tüm ürünler
              </Link>
            </li>
            {categories.slice(0, 7).map((c) => (
              <li key={c.id}>
                <Link href={`/kategori/${c.slug}`} className="hover:text-fg">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Yardım">
          <p className="mb-4 text-sm font-semibold">Yardım</p>
          <ul className="space-y-2.5 text-sm text-muted">
            {HELP.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-fg">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mb-4 mt-8 text-sm font-semibold">Yasal</p>
          <ul className="space-y-2.5 text-sm text-muted">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-fg">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="mb-4 text-sm font-semibold">İletişim</p>
          <ul className="space-y-3 text-sm text-muted">
            {info.phone && (
              <li className="flex gap-2.5">
                <Phone size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <a href={`tel:${info.phone.replace(/\s/g, '')}`} className="hover:text-fg">
                  {info.phone}
                </a>
              </li>
            )}
            {info.email && (
              <li className="flex gap-2.5">
                <Mail size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <a href={`mailto:${info.email}`} className="break-all hover:text-fg">
                  {info.email}
                </a>
              </li>
            )}
            {(info.address || info.city) && (
              <li className="flex gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span>{[info.address, info.city].filter(Boolean).join(', ')}</span>
              </li>
            )}
          </ul>
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-5 text-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            Kart bilgilerin bizde saklanmaz; ödemeler 3D Secure ile banka altyapısında alınır.
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {info.tradeName || site.name}. Tüm hakları saklıdır.
          </p>
          <p className="max-w-xl sm:text-right">
            Ürünlerimiz {site.minimumAge} yaş altındaki kişilere satılmaz. Nikotin bağımlılık yapan bir maddedir.
          </p>
        </div>
      </div>
    </footer>
  );
}
