import Link from 'next/link';
import { ArrowRight, ShieldCheck, Truck, Zap } from 'lucide-react';
import type { ProductCardData } from '@/lib/product';
import { ProductImage } from '@/components/ui/ProductImage';
import { Price } from '@/components/ui/Price';
import { site } from '@/lib/site';

export function Hero({ spotlight, productCount }: { spotlight: ProductCardData | undefined; productCount: number }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Dekoratif katmanlar: ızgara + radyoaktif parıltı */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-accent/20 blur-[140px] animate-pulse-slow" />

      <div className="container-page relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
        <div className="animate-fade-up">
          <p className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Yeni nesil likit mağazası
          </p>
          <h1 className="mt-5 text-display-lg">
            Yoğun aroma.
            <br />
            <span className="text-accent">Sıfır taviz.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted sm:text-lg">
            Seçkin likitler, salt nikotin serileri ve pod sistemler. Orijinal ürün, sızdırmaz paket, hızlı kargo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/urunler" className="btn-primary h-12 px-6 text-base">
              Ürünleri keşfet <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/kampanyalar" className="btn-secondary h-12 px-6 text-base">
              Kampanyalar
            </Link>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
            <div>
              <dt className="text-xs text-muted">Ürün</dt>
              <dd className="tabular mt-1 font-display text-2xl font-semibold">{productCount}+</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted">
                <Truck size={13} aria-hidden="true" /> Kargo
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold">1–3 gün</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted">
                <ShieldCheck size={13} aria-hidden="true" /> Ödeme
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold">3D Secure</dd>
            </div>
          </dl>
        </div>

        {spotlight ? (
          <Link
            href={`/urun/${spotlight.slug}`}
            className="group relative mx-auto block w-full max-w-md animate-fade-up [animation-delay:120ms]"
            aria-label={`Öne çıkan: ${spotlight.name}`}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-line-strong bg-gradient-to-b from-surface-2 to-surface">
              <div className="absolute inset-x-10 bottom-10 top-16 rounded-full bg-accent/25 blur-3xl transition-opacity duration-500 group-hover:opacity-90" />
              <ProductImage src={spotlight.image} alt={spotlight.imageAlt} sizes="(min-width: 1024px) 420px, 80vw" priority className="p-10 transition-transform duration-700 group-hover:scale-105" />
              <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-bg/70 px-3 py-1.5 text-xs font-semibold text-accent backdrop-blur">
                <Zap size={13} aria-hidden="true" /> Öne çıkan
              </span>
            </div>
            <div className="absolute -bottom-5 left-5 right-5 rounded-2xl border border-line-strong bg-surface/90 p-4 shadow-lift backdrop-blur-xl sm:left-auto sm:w-72">
              <p className="truncate text-sm font-semibold">{spotlight.name}</p>
              <div className="mt-1 flex items-center justify-between">
                <Price priceMinor={spotlight.priceMinor} compareAtMinor={spotlight.compareAtMinor} size="sm" />
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                  İncele <ArrowRight size={14} aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="relative mx-auto grid aspect-square w-full max-w-sm place-items-center rounded-[2rem] border border-line-strong bg-surface-2">
            <p className="font-display text-6xl font-bold text-accent">{site.shortName.toUpperCase()}</p>
          </div>
        )}
      </div>
    </section>
  );
}
