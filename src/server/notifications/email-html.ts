// HTML e-posta düzeni: logo, başlık, metin, sipariş kalemleri tablosu ve toplamlar.
//
// E-posta istemcileri (Gmail, Outlook) harici CSS ve flex/grid desteklemez;
// düzen tablo + satır içi stil ile kurulur. Görseller mutlak adresle verilir.
// Metin gövdesi (`EmailLog.body`) değişmez; HTML yalnız gönderim anında üretilir.

import { formatMinor } from '@/lib/money';
import { paymentMethodLabel } from '@/lib/payment-labels';

export interface EmailOrderItem {
  name: string;
  variantLabel: string;
  imageUrl: string;
  quantity: number;
  lineTotalMinor: number;
}

export interface EmailOrder {
  orderNumber: string;
  items: EmailOrderItem[];
  itemsSubtotalMinor: number;
  discountTotalMinor: number;
  shippingTotalMinor: number;
  surchargeMinor: number;
  grandTotalMinor: number;
  paymentMethod: string;
}

export interface EmailLayoutInput {
  brand: { name: string; url: string };
  /** Mutlak logo adresi; yoksa mağaza adı yazıyla basılır. */
  logoUrl: string | null;
  heading: string;
  body: string;
  order?: EmailOrder | null;
  cta?: { label: string; url: string } | null;
}

const C = {
  ink: '#0F1729',
  soft: '#64748B',
  line: '#E5E7EB',
  mist: '#F7F8FA',
  accent: '#E31B23',
  font: "Arial,Helvetica,sans-serif",
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Düz metni paragraflara böler; adresleri tıklanabilir bağlantıya çevirir. */
function textToParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const html = esc(p)
        .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:${C.accent};word-break:break-all">${u}</a>`)
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px;font:14px/1.6 ${C.font};color:${C.ink}">${html}</p>`;
    })
    .join('');
}

function absolute(url: string, base: string): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return url.startsWith('/') && base ? `${base}${url}` : '';
}

function itemsTable(order: EmailOrder, base: string): string {
  const th = (label: string, align: 'left' | 'center' | 'right') =>
    `<th align="${align}" style="padding:10px 8px;font:bold 13px ${C.font};color:${C.soft};border-bottom:1px solid ${C.line}">${label}</th>`;
  const rows = order.items
    .map((it) => {
      const img = absolute(it.imageUrl, base);
      const thumb = img
        ? `<img src="${esc(img)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid ${C.line}">`
        : `<div style="width:56px;height:56px;border-radius:6px;background:${C.mist}"></div>`;
      const variant = it.variantLabel
        ? `<div style="margin-top:2px;font:12px/1.4 ${C.font};color:${C.soft}">${esc(it.variantLabel)}</div>`
        : '';
      return `<tr>
  <td style="padding:12px 8px;border-bottom:1px solid ${C.line};vertical-align:middle">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:12px;vertical-align:middle">${thumb}</td>
      <td style="vertical-align:middle;font:14px/1.45 ${C.font};color:${C.ink}">${esc(it.name)}${variant}</td>
    </tr></table>
  </td>
  <td align="center" style="padding:12px 8px;border-bottom:1px solid ${C.line};font:14px ${C.font};color:${C.soft};white-space:nowrap">×${it.quantity}</td>
  <td align="right" style="padding:12px 8px;border-bottom:1px solid ${C.line};font:14px ${C.font};color:${C.ink};white-space:nowrap">${formatMinor(it.lineTotalMinor)}</td>
</tr>`;
    })
    .join('');

  const total = (label: string, value: string, strong = false) =>
    `<tr>
  <td colspan="2" style="padding:8px;font:${strong ? 'bold 15px' : 'bold 14px'} ${C.font};color:${strong ? C.ink : C.soft}">${label}</td>
  <td align="right" style="padding:8px;font:${strong ? 'bold 16px' : '14px'} ${C.font};color:${C.ink};white-space:nowrap">${value}</td>
</tr>`;

  const totals = [
    total('Ara toplam:', formatMinor(order.itemsSubtotalMinor)),
    order.discountTotalMinor > 0 ? total('İndirim:', `-${formatMinor(order.discountTotalMinor)}`) : '',
    total('Kargo:', order.shippingTotalMinor === 0 ? 'Ücretsiz' : formatMinor(order.shippingTotalMinor)),
    order.surchargeMinor > 0 ? total('Hizmet bedeli:', formatMinor(order.surchargeMinor)) : '',
    order.paymentMethod ? total('Ödeme yöntemi:', esc(paymentMethodLabel(order.paymentMethod))) : '',
    `<tr><td colspan="3" style="padding:0;border-top:1px solid ${C.line}"></td></tr>`,
    total('Toplam:', formatMinor(order.grandTotalMinor), true),
  ].join('');

  return `<h2 style="margin:24px 0 8px;font:bold 18px ${C.font};color:${C.ink}">Sipariş: #${esc(order.orderNumber)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
  <tr>${th('Ürün', 'left')}${th('Adet', 'center')}${th('Fiyat', 'right')}</tr>
  ${rows}
  ${totals}
</table>`;
}

export function renderEmailHtml(input: EmailLayoutInput): string {
  const { brand, logoUrl, heading, body, order, cta } = input;
  const logo = logoUrl
    ? `<img src="${esc(logoUrl)}" width="160" alt="${esc(brand.name)}" style="display:block;margin:0 auto;width:160px;max-width:60%;height:auto;border:0">`
    : `<div style="font:bold 26px ${C.font};color:${C.ink};letter-spacing:-0.5px">${esc(brand.name)}</div>`;
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0"><tr>
  <td style="border-radius:8px;background:${C.accent}"><a href="${esc(cta.url)}" style="display:inline-block;padding:12px 26px;font:bold 14px ${C.font};color:#ffffff;text-decoration:none">${esc(cta.label)}</a></td>
</tr></table>`
    : '';
  const site = brand.url ? `<a href="${esc(brand.url)}" style="color:${C.soft}">${esc(brand.url.replace(/^https?:\/\//, ''))}</a>` : '';

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.mist}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.mist}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:10px">
    <tr><td align="center" style="padding:28px 24px 8px">${logo}</td></tr>
    <tr><td align="center" style="padding:12px 24px 4px"><h1 style="margin:0;font:bold 24px/1.3 ${C.font};color:${C.ink}">${esc(heading)}</h1></td></tr>
    <tr><td style="padding:20px 28px 28px">
      ${textToParagraphs(body)}
      ${order ? itemsTable(order, brand.url) : ''}
      ${button}
    </td></tr>
  </table>
  <p style="margin:16px 0 0;font:12px/1.5 ${C.font};color:${C.soft}">${esc(brand.name)}${site ? ` · ${site}` : ''}</p>
</td></tr></table>
</body></html>`;
}
