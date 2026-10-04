// Vitrin sayfalarındaki statik metinler (aroma rehberi, hakkımızda, SSS,
// kampanya bloğu). SSS ve kampanya panelden düzenlenebilir; buradakiler
// kayıt yokken kullanılan varsayılanlardır.

export interface GuideTopic {
  slug: string;
  title: string;
  summary: string;
  body: string[];
  image?: string;
}

export const guideTopics: GuideTopic[] = [
  {
    slug: 'aroma-turleri',
    title: 'Aroma türleri',
    summary: 'Konsantre aroma, shortfill, mix aroma ve baz arasındaki farklar.',
    body: [
      'Konsantre aroma, yüksek yoğunlukta hazırlanan ve baz ile seyreltilerek kullanılan formdur. En esnek seçenektir; oranı siz belirlersiniz.',
      'Shortfill, aromanın bir kısmının baz ile önceden karıştırıldığı, üzerine ekleme yapılmaya uygun formdur.',
      'Mix aroma, birden fazla profilin dengelenip tek şişede sunulduğu hazır tariftir.',
      'Baz (Nbase), aromayı taşıyan nötr sıvıdır ve tek başına belirgin bir tat vermez.',
    ],
  },
  {
    slug: 'tekli-karisim',
    title: 'Tekli ve karışım aroma farkı',
    summary: 'Tek notalı sadelik mi, katmanlı kompozisyon mu?',
    body: [
      'Tekli aroma, belirli bir meyveyi veya notayı olabildiğince net vermeye odaklanır. Katmanlamaya, kendi tarifinizi kurmaya uygundur.',
      'Karışım aroma, birden fazla notanın belirli bir his için birlikte kurgulandığı tariftir. Hazır ve dengeli bir sonuç sunar.',
      'Ürünleri bu ayrım üzerinden karşılaştırabilirsiniz; kullanım uygunluğunu ürün belgeleriyle doğrulayın.',
    ],
  },
  {
    slug: 'tat-profili-okuma',
    title: 'Tat profili nasıl okunur?',
    summary: 'Tatlılık, ferahlık, yoğunluk, ekşilik ve kremsilik göstergeleri.',
    body: [
      'Her ürün sayfasında beş eksenli bir tat profili bulunur: tatlılık, ferahlık, yoğunluk, ekşilik ve kremsilik.',
      'Değerler 0–10 arasında görecelidir ve ürünler arası karşılaştırma için tasarlanmıştır; mutlak bir ölçüm değildir.',
      'Bu vitrindeki profil değerleri örnektir; ölçüm veya kullanım dozu önerisi değildir.',
    ],
  },
  {
    slug: 'yogunluk-ferahlik',
    title: 'Yoğunluk ve ferahlık seviyeleri',
    summary: 'Standart, Yoğun ve Extra Fresh varyantları ne anlama gelir?',
    body: [
      'Standart varyant, profilin dengeli hâlidir ve çoğu kullanıcı için başlangıç noktasıdır.',
      'Yoğun, katalogda bulunan bir varyasyon adıdır; kullanım oranı hakkında tek başına bilgi vermez.',
      'Extra Fresh varyantı yalnızca ferah profillerde bulunur ve serinlik dozu belirgin biçimde daha yüksektir.',
    ],
  },
  {
    slug: 'saklama',
    title: 'Ürün saklama önerileri',
    summary: 'Işık, ısı ve hava ile temas aromayı nasıl etkiler?',
    body: [
      'Ürüne özel saklama sıcaklığı ve koşulları için resmi ürün etiketi esas alınmalıdır.',
      'Uzun süre yüksek sıcaklıkta kalan aromalarda nota kayması olabilir.',
      'Çocukların ve evcil hayvanların erişemeyeceği bir yerde tutun.',
    ],
  },
  {
    slug: 'bekleme-suresi',
    title: 'Bekleme / demlenme süresi nedir?',
    summary: 'Tarifin oturması için neden zaman gerekir?',
    body: [
      'Aroma baz ile karıştıktan sonra notaların birbirine yerleşmesi zaman alır. Bu süreye bekleme veya demlenme denir.',
      'Meyveli ve ferah profiller genellikle daha kısa; kremsi ve tütün profilleri daha uzun sürede oturur.',
      'Bu demo katalogda doğrulanmış bekleme süresi bulunmaz; üreticinin ürün talimatlarını esas alın.',
    ],
  },
  {
    slug: 'urun-secimi',
    title: 'Ürün seçerken dikkat edilecekler',
    summary: 'Profil, yoğunluk, hacim ve kullanım amacını birlikte değerlendirin.',
    body: [
      'Önce bir tat ailesi seçin, ardından tat profili göstergelerine bakarak tatlılık ve ferahlık beklentinizi eşleştirin.',
      'İlk denemede küçük hacim (10 ml) almak, profili tanımak için pratik bir yoldur.',
      'Kendi tarifinizi kuracaksanız tekli aroma + uygun baz; hazır sonuç istiyorsanız mix aroma veya shortfill tercih edin.',
    ],
  },
  {
    slug: 'terimler',
    title: 'Sık kullanılan terimler',
    summary: 'Baz, oran, steep, shortfill, VG/PG gibi kavramlar.',
    body: [
      'Oran: aromanın toplam karışıma göre yüzdesi.',
      'Steep / demlenme: karışımın dinlendirilme süresi.',
      'Shortfill: kısmen doldurulmuş, üzerine ekleme yapılmaya uygun şişe.',
      'VG / PG: bazın içindeki iki taşıyıcı bileşenin oranını tanımlayan kısaltmalar.',
    ],
  },
];

export const guideDisclaimer =
  'Bu içerikler genel bilgilendirme amaçlıdır ve sağlıkla ilgili bir iddia taşımaz. Kesin kullanım oranları, bekleme süreleri ve uyarılar için ürün etiketini ve üretici talimatlarını esas alın.';

export const campaign = {
  eyebrow: 'Güncel',
  title: 'İndirimli Puff Aromaları',
  description:
    'Drifter, IVG, Vampire Vape, Dinner Lady ve Mixle Puff serilerinde fiyatı düşen aromalar. İndirim ürün sayfasında görünür.',
  code: '',
  codeNote: '',
  cta: { label: 'Puff Aromaları İncele', href: '/kategori/puff-aromalar' },
  image: '/images/products/puff/triple-melon-drifter-bar-aroma.webp',
};

export interface TimelineItem {
  year: string;
  title: string;
  text: string;
}

// Zaman çizelgesi — yıllar PLACEHOLDER'dır, kurumsal onay sonrası güncellenecek.
export const aboutTimeline: TimelineItem[] = [
  { year: '—', title: 'İlk tarifler', text: 'Küçük ölçekli denemelerle birkaç temel profilin oluşturulması.' },
  { year: '—', title: 'Profil ailesi', text: 'Meyveli, ferah ve tatlı profillerin genişletilmesi, tat profili göstergesinin tasarlanması.' },
  { year: '—', title: 'DIY yaklaşımı', text: 'Aroma ve bazı bir arada sunan DIY kit boylarının hazırlanması.' },
  { year: '—', title: 'Bugün', text: 'Puff aromaları başta olmak üzere, kontrollü varyasyonlarla büyüyen bir katalog.' },
];

export const aboutValues = [
  {
    title: 'Doğadan ilham',
    text: 'Profilleri gerçek meyve, tatlı ve içecek deneyimlerinden yola çıkarak kurarız; hedef tanıdık bir tat hissidir.',
  },
  {
    title: 'Dengeli formülasyon',
    text: 'Tek bir notayı öne çıkarmak yerine tatlılık, ferahlık ve yoğunluğu birlikte ayarlarız.',
  },
  {
    title: 'Şeffaf bilgi',
    text: 'Kullanım oranı, bekleme süresi ve uyarıları ürün sayfasında açıkça belirtiriz; abartılı iddialardan kaçınırız.',
  },
  {
    title: 'Özenli teslim',
    text: 'Sızdırmaz kapak ve darbe emici paketleme ile ürünün size sağlam ulaşmasını önemseriz.',
  },
];

export const faqGroups: { heading: string; items: { q: string; a: string }[] }[] = [
  {
    heading: 'Ürünler',
    items: [
      {
        q: 'Aromalarınız nikotin içeriyor mu?',
        a: 'Hayır. Mixle ürünleri aroma konsantreleri, DIY kitleri ve nötr bazlardan oluşur; nikotin içermez.',
      },
      {
        q: 'DIY kit boyu ile normal aroma arasındaki fark nedir?',
        a: 'Normal şişede yalnızca konsantre aroma vardır; oranı siz belirlersiniz. DIY kit boyunda şişe, aromasıyla birlikte gelir — kalanını baz ile doldurup hazır ürün elde edersiniz (ör. 30 ml DIY kit içinde 9 ml aroma).',
      },
      {
        q: 'Ürünlerin son kullanma tarihi var mı?',
        a: 'Her şişenin üzerinde üretim ve tavsiye edilen kullanım bilgisi yer alır. Doğru saklandığında aromalar uzun süre karakterini korur.',
      },
    ],
  },
  {
    heading: 'Kullanım',
    items: [
      {
        q: 'Hangi oranda kullanmalıyım?',
        a: 'Her ürün sayfasında önerilen bir başlangıç aralığı belirtilir. Kesin oran damak tercihine ve baz oranına göre değişir; etiket bilgisi esastır.',
      },
      {
        q: 'Bekleme süresi neden önemli?',
        a: 'Notaların birbirine yerleşmesi zaman alır. Meyveli profiller kısa, kremsi ve tütün profilleri daha uzun sürede oturur.',
      },
    ],
  },
  {
    heading: 'Sipariş & Teslimat',
    items: [
      {
        q: 'Kargo ne kadar sürede gelir?',
        a: 'Siparişler 1–3 iş günü içinde kargoya verilir. Kesin süreler kampanya dönemlerine göre değişebilir.',
      },
      {
        q: 'Ücretsiz kargo koşulu nedir?',
        a: 'Belirli bir tutar üzeri siparişlerde kargo ücretsizdir. Güncel tutar sepet sayfasında ve üst bantta görünür.',
      },
      {
        q: 'İade yapabilir miyim?',
        a: 'Ambalajı açılmamış ürünler için iade ve teslimat koşulları sayfasındaki şartlar geçerlidir.',
      },
    ],
  },
  {
    heading: 'Hesap & Gizlilik',
    items: [
      {
        q: 'Üyelik zorunlu mu?',
        a: 'Hayır. Misafir olarak da sipariş verebilirsiniz. Üyelik; sipariş geçmişinizi görmek, adreslerinizi kaydetmek ve iade talebi açmak için önerilir.',
      },
      {
        q: 'Bilgilerim nasıl korunuyor?',
        a: 'Gizlilik ve çerez politikası sayfalarında verilerin nasıl işlendiği açıklanır.',
      },
    ],
  },
];
