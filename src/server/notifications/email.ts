// E-posta kuyruğu ve şablonları.
//
// DEMO_MODE=true iken hiçbir şey gönderilmez: e-posta `EmailLog`'a
// "demo-yakalandı" durumuyla ve gövdesiyle yazılır, panelde görüntülenir.
// DEMO_MODE=false iken `mailer.ts::sendMailNow` ile GERÇEK gönderim denenir
// (SMTP/Resend, bkz. `/admin/ayarlar/eposta`); sonuç `EmailLog.status`e
// yazılır. Gönderim hatası ASLA çağıran işlemi (sipariş oluşturma vb.)
// düşürmez — try/catch ile yutulur, panelde "başarısız" olarak görünür.
//
// Şablonlar `{{degisken}}` yer tutucularıyla Türkçe metindir; değişkenler
// gönderim anında doldurulur. Kişisel veri (tam adres, TCKN) e-postaya konmaz.

import 'server-only';
import { db } from '../db';
import { DEMO_MODE } from '../config';
import { formatMinor } from '@/lib/money';
import { paymentMethodLabel } from '@/lib/payment-labels';
import { site } from '@/lib/site';
import { getStoreBrand, type StoreBrand } from '../settings';
import { currentStore } from '../store-context';
import { renderEmailHtml, type EmailOrder } from './email-html';

export type EmailTemplateKey =
  | 'siparis-alindi'
  | 'odeme-basarili'
  | 'odeme-basarisiz'
  | 'kargoya-verildi'
  | 'teslim-edildi'
  | 'iptal'
  | 'iade-onayi'
  | 'iade-talebi-onaylandi'
  | 'iade-talebi-reddedildi'
  | 'iade-tamamlandi'
  | 'parola-sifirla'
  | 'yeni-siparis-yonetici'
  | 'hesap-olusturuldu';

interface Template {
  subject: string;
  body: string;
}

/**
 * HTML e-postanın başlığı ve kısa metni. Sipariş tablosu (ürünler + toplamlar)
 * ve buton ayrıca eklenir; bu yüzden metin, düz metindeki toplam/bağlantı
 * satırlarını tekrar etmez. Tanımsız şablonlarda HTML, düz metinden üretilir.
 */
interface HtmlTemplate {
  heading: string;
  intro: string;
  /** Buton: `takipLinki` değişkenine gider. */
  cta?: string;
  /** Sipariş kalemleri ve toplamlar gösterilsin mi (varsayılan: sipariş varsa evet). */
  showOrder?: boolean;
}

const HTML_TEMPLATES: Partial<Record<EmailTemplateKey, HtmlTemplate>> = {
  'siparis-alindi': {
    heading: 'Siparişiniz alındı',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz için teşekkür ederiz. Ödemeniz onaylandığında siparişinizi hazırlamaya başlayacağız.

{{odemeTalimati}}

Kabul ettiğiniz Mesafeli Satış Sözleşmesi (sürüm {{sozlesmeSurumu}}) ve Ön Bilgilendirme Formu bu e-postanın ekinde yer alır.`,
    cta: 'Siparişimi görüntüle',
  },
  'odeme-basarili': {
    heading: 'Ödemeniz alındı, siparişiniz hazırlanıyor',
    intro: `Merhaba {{musteriAdi}},

Siparişinizin ödemesi başarıyla alındı. Siparişiniz hazırlanıyor; kargoya verildiğinde size haber vereceğiz.`,
    cta: 'Siparişimi görüntüle',
  },
  'odeme-basarisiz': {
    heading: 'Ödemeniz alınamadı',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz için ödeme alınamadı. Siparişiniz bekliyor; aşağıdaki butondan yeniden ödeme yapabilirsiniz.`,
    cta: 'Yeniden öde',
  },
  'kargoya-verildi': {
    heading: 'Siparişinizin hazırlanma işlemi tamamlanmıştır',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz {{kargoFirmasi}} ile yola çıktı.

Takip numarası: {{kargoTakipNo}}
Kargo takip: {{kargoTakipLinki}}`,
    cta: 'Siparişimi görüntüle',
  },
  'teslim-edildi': {
    heading: 'Siparişiniz teslim edildi',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz teslim edildi. Keyifli kullanımlar!

Cayma hakkınız teslim tarihinden itibaren {{caymaGun}} gündür.`,
    cta: 'Siparişimi görüntüle',
  },
  iptal: {
    heading: 'Siparişiniz iptal edildi',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz iptal edildi. Ödeme yaptıysanız iade işlemi başlatılmıştır.`,
  },
  'iade-onayi': {
    heading: 'İade talebiniz alındı',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz için iade talebiniz alındı. İnceleme sonucunu e-posta ile bildireceğiz.`,
  },
  'iade-talebi-onaylandi': {
    heading: 'İade talebiniz onaylandı',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz için iade talebiniz onaylandı.

{{iadeTalimati}}

Ürün elimize ulaştığında iade işleminizi tamamlayıp size bilgi vereceğiz.`,
  },
  'iade-talebi-reddedildi': {
    heading: 'İade talebiniz hakkında',
    intro: `Merhaba {{musteriAdi}},

Siparişiniz için açtığınız iade talebini inceledik.

Sonuç: {{redSebebi}}

Sorularınız için bize ulaşabilirsiniz.`,
    showOrder: false,
  },
  'iade-tamamlandi': {
    heading: 'İadeniz tamamlandı',
    intro: `Merhaba {{musteriAdi}},

Siparişinizin iadesi tamamlandı. {{iadeTutari}} ödeme yönteminize iade edildi.`,
  },
  'yeni-siparis-yonetici': {
    heading: 'Yeni sipariş',
    intro: `Müşteri: {{musteriAdi}} ({{musteriEposta}})`,
  },
};

const TEMPLATES: Record<EmailTemplateKey, Template> = {
  'siparis-alindi': {
    subject: 'Siparişiniz alındı — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişinizi aldık. Ödemeniz onaylandığında hazırlamaya başlayacağız.

Sipariş toplamı: {{toplam}}
Ödeme yöntemi: {{odemeYontemi}}

{{odemeTalimati}}

Siparişinizi takip etmek için: {{takipLinki}}

Kabul ettiğiniz Mesafeli Satış Sözleşmesi (sürüm {{sozlesmeSurumu}}) ve Ön Bilgilendirme Formu bu e-postanın ekinde yer alır.

{{magazaAdi}}`,
  },
  'odeme-basarili': {
    subject: 'Ödemeniz alındı — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişinizin ödemesi ({{toplam}}) başarıyla alındı. Siparişiniz hazırlanıyor.

Takip: {{takipLinki}}

{{magazaAdi}}`,
  },
  'odeme-basarisiz': {
    subject: 'Ödeme alınamadı — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz için ödeme alınamadı. Siparişiniz bekliyor; yeniden ödeme yapmak için: {{takipLinki}}

{{magazaAdi}}`,
  },
  'kargoya-verildi': {
    subject: 'Siparişiniz kargoda — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz {{kargoFirmasi}} ile yola çıktı.
Takip numarası: {{kargoTakipNo}}
Takip linki: {{kargoTakipLinki}}

{{magazaAdi}}`,
  },
  'teslim-edildi': {
    subject: 'Siparişiniz teslim edildi — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz teslim edildi. Keyifli kullanımlar!

Cayma hakkınız teslim tarihinden itibaren {{caymaGun}} gündür. İade talebi için: {{takipLinki}}

{{magazaAdi}}`,
  },
  iptal: {
    subject: 'Siparişiniz iptal edildi — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz iptal edildi. Ödeme yaptıysanız iade işlemi başlatılmıştır.

{{magazaAdi}}`,
  },
  'iade-onayi': {
    subject: 'İade talebiniz alındı — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz için iade talebiniz alındı. İnceleme sonucunu e-posta ile bildireceğiz.

{{magazaAdi}}`,
  },
  'iade-talebi-onaylandi': {
    subject: 'İade talebiniz onaylandı — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz için iade talebiniz onaylandı.

{{iadeTalimati}}

Ürün elimize ulaştığında iade işleminizi tamamlayıp size bilgi vereceğiz.

{{magazaAdi}}`,
  },
  'iade-talebi-reddedildi': {
    subject: 'İade talebiniz hakkında — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişiniz için açtığınız iade talebini inceledik.

Sonuç: {{redSebebi}}

Sorularınız için bize ulaşabilirsiniz.

{{magazaAdi}}`,
  },
  'iade-tamamlandi': {
    subject: 'İadeniz tamamlandı — {{siparisNo}}',
    body: `Merhaba {{musteriAdi}},

{{siparisNo}} numaralı siparişinizin iadesi tamamlandı. {{iadeTutari}} ödeme yönteminize iade edildi.

{{magazaAdi}}`,
  },
  'parola-sifirla': {
    subject: 'Parola sıfırlama',
    body: `Merhaba,

Parolanızı sıfırlamak için bağlantı (1 saat geçerli): {{sifirlamaLinki}}

Bu isteği siz yapmadıysanız bu e-postayı yok sayın.

{{magazaAdi}}`,
  },
  'yeni-siparis-yonetici': {
    subject: 'Yeni sipariş: {{siparisNo}} — {{toplam}}',
    body: `Yeni sipariş alındı.

No: {{siparisNo}}
Müşteri: {{musteriAdi}} ({{musteriEposta}})
Toplam: {{toplam}}
Ödeme: {{odemeYontemi}}

Panel: {{panelLinki}}`,
  },
  'hesap-olusturuldu': {
    subject: '{{magazaAdi}} hesabınız oluşturuldu',
    body: `Merhaba {{musteriAdi}},

Hesabınız oluşturuldu. Siparişlerinizi ve adreslerinizi {{hesapLinki}} adresinden yönetebilirsiniz.

{{magazaAdi}}`,
  },
};

export type EmailVars = Record<string, string | number | null | undefined>;

/**
 * Şablonu doldurur. Mağaza adı (`{{magazaAdi}}`) ve vitrin kökü (`{{siteUrl}}`)
 * değişkenlerden SONRA doldurulur: `orderEmailVars` bağlantıları `{{siteUrl}}`
 * ile kurar ki panel başka mağazanın e-postasını doğru adresle gönderebilsin.
 */
function filler(vars: EmailVars, brand: StoreBrand) {
  return (text: string) =>
    text
      .replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
        if (name === 'magazaAdi' || name === 'siteUrl') return match;
        const v = vars[name];
        return v == null ? '' : String(v);
      })
      .replace(/\{\{magazaAdi\}\}/g, brand.name)
      .replace(/\{\{siteUrl\}\}/g, brand.url);
}

const DEFAULT_BRAND: StoreBrand = { name: site.name, url: site.domain.replace(/\/$/, '') };

export function renderTemplate(key: EmailTemplateKey, vars: EmailVars, brand: StoreBrand = DEFAULT_BRAND): Template {
  const fill = filler(vars, brand);
  const t = TEMPLATES[key];
  return { subject: fill(t.subject), body: fill(t.body).replace(/\n{3,}/g, '\n\n') };
}

/** HTML gövde: logo, başlık, metin, (varsa) sipariş tablosu ve buton. */
export function renderTemplateHtml(
  key: EmailTemplateKey,
  vars: EmailVars,
  brand: StoreBrand = DEFAULT_BRAND,
  opts: { order?: EmailOrder | null; logoUrl?: string | null } = {},
): string {
  const fill = filler(vars, brand);
  const h = HTML_TEMPLATES[key];
  const plain = renderTemplate(key, vars, brand);
  const link = fill(String(vars.takipLinki ?? ''));
  return renderEmailHtml({
    brand,
    logoUrl: opts.logoUrl ?? null,
    heading: h ? fill(h.heading) : plain.subject.split(' — ')[0],
    body: h ? fill(h.intro).replace(/\n{3,}/g, '\n\n') : plain.body,
    order: h && h.showOrder !== false ? opts.order ?? null : null,
    cta: h?.cta && link ? { label: h.cta, url: link } : null,
  });
}

/** Mixle'ın logosu vitrinde `/brand/logo.png`; diğer mağazalarda ad yazıyla basılır. */
function logoFor(brand: StoreBrand): string | null {
  return currentStore() === 'mixle' && brand.url ? `${brand.url}/brand/logo.png` : null;
}

async function loadEmailOrder(orderId: string): Promise<EmailOrder | null> {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      itemsSubtotalMinor: true,
      discountTotalMinor: true,
      shippingTotalMinor: true,
      surchargeMinor: true,
      grandTotalMinor: true,
      paymentMethod: true,
      items: {
        select: { name: true, variantLabel: true, imageUrl: true, quantity: true, lineTotalMinor: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

export interface QueueEmailInput {
  to: string;
  template: EmailTemplateKey;
  vars: EmailVars;
  orderId?: string | null;
}

/**
 * E-postayı kuyruğa alır. Demo modda anında "yakalandı" olarak kaydedilir;
 * gerçek gönderim F7'de bu fonksiyonun içine bağlanır, çağrı yerleri değişmez.
 * Gönderim hatası asıl işlemi (sipariş oluşturma vb.) asla düşürmez.
 */
export async function queueEmail(input: QueueEmailInput): Promise<void> {
  const brand = await getStoreBrand().catch(() => DEFAULT_BRAND);
  const { subject, body } = renderTemplate(input.template, input.vars, brand);
  let row: { id: string } | null = null;
  try {
    row = await db.emailLog.create({
      data: {
        to: input.to,
        template: input.template,
        subject,
        body,
        orderId: input.orderId ?? null,
        status: DEMO_MODE ? 'demo-yakalandı' : 'kuyrukta',
        sentAt: DEMO_MODE ? new Date() : null,
      },
      select: { id: true },
    });
  } catch (err) {
    console.error('[e-posta] kuyruğa yazılamadı:', err);
    return;
  }

  if (DEMO_MODE) return;
  try {
    const { sendMailNow } = await import('./mailer');
    let html: string | undefined;
    try {
      const order = input.orderId ? await loadEmailOrder(input.orderId) : null;
      html = renderTemplateHtml(input.template, input.vars, brand, { order, logoUrl: logoFor(brand) });
    } catch (err) {
      // HTML üretilemezse düz metin gövdesinden basit HTML ile gönderilir.
      console.error('[e-posta] HTML üretilemedi:', err);
    }
    const result = await sendMailNow(input.to, subject, body, html);
    await db.emailLog.update({
      where: { id: row.id },
      data: result.ok
        ? { status: 'gönderildi', sentAt: new Date() }
        : { status: 'başarısız', error: (result.error ?? 'bilinmeyen hata').slice(0, 500) },
    });
  } catch (err) {
    console.error('[e-posta] gönderim denemesi başarısız:', err);
    await db.emailLog.update({ where: { id: row.id }, data: { status: 'başarısız', error: 'Beklenmeyen hata' } }).catch(() => {});
  }
}

/** Sipariş e-postalarının ortak değişkenleri. */
export function orderEmailVars(order: {
  orderNumber: string;
  grandTotalMinor: number;
  paymentMethod: string;
  guestEmail: string | null;
  customer?: { firstName: string; lastName: string; email: string } | null;
  shippingAddress: unknown;
}): EmailVars {
  const addr = (order.shippingAddress ?? {}) as { firstName?: string; lastName?: string };
  const name =
    order.customer && (order.customer.firstName || order.customer.lastName)
      ? `${order.customer.firstName} ${order.customer.lastName}`.trim()
      : `${addr.firstName ?? ''} ${addr.lastName ?? ''}`.trim() || 'Müşterimiz';
  const email = order.customer?.email ?? order.guestEmail ?? '';
  // Kök, gönderim anında geçerli mağazanın adresiyle doldurulur (bkz. renderTemplate).
  const base = '{{siteUrl}}';
  const takip = `${base}/siparis-takibi?no=${encodeURIComponent(order.orderNumber)}&eposta=${encodeURIComponent(email)}`;

  return {
    siparisNo: order.orderNumber,
    musteriAdi: name,
    musteriEposta: email,
    toplam: formatMinor(order.grandTotalMinor),
    odemeYontemi: paymentMethodLabel(order.paymentMethod),
    takipLinki: takip,
    panelLinki: `${base}/admin/siparisler`,
    hesapLinki: `${base}/hesabim`,
  };
}

export { paymentMethodLabel } from '@/lib/payment-labels';
