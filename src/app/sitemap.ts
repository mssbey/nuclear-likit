import type { MetadataRoute } from 'next';
import { getAllSlugs } from '@/storefront/catalog';
import { site } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.domain.replace(/\/$/, '');
  const { products, categories } = await getAllSlugs();
  const fixed = ['', '/urunler', '/kategori', '/kampanyalar', '/sss', '/iletisim'].map((p) => ({ url: `${base}${p}` }));
  return [
    ...fixed,
    ...categories.map((slug) => ({ url: `${base}/kategori/${slug}` })),
    ...products.map((p) => ({ url: `${base}/urun/${p.slug}`, lastModified: p.updatedAt })),
  ];
}
