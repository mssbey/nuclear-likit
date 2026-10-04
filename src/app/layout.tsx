import type { Metadata, Viewport } from 'next';
import { getNavMenuContent } from '@/server/content/settings';
import { getRootCategories } from '@/storefront/catalog';
import { site } from '@/lib/site';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Header, type NavLink } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Toaster } from '@/components/layout/Toaster';
import { AgeGate } from '@/components/layout/AgeGate';
import './fonts.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.domain),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: { type: 'website', locale: site.locale, siteName: site.name },
  robots: { index: true, follow: true },
};

// Statik üretilen sayfalar (SSS, kategoriler, iletişim) mağaza bilgisini de
// gösterir; panelde değişince en geç 10 dk içinde tazelenir. Katalog ve
// içerik ayrıca /api/yenile ile anında düşürülür.
export const revalidate = 600;

export const viewport: Viewport = {
  themeColor: '#07080A',
  colorScheme: 'dark',
};

/** Panelde üst menü tanımlıysa o; değilse ürünü olan kök kategoriler. */
async function navLinks(): Promise<NavLink[]> {
  const [menu, categories] = await Promise.all([getNavMenuContent(), getRootCategories()]);
  if (menu.links.length) return menu.links.map((l) => ({ label: l.label, href: l.href, emphasis: l.emphasis }));
  return [
    { label: 'Tüm ürünler', href: '/urunler' },
    ...categories.slice(0, 5).map((c) => ({ label: c.name, href: `/kategori/${c.slug}` })),
    { label: 'Kampanyalar', href: '/kampanyalar', emphasis: true },
  ];
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const links = await navLinks();
  return (
    <html lang="tr">
      <head>
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#icerik" className="btn-primary sr-only z-[80] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          İçeriğe geç
        </a>
        <AnnouncementBar />
        <Header links={links} />
        <main id="icerik" className="flex-1">
          {children}
        </main>
        <Footer />
        <CartDrawer />
        <Toaster />
        <AgeGate />
      </body>
    </html>
  );
}
