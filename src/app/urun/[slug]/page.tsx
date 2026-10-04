import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { draftMode } from 'next/headers';
import { ChevronDown, Eye } from 'lucide-react';
import { getCategoryById, getCategoryTrail, getProductBySlug, getProductForPreview, getRelated } from '@/storefront/catalog';
import { stripRichText } from '@/lib/rich-text';
import { fromMinor } from '@/lib/money';
import { site } from '@/lib/site';
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs';
import { ProductBuyBox } from '@/components/product/ProductBuyBox';
import { ProductRail } from '@/components/product/ProductRail';
import { RichText } from '@/components/product/RichText';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = (await draftMode()).isEnabled ? await getProductForPreview(slug) : await getProductBySlug(slug);
  if (!product) return { title: 'Ürün bulunamadı' };
  const description = product.seo.description || product.shortDescription || stripRichText(product.description).slice(0, 160);
  return {
    title: product.seo.title || product.name,
    description,
    alternates: { canonical: `/urun/${product.slug}` },
    openGraph: { title: product.name, description, images: product.images[0] ? [product.images[0].src] : [] },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const preview = (await draftMode()).isEnabled;
  const product = preview ? await getProductForPreview(slug) : await getProductBySlug(slug);
  if (!product) notFound();

  // İçerik haritası: ürünün birincil kategorisi ve üstleri.
  const node = product.categoryIds[0] ? await getCategoryById(product.categoryIds[0]) : undefined;
  const trail = node ? await getCategoryTrail(node) : [];
  const crumbs: Crumb[] = [...trail.map((c) => ({ label: c.name, href: `/kategori/${c.slug}` })), { label: product.name }];
  const related = await getRelated(product);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images.map((i) => i.src),
    description: product.shortDescription || stripRichText(product.description).slice(0, 300),
    sku: product.variants[0]?.sku,
    brand: product.series ? { '@type': 'Brand', name: product.series } : undefined,
    offers: product.variants.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      price: fromMinor(v.priceMinor).toFixed(2),
      priceCurrency: 'TRY',
      availability: v.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${site.domain}/urun/${product.slug}`,
    })),
  };

  return (
    <>
      {preview && (
        <div className="border-b border-hazard/40 bg-hazard-soft">
          <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm text-hazard">
            <span className="inline-flex items-center gap-2 font-semibold">
              <Eye size={16} aria-hidden="true" /> Önizleme modu — panelden kaydedilen güncel hal (taslak dahil)
            </span>
            <a href={`/api/onizleme?cikis=1&slug=${encodeURIComponent(product.slug)}`} className="underline underline-offset-4">
              Önizlemeden çık
            </a>
          </div>
        </div>
      )}
      <div className="container-page pt-8">
        <Breadcrumbs items={crumbs} />
        <div className="mt-6">
          <ProductBuyBox product={product}>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {product.description && (
                <details open className="group py-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                    Ürün açıklaması
                    <ChevronDown size={20} className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-3">
                    <RichText text={product.description} />
                  </div>
                </details>
              )}
              {product.flavorNotes.length > 0 && (
                <details className="group py-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                    Aroma notaları
                    <ChevronDown size={20} className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {product.flavorNotes.map((n) => (
                      <li key={n.label} className="chip">
                        {n.label}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {product.faq.length > 0 && (
                <details className="group py-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                    Sık sorulanlar
                    <ChevronDown size={20} className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <dl className="mt-3 space-y-4">
                    {product.faq.map((f) => (
                      <div key={f.question}>
                        <dt className="font-semibold">{f.question}</dt>
                        <dd className="mt-1 text-sm leading-6 text-muted">{f.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              <details className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                  Kargo ve iade
                  <ChevronDown size={20} className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="prose-dark mt-3">
                  <p>Siparişin 1–3 iş günü içinde kargoya verilir; takip numarası e-posta ile gönderilir.</p>
                  <p>
                    Ambalajı açılmamış ürünlerde teslimattan itibaren yasal cayma süresi içinde iade talebi oluşturabilirsin. Hijyen nedeniyle açılmış likit
                    ve kartuşlar iade alınamaz.
                  </p>
                </div>
              </details>
            </div>
          </ProductBuyBox>
        </div>
      </div>

      <ProductRail eyebrow="Bunlar da ilgini çekebilir" title="Benzer ürünler" products={related} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
