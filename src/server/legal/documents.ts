// Yasal metinler — SÜRÜMLÜ.
//
// Mesafeli satış sözleşmesi, ön bilgilendirme formu ve KVKK aydınlatma metni
// `LegalDocument` tablosunda sürüm numarasıyla tutulur. Sipariş, kabul edilen
// SÜRÜMÜ `consents` alanına yazar; metin sonradan değişse bile eski sipariş
// kabul ettiği metni gösterebilir.
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
] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const legalKindLabels: Record<LegalKind, string> = {
  'mesafeli-satis': 'Mesafeli Satış Sözleşmesi',
  'on-bilgilendirme': 'Ön Bilgilendirme Formu',
  'kvkk-aydinlatma': 'KVKK Aydınlatma Metni',
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
