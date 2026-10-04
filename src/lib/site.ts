// Nuclear Likit site yapılandırması.
//
// Ortak sunucu kodu (Mixle'dan senkronlanır) bu dosyadan yalnız `site.name`
// ve `site.domain` okur. İletişim/unvan bilgileri panelden (Ayarlar → Mağaza)
// gelir — `getStoreInfo()`; buradakiler kayıt yokken görünen yedeklerdir.

export const site = {
  name: 'Nuclear Likit',
  shortName: 'Nuclear',
  domain: process.env.NEXT_PUBLIC_SITE_URL || 'https://nuclearlikit.com',
  description:
    'Nuclear Likit — premium likit, salt nikotin ve pod sistem ürünleri. Hızlı kargo, güvenli ödeme, orijinal ürün.',
  tagline: 'Yoğun aroma. Sıfır taviz.',
  locale: 'tr_TR',
  /** Yaş sınırı — vitrin ilk ziyarette doğrulama ister. */
  minimumAge: 18,
  commerce: {
    estimatedDelivery: '1–3 iş günü içinde kargoda',
  },
  announcements: [
    'Tüm siparişler sızdırmaz, darbe emici paketle gönderilir',
    'Kredi kartına taksit · havale · kapıda ödeme',
    'Satışlar yalnızca 18 yaş ve üzeri kullanıcılara yapılır',
  ],
} as const;

/**
 * Ürün görseli adresi. Panelden yüklenenler Vercel Blob'da (mutlak URL);
 * görece yollar (`/images/…`, `/api/medya/…`) Mixle dağıtımında durur.
 */
export function mediaUrl(src: string | null | undefined): string {
  if (!src) return '';
  if (/^https?:\/\//.test(src)) return src;
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://mixle.net').replace(/\/$/, '');
  return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** TL biçimlendirici — ortak kod (`lib/money`, `lib/admin/format`) bunu bekler. */
export const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
