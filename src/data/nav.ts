import type { Category, Collection } from '@/types';

export interface NavLink {
  label: string;
  href: string;
  emphasis?: boolean;
}

/**
 * Ana navigasyon çubuğundaki hızlı erişim linkleri ("TÜM KATEGORİLER"
 * butonunun yanında). Kategori ağacı ayrıca mega menüde listelenir.
 */
export const primaryNav: NavLink[] = [
  { label: 'Toptan Satın Al', href: '/iletisim?konu=toptan' },
  { label: 'Yeni Ürünler', href: '/yeni-gelenler' },
  { label: 'Fırsat Ürünleri', href: '/kampanyalar', emphasis: true },
  { label: 'Aroma Rehberi', href: '/aroma-rehberi' },
];

/** Mobil çekmece menüsündeki düz bağlantılar. */
export const mobileMenuLinks: NavLink[] = [
  { label: 'Ana Sayfa', href: '/' },
  { label: 'Tüm Ürünler', href: '/urunler' },
  { label: 'Toptan Satın Al', href: '/iletisim?konu=toptan' },
  { label: 'Yeni Ürünler', href: '/yeni-gelenler' },
  { label: 'Fırsat Ürünleri', href: '/kampanyalar' },
  { label: 'Aroma Rehberi', href: '/aroma-rehberi' },
  { label: 'Sipariş Takibi', href: '/siparis-takibi' },
  { label: 'İletişim', href: '/iletisim' },
  { label: 'Hesabım', href: '/hesabim' },
];

/**
 * Kategori ağacını "önce üst, hemen ardından altları" sırasında düzleştirir.
 * Menülerde alt kategorileri üstlerinin altında girintili göstermek için.
 */
export function flattenCategoryTree(
  categories: Category[],
  parentSlug: string | null = null,
  depth = 0,
): { category: Category; depth: number }[] {
  return categories
    .filter((c) => (c.parentSlug ?? null) === parentSlug)
    .flatMap((c) => [
      { category: c, depth },
      ...flattenCategoryTree(categories, c.slug, depth + 1),
    ]);
}

// Kategoriler artık veritabanından geldiği için mega menü modül yüklenirken
// değil, taksonomi elde edildiğinde kurulur (bkz. `useTaxonomy()`).
export function buildMegaMenuColumns(categories: Category[]) {
  // Menüde de ağaç sırası korunur; alt kategoriler `depth` ile girintilenir.
  const tree = flattenCategoryTree(categories);
  return [
    {
      heading: 'Tat Aileleri',
      links: tree
        .filter(({ category: c }) => !['diy-kitler', 'nbase'].includes(c.slug))
        .map(({ category: c, depth }) => ({
          label: c.name,
          href: `/kategori/${c.slug}`,
          hint: c.tagline,
          depth,
        })),
    },
    {
      heading: 'Set & Baz',
      links: [
        ...tree
          .filter(({ category: c }) => ['diy-kitler', 'nbase'].includes(c.slug))
          .map(({ category: c, depth }) => ({
            label: c.name,
            href: `/kategori/${c.slug}`,
            hint: c.tagline,
            depth,
          })),
        { label: 'Aroma Rehberi', href: '/aroma-rehberi', hint: 'Oran, karışım ve saklama' },
        { label: 'Aroma Bulucu', href: '/aroma-rehberi#bulucu', hint: 'Sana uygun profili keşfet' },
      ],
    },
    {
      heading: 'Keşfet',
      links: [
        { label: 'Tüm Ürünler', href: '/urunler', hint: `${categories.length} kategori` },
        { label: 'Yeni Ürünler', href: '/yeni-gelenler', hint: 'Son eklenenler' },
        { label: 'Fırsat Ürünleri', href: '/kampanyalar', hint: 'İndirimli seçkiler' },
      ],
    },
  ];
}

export function buildMegaMenuCollections(collections: Collection[]) {
  return collections.map((c) => ({
    label: c.name,
    href: `/koleksiyon/${c.slug}`,
    subtitle: c.subtitle,
    cover: c.cover,
  }));
}

export const footerNav = [
  {
    heading: 'Kurumsal',
    links: [
      { label: 'Hakkımızda', href: '/hakkimizda' },
      { label: 'Sıkça Sorulan Sorular', href: '/sss' },
      { label: 'Gizlilik Politikası', href: '/gizlilik-politikasi' },
      { label: 'KVKK Aydınlatma Metni', href: '/gizlilik-politikasi#kvkk' },
      { label: 'Mesafeli Satış Sözleşmesi', href: '/mesafeli-satis-sozlesmesi' },
      { label: 'İade ve Teslimat Koşulları', href: '/iade-ve-teslimat' },
      { label: 'Çerez Politikası', href: '/cerez-politikasi' },
    ],
  },
  {
    heading: 'Alışveriş',
    links: [
      { label: 'Tüm Ürünler', href: '/urunler' },
      { label: 'Yeni Ürünler', href: '/yeni-gelenler' },
      { label: 'Fırsat Ürünleri', href: '/kampanyalar' },
      { label: 'Sipariş Takibi', href: '/siparis-takibi' },
      { label: 'Favorilerim', href: '/favoriler' },
    ],
  },
];
