// Yasal metinler — SÜRÜMLÜ.
//
// Mesafeli satış sözleşmesi, ön bilgilendirme formu, KVKK aydınlatma metni ve
// üyelik sözleşmesi `LegalDocument` tablosunda sürüm numarasıyla tutulur.
// Sipariş ve üyelik, kabul edilen SÜRÜMÜ `consents` alanına yazar; metin
// sonradan değişse bile eski kayıt kabul ettiği metni gösterebilir.
//
// Buradaki varsayılan metinler ŞABLONDUR. Hukuki geçerliliği mağaza sahibinin
// sorumluluğundadır; panelden (F7) güncellenerek yeni sürüm yayınlanır.

import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import type { StoreId } from '@/lib/stores';
import { currentStore } from '../store-context';

export const LEGAL_KINDS = [
  'mesafeli-satis',
  'on-bilgilendirme',
  'kvkk-aydinlatma',
  'uyelik-sozlesmesi',
] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const legalKindLabels: Record<LegalKind, string> = {
  'mesafeli-satis': 'Mesafeli Satış Sözleşmesi',
  'on-bilgilendirme': 'Ön Bilgilendirme Formu',
  'kvkk-aydinlatma': 'KVKK Aydınlatma Metni',
  'uyelik-sozlesmesi': 'Üyelik Sözleşmesi',
};

/**
 * Metinlerde `{{...}}` yer tutucuları sipariş özetiyle doldurulur
 * (bkz. `fillLegal`). Böylece sözleşme "sipariş özetiyle doldurulmuş" halde
 * gösterilir ve kabul edilir.
 */
const DEFAULT_TEXTS: Record<LegalKind, { title: string; body: string }> = {
  'mesafeli-satis': {
    title: 'Mesafeli Satış Sözleşmesi',
    body: `MESAFELİ SATIŞ SÖZLEŞMESİ

MADDE 1 — TARAFLAR
SATICI: {{saticiUnvan}}
Adres: {{saticiAdres}}
Telefon: {{saticiTelefon}} · E-posta: {{saticiEposta}}
Vergi Dairesi / No: {{saticiVergi}}

ALICI: {{aliciAd}}
Teslimat adresi: {{aliciAdres}}
E-posta: {{aliciEposta}} · Telefon: {{aliciTelefon}}

MADDE 2 — KONU
İşbu sözleşmenin konusu, ALICI'nın SATICI'ya ait internet sitesinden elektronik ortamda siparişini verdiği aşağıda nitelikleri ve satış fiyatı belirtilen ürünün satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.

MADDE 3 — SÖZLEŞME KONUSU ÜRÜN(LER)
Sipariş No: {{siparisNo}} · Tarih: {{siparisTarihi}}
{{urunListesi}}
Ara toplam: {{araToplam}}
İndirim: {{indirim}}
Kargo: {{kargoUcreti}}
KDV (dahil): {{kdvToplam}}
GENEL TOPLAM: {{genelToplam}}
Ödeme yöntemi: {{odemeYontemi}}
Teslimat: {{kargoYontemi}} — tahmini {{teslimSuresi}}

MADDE 4 — GENEL HÜKÜMLER
4.1 ALICI, ürünün temel nitelikleri, satış fiyatı, ödeme şekli ve teslimata ilişkin ön bilgileri okuyup bilgi sahibi olduğunu ve elektronik ortamda gerekli teyidi verdiğini kabul eder.
4.2 Ürün, sipariş tarihinden itibaren en geç 30 gün içinde ALICI'nın belirttiği adrese teslim edilir.
4.3 Ürünün teslimi sırasında hasarlı olduğu anlaşılırsa ALICI tutanak tutturarak ürünü teslim almamalıdır.

MADDE 5 — CAYMA HAKKI
ALICI, ürünü teslim aldığı tarihten itibaren {{caymaGun}} gün içinde hiçbir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir. Cayma bildirimi {{saticiEposta}} adresine veya hesap sayfasındaki iade talebi formu ile yapılabilir. Cayma halinde ürün bedeli, bildirimin SATICI'ya ulaşmasından itibaren 14 gün içinde ALICI'nın ödeme yöntemine iade edilir.

MADDE 6 — CAYMA HAKKININ KULLANILAMAYACAĞI HALLER
Tesliminden sonra ambalajı açılmış, kullanılmış veya niteliği itibarıyla iadeye uygun olmayan ürünlerde (açılmış aroma şişeleri dahil) cayma hakkı kullanılamaz.

MADDE 7 — UYUŞMAZLIK
Uyuşmazlıklarda Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dahilinde ALICI'nın yerleşim yerindeki Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.

İşbu sözleşme {{siparisTarihi}} tarihinde elektronik ortamda kabul edilmiştir.`,
  },
  'on-bilgilendirme': {
    title: 'Ön Bilgilendirme Formu',
    body: `ÖN BİLGİLENDİRME FORMU

SATICI: {{saticiUnvan}} · {{saticiAdres}} · {{saticiEposta}} · {{saticiTelefon}}

ÜRÜN VE FİYAT BİLGİLERİ
{{urunListesi}}
Ara toplam: {{araToplam}} · İndirim: {{indirim}} · Kargo: {{kargoUcreti}}
KDV dahil GENEL TOPLAM: {{genelToplam}}

ÖDEME: {{odemeYontemi}}
TESLİMAT: {{kargoYontemi}}, tahmini {{teslimSuresi}}. Teslimat adresi: {{aliciAdres}}

CAYMA HAKKI: Teslimden itibaren {{caymaGun}} gün. Açılmış/kullanılmış ürünlerde kullanılamaz. İade kargo bedeli, SATICI'nın belirlediği taşıyıcı kullanıldığında SATICI'ya aittir.

ŞİKÂYET VE BAŞVURU: {{saticiEposta}} veya yerleşim yerinizdeki Tüketici Hakem Heyeti.

Bu formu onaylayarak yukarıdaki bilgileri sipariş öncesinde okuduğunuzu kabul edersiniz.`,
  },
  'kvkk-aydinlatma': {
    title: 'KVKK Aydınlatma Metni',
    body: `KİŞİSEL VERİLERİN KORUNMASI HAKKINDA AYDINLATMA METNİ

Veri sorumlusu: {{saticiUnvan}} ({{saticiAdres}})

İşlenen veriler: ad-soyad, e-posta, telefon, teslimat/fatura adresi, sipariş geçmişi; kurumsal faturada VKN, bireysel faturada TCKN (şifreli saklanır).

İşleme amaçları: siparişin oluşturulması ve teslimi, fatura düzenlenmesi, yasal yükümlülüklerin yerine getirilmesi, müşteri hizmetleri. Pazarlama iletişimi yalnızca AYRICA verdiğiniz açık rıza ile yapılır ve satın alma şartı değildir.

Aktarım: kargo firmaları (teslimat için), ödeme kuruluşları (ödeme için), e-fatura sağlayıcısı (yasal zorunluluk).

Saklama: yasal saklama süreleri boyunca (fatura kayıtları 10 yıl).

Haklarınız (KVKK m.11): verilerinize erişme, düzeltme, silme/anonimleştirme talep etme, işlemeye itiraz. Talepleriniz için {{saticiEposta}} adresine yazabilir veya hesap sayfanızdaki "verilerimi dışa aktar / hesabımı sil" seçeneklerini kullanabilirsiniz.`,
  },
  'uyelik-sozlesmesi': {
    title: 'Üyelik Sözleşmesi',
    body: `ÜYELİK SÖZLEŞMESİ

MADDE 1 — TARAFLAR
İşbu sözleşme, {{saticiUnvan}} ("SATICI") ile internet sitesine üye olan kişi ("ÜYE") arasında, ÜYE'nin üyelik formunu elektronik ortamda onaylamasıyla kurulmuştur.
SATICI adresi: {{saticiAdres}}
E-posta: {{saticiEposta}} · Telefon: {{saticiTelefon}}

MADDE 2 — KONU
Sözleşmenin konusu, ÜYE'nin sitedeki üyelik hizmetlerinden (sipariş verme, sipariş ve iade takibi, adres defteri, kampanyalardan yararlanma) yararlanma koşullarının ve tarafların hak ve yükümlülüklerinin belirlenmesidir.

MADDE 3 — ÜYELİK KOŞULLARI
3.1 Üyelik, 18 yaşını doldurmuş ve fiil ehliyetine sahip gerçek kişilere açıktır. ÜYE, üyelik formunu onaylayarak 18 yaşından büyük olduğunu beyan eder.
3.2 ÜYE, üyelik sırasında verdiği bilgilerin doğru ve güncel olduğunu kabul eder. Yanlış bilgiden doğan sorumluluk ÜYE'ye aittir.
3.3 Üyelik e-posta ve parola ile ya da Google / Apple hesabıyla oluşturulabilir. Sosyal hesapla girişte SATICI'ya yalnızca ad, soyad ve e-posta adresi aktarılır; sosyal hesabın parolasına erişilmez.

MADDE 4 — ÜYENİN YÜKÜMLÜLÜKLERİ
4.1 ÜYE, hesap bilgilerinin ve parolasının gizliliğinden sorumludur; hesabının izinsiz kullanıldığını fark ederse derhal SATICI'ya bildirir.
4.2 ÜYE, siteyi hukuka, genel ahlaka ve işbu sözleşmeye aykırı amaçlarla kullanamaz; sitenin işleyişini bozacak yazılım veya yöntem kullanamaz.
4.3 ÜYE, sitedeki içeriklerin (görsel, metin, marka, logo) SATICI'ya veya lisans verenlerine ait olduğunu, izinsiz kopyalanamayacağını kabul eder.

MADDE 5 — SATICININ HAK VE YÜKÜMLÜLÜKLERİ
5.1 SATICI, ÜYE'nin kişisel verilerini KVKK Aydınlatma Metni'nde belirtilen amaçlarla ve 6698 sayılı Kanun'a uygun olarak işler.
5.2 SATICI, sözleşmeye aykırı kullanım tespit ettiğinde üyeliği askıya alabilir veya sona erdirebilir.
5.3 SATICI, site içeriğinde, fiyatlarda ve kampanyalarda önceden bildirimde bulunmaksızın değişiklik yapabilir. Verilmiş siparişler, sipariş anındaki koşullara tabidir.

MADDE 6 — SATIN ALMA
Site üzerinden verilen her sipariş ayrıca Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'ne tabidir; bu belgeler sipariş sırasında ayrıca onaylanır.

MADDE 7 — TİCARİ ELEKTRONİK İLETİ
Kampanya ve tanıtım içerikli e-posta/SMS, yalnızca ÜYE'nin ayrıca verdiği onay ile gönderilir. ÜYE bu onayı dilediği zaman hesap sayfasından veya iletideki bağlantıdan ücretsiz olarak geri alabilir.

MADDE 8 — SÜRE VE FESİH
Sözleşme süresizdir. ÜYE, hesap sayfasından veya {{saticiEposta}} adresine yazarak üyeliğini dilediği zaman sonlandırabilir. Yasal saklama yükümlülüğü bulunan sipariş ve fatura kayıtları fesihten etkilenmez.

MADDE 9 — DEĞİŞİKLİKLER
SATICI bu sözleşmeyi güncelleyebilir; güncel sürüm sitede yayımlandığı tarihte yürürlüğe girer. Önemli değişiklikler ÜYE'ye e-posta ile bildirilir.

MADDE 10 — UYUŞMAZLIK
Uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır; tüketici işlemlerinde Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir. SATICI'nın elektronik kayıtları HMK m.193 uyarınca delil teşkil eder.

İletişim: {{saticiEposta}} · {{saticiTelefon}}`,
  },
};

export interface LegalDoc {
  kind: LegalKind;
  version: number;
  title: string;
  body: string;
  publishedAt: Date | null;
}

/** Tablo boşsa varsayılan metinleri 1. sürüm olarak yayınlar. Idempotent. */
export async function ensureDefaultLegalDocuments(): Promise<void> {
  for (const kind of LEGAL_KINDS) {
    const exists = await db.legalDocument.findFirst({ where: { store: currentStore(), kind } });
    if (!exists) {
      await db.legalDocument.create({
        data: { store: currentStore(), kind, version: 1, ...DEFAULT_TEXTS[kind], publishedAt: new Date() },
      });
    }
  }
}

// Mağaza argümanı React `cache()` anahtarına girer.
const currentLegalFor = cache(async (store: StoreId, kind: LegalKind): Promise<LegalDoc> => {
  const row = await db.legalDocument.findFirst({
    where: { store, kind, publishedAt: { not: null } },
    orderBy: { version: 'desc' },
  });
  if (row) return row as LegalDoc;
  // Seed edilmemişse varsayılanla devam et; sipariş sürüm 1'i kaydeder.
  return { kind, version: 1, ...DEFAULT_TEXTS[kind], publishedAt: null };
});

/** Yayındaki en güncel sürüm (geçerli mağaza). */
export const getCurrentLegal = (kind: LegalKind): Promise<LegalDoc> => currentLegalFor(currentStore(), kind);

export async function getLegalVersion(kind: LegalKind, version: number): Promise<LegalDoc | null> {
  const row = await db.legalDocument.findUnique({ where: { store_kind_version: { store: currentStore(), kind, version } } });
  return (row as LegalDoc | null) ?? (version === 1 ? { kind, version: 1, ...DEFAULT_TEXTS[kind], publishedAt: null } : null);
}

// Yer tutucu doldurma saf modülde (istemci de kullanır): src/lib/legal-fill.ts
export { fillLegal } from '@/lib/legal-fill';
