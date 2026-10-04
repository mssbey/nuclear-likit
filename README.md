# Nuclear Likit

Koyu temalı Türkçe e-ticaret vitrini. **Panel yoktur**: ürünler, kategoriler,
siparişler, kuponlar, kargo, ödeme ve e-posta ayarları Mixle'ın panelinden
(`mixle.net/admin` → üst çubuktaki mağaza seçicide **Nuclear Likit**) yönetilir.
İki site aynı PostgreSQL veritabanını kullanır; kayıtlar `store = 'nuclear'`
ile ayrılır.

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 3, Prisma 7, Zustand.

## Mimari

| Katman | Nerede | Not |
| --- | --- | --- |
| Vitrin arayüzü | `src/app`, `src/components`, `src/storefront`, `src/store`, `src/lib/{site,product,hooks,utils}.ts` | Bu repoya özgü |
| İş mantığı (fiyat, stok, kupon, kargo, sipariş, ödeme, müşteri) | `src/server`, `src/lib/*` (aşağıdaki liste), `src/types` | **Mixle'dan senkron** — burada düzenlenmez |
| Vitrin API uçları | `src/app/api/{checkout,hesap,payments,webhooks,siparis-takibi,adres,abonelik,cron/katalog-yenile}` | **Mixle'dan senkron** |
| Nuclear'a özgü uçlar | `src/app/api/{ara,yenile,onizleme}` | Canlı arama, panelden önbellek yenileme, imzalı önizleme |
| Şema | `prisma/schema.prisma` | **Mixle'dan senkron**; bu proje migration çalıştırmaz |

Senkronlanan yolların tam listesi `scripts/sync-shared.mjs` içindeki `SHARED`
dizisindedir.

```sh
npm run sync         # Mixle'dan kopyala (Mixle: ../mixle.net, MIXLE_DIR ile değişir)
npm run sync:check   # yalnız karşılaştır; fark varsa çıkış kodu 1
```

Ortak kodda değişiklik **Mixle reposunda** yapılır; ardından burada
`npm run sync`, `npm run typecheck` ve commit. Vercel derlemesi Mixle reposunu
görmez; bu yüzden kopyalar repoda tutulur.

## Kurulum

```sh
npm install            # postinstall Prisma istemcisini üretir
cp .env.example .env   # değişkenler için dosyadaki açıklamalara bakın
npm run dev -- --port 3200
```

Yerelde Mixle ile aynı veritabanı kullanılır (`DATABASE_URL`). Ürün eklemek
için Mixle'ı çalıştırıp panelde mağazayı **Nuclear Likit** yapın.

## Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `STORE_ID` | `nuclear` — tüm sorgular bu mağazaya göre yapılır |
| `DATABASE_URL` | Mixle ile **aynı** veritabanı |
| `DATABASE_POOL_MAX` | Bağlantı kotası iki projede paylaşılır; küçük tutun (ör. 3) |
| `ENCRYPTION_KEY` | Mixle ile **aynı** (panelde girilen anahtarlar bununla şifreli) |
| `SESSION_SECRET` | Mixle'dan **farklı** (müşteri oturumları ayrı) |
| `DEMO_MODE` | `true`: kart ödemesi test sayfasına gider, e-posta gönderilmez |
| `NEXT_PUBLIC_SITE_URL` | Bu vitrinin adresi (canonical, sitemap, ödeme dönüşleri) |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | Görece yollu görsellerin kökü (Mixle alan adı); Blob görselleri zaten mutlak |
| `REVALIDATE_SECRET` | Mixle'daki ile **aynı**; `/api/yenile` ve `/api/onizleme`'yi korur |
| `CRON_SECRET` | Gece katalog yenileme cron'u (`vercel.json`) |

Mixle tarafında ayrıca `STOREFRONT_REVALIDATE_URLS=https://<alan-adı>/api/yenile`
tanımlanmalı; panelde Ayarlar → Mağaza → **Vitrin adresi** (Nuclear seçiliyken)
doldurulmalı — e-posta bağlantıları ve ürün önizlemesi bunu kullanır.

## Vercel'e dağıtım

1. Repoyu GitHub'a gönderin, Vercel'de **Add New → Project** ile içe aktarın.
2. **Storage**: Mixle'ın Prisma Postgres ve Blob depolarını bu projeye de
   **Connect Project** ile bağlayın (yeni veritabanı oluşturmayın).
3. Yukarıdaki ortam değişkenlerini girin. Derleme komutu `vercel-build`
   (`prisma generate && next build`) — **migration çalıştırmaz**; şema
   değişikliği her zaman önce Mixle'da deploy edilir.
4. **Settings → Domains**: alan adını ekleyin.
5. Ödeme sağlayıcısı panelinde dönüş/webhook adreslerini bu alan adıyla
   tanımlayın: `/api/payments/<sağlayıcı>/donus`, `/api/webhooks/payments/<sağlayıcı>`.

## Özellikler

- 18+ yaş kapısı (ilk ziyarette; onay tarayıcıda saklanır)
- Ana sayfa: hero, kategori kartları, öne çıkan / yeni / çok satan rayları, kampanya bandı
- Listeleme: sıralama, stok ve indirim filtresi, sayfalama, alt kategori çipleri, canlı arama
- Ürün: galeri, seçenek/varyant seçimi (stoksuz kombinasyonlar ayırt edilir), mobilde yapışkan sepete ekle, JSON-LD
- Sepet çekmecesi + sepet sayfası (tutarlar sunucu teklifinden)
- Tek sayfalık ödeme: kayıtlı adresler, il/ilçe/mahalle, kargo ve ödeme seçimi, taksit, kupon, yasal metin onayları, tekrar gönderim koruması
- Havale IBAN ekranı, test modunda 3D Secure simülasyonu, ödemeyi yeniden deneme
- Hesap: kayıt/giriş, siparişlerim, sipariş detayı, iptal; sipariş takibi (misafir)
- Yasal metinler, SSS, iletişim (panelden), site haritası, robots
- Yazı tipleri kendi sunucumuzdan (`public/fonts`, Inter + Space Grotesk, Türkçe karakterler dahil)

## Kontroller

```sh
npm run typecheck
npm run lint
npm run sync:check
npm run build
```
