import { Sparkles } from 'lucide-react';
import { getHomeData, getRootCategories, listProducts } from '@/storefront/catalog';
import { Hero } from '@/components/home/Hero';
import { CategoryTiles } from '@/components/home/CategoryTiles';
import { ValueProps } from '@/components/home/ValueProps';
import { PromoBand } from '@/components/home/PromoBand';
import { ProductRail } from '@/components/product/ProductRail';
import { EmptyState } from '@/components/ui/EmptyState';

export default async function HomePage() {
  const [home, categories, onSaleAll] = await Promise.all([
    getHomeData(),
    getRootCategories(),
    listProducts({ onlySale: true, onlyInStock: true }),
  ]);

  return (
    <>
      <Hero spotlight={home.featured[0]} flavors={categories.map((c) => c.name)} />

      {home.total === 0 ? (
        <div id="koleksiyon" className="container-page py-16">
          <EmptyState
            icon={Sparkles}
            title="Mağaza hazırlanıyor"
            description="Ürünlerimiz çok yakında burada. Bültene kaydol, açılıştan ilk sen haberdar ol."
          />
        </div>
      ) : (
        <>
          <CategoryTiles categories={categories} />
          <ProductRail eyebrow="Seçtiklerimiz" title="Öne çıkanlar" href="/urunler" products={home.featured} />
          <PromoBand count={onSaleAll.length} />
          <ProductRail eyebrow="Taze stok" title="Yeni gelenler" href="/urunler?sirala=yeni" products={home.newest} />
          <ValueProps />
          <ProductRail eyebrow="Favoriler" title="Çok satanlar" href="/urunler?sirala=cok-satan" products={home.bestSellers} />
        </>
      )}
    </>
  );
}
