// "Tüm Kategoriler" mega menüsünün yapısı — panelden (Sayfalar > Mega menü)
// düzenlenir. Hem vitrin hem panel kullandığı için sunucuya bağımlı değildir.
//
// Kategori öğeleri slug ile tutulur; adı ve açıklaması her zaman kategorinin
// güncel bilgisinden gelir. "Alt kategorileri göster" açıksa altlar,
// Kategoriler sayfasındaki sırayla girintili listelenir.

export interface MegaMenuCategoryItem {
  type: 'category';
  slug: string;
  showChildren: boolean;
}

export interface MegaMenuLinkItem {
  type: 'link';
  label: string;
  href: string;
  hint: string;
}

export type MegaMenuItem = MegaMenuCategoryItem | MegaMenuLinkItem;

export interface MegaMenuColumn {
  heading: string;
  items: MegaMenuItem[];
}

export interface MegaMenuContent {
  columns: MegaMenuColumn[];
}

export const MEGA_MENU_MAX_COLUMNS = 4;

interface CategoryLike {
  slug: string;
  name: string;
  tagline: string;
  parentSlug: string | null;
}

/** Panelde hiç kayıt yokken gösterilen menü — eski sabit menünün aynısı. */
export function defaultMegaMenu(categories: CategoryLike[]): MegaMenuContent {
  const setBaz = ['diy-kitler', 'nbase'];
  const roots = categories.filter((c) => !c.parentSlug);
  const cat = (slug: string): MegaMenuCategoryItem => ({ type: 'category', slug, showChildren: true });
  return {
    columns: [
      { heading: 'Tat Aileleri', items: roots.filter((c) => !setBaz.includes(c.slug)).map((c) => cat(c.slug)) },
      {
        heading: 'Set & Baz',
        items: [
          ...roots.filter((c) => setBaz.includes(c.slug)).map((c) => cat(c.slug)),
          { type: 'link', label: 'Aroma Rehberi', href: '/aroma-rehberi', hint: 'Oran, karışım ve saklama' },
          { type: 'link', label: 'Aroma Bulucu', href: '/aroma-rehberi#bulucu', hint: 'Sana uygun profili keşfet' },
        ],
      },
      {
        heading: 'Keşfet',
        items: [
          { type: 'link', label: 'Tüm Ürünler', href: '/urunler', hint: `${categories.length} kategori` },
          { type: 'link', label: 'Yeni Ürünler', href: '/yeni-gelenler', hint: 'Son eklenenler' },
          { type: 'link', label: 'Fırsat Ürünleri', href: '/kampanyalar', hint: 'İndirimli seçkiler' },
        ],
      },
    ],
  };
}

export interface MegaMenuLink {
  label: string;
  href: string;
  hint?: string;
  depth: number;
}

/**
 * Menü yapısını vitrinde çizilecek bağlantılara çevirir. Silinmiş/yayından
 * kalkmış kategoriler sessizce atlanır. `categories` ağaç sırasındadır.
 */
export function resolveMegaMenu(content: MegaMenuContent, categories: CategoryLike[]) {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const descendants = (slug: string, depth: number): MegaMenuLink[] =>
    categories
      .filter((c) => c.parentSlug === slug)
      .flatMap((c) => [
        { label: c.name, href: `/kategori/${c.slug}`, hint: c.tagline, depth },
        ...descendants(c.slug, depth + 1),
      ]);

  return content.columns.map((col) => ({
    heading: col.heading,
    links: col.items.flatMap((item): MegaMenuLink[] => {
      if (item.type === 'link') return [{ label: item.label, href: item.href, hint: item.hint, depth: 0 }];
      const c = bySlug.get(item.slug);
      if (!c) return [];
      return [
        { label: c.name, href: `/kategori/${c.slug}`, hint: c.tagline, depth: 0 },
        ...(item.showChildren ? descendants(c.slug, 1) : []),
      ];
    }),
  }));
}
