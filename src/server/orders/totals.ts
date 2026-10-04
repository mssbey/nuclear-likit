// Sipariş toplamları — saf, deterministik, kuruş.
//
// İstemciden ASLA tutar alınmaz. Route Handler sepet satırlarını veritabanından
// fiyatlayıp buraya verir; burası indirim, kargo ve KDV'yi tek geçişte hesaplar.
//
// Sıra: satır toplamları → kupon indirimi (satırlara dağıtılır) → kargo →
// KDV (indirim SONRASI satır tutarı üzerinden) → genel toplam.
//
// Değişmez: itemsSubtotal - discountTotal + shippingTotal == grandTotal
// (fiyatlar KDV dahilken; vergi zaten satırların içinde).

import type { CouponOutcome } from '@/server/pricing/coupons';
import { taxBreakdown, taxLine, type TaxBreakdownRow } from '@/server/pricing/tax';
import type { ShippingQuote } from '@/server/pricing/shipping-rates';

export interface PricedLine {
  productId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  sku: string;
  imageUrl: string;
  unitPriceMinor: number;
  quantity: number;
  /** Bu satırın KDV oranı, on binde. */
  taxRateBps: number;
}

export interface TotalsInput {
  lines: PricedLine[];
  coupon: CouponOutcome | null;
  shipping: ShippingQuote | null;
  /** Mağaza ayarı: fiyatlar KDV dahil mi. Türkiye perakendede varsayılan true. */
  pricesIncludeTax: boolean;
  /** Kargo ücretine uygulanacak KDV oranı (kargo hizmeti %20). */
  shippingTaxRateBps?: number;
  /** Kapıda ödeme gibi ek hizmet bedeli, kuruş. */
  surchargeMinor?: number;
  /**
   * Otomatik indirim kurallarından satır bazında ek indirim (kuponla toplanır).
   * `lines` ile aynı sıra/uzunluk; eksik indeks 0 sayılır.
   */
  autoDiscountPerLineMinor?: number[];
}

export interface OrderLineTotals extends PricedLine {
  lineTotalMinor: number;
  discountMinor: number;
  /** İndirim sonrası satır tutarı (KDV dahil/hariç ayara göre). */
  netLineMinor: number;
  taxMinor: number;
}

export interface OrderTotals {
  lines: OrderLineTotals[];
  itemsSubtotalMinor: number;
  discountTotalMinor: number;
  shippingTotalMinor: number;
  surchargeMinor: number;
  taxTotalMinor: number;
  grandTotalMinor: number;
  taxBreakdown: TaxBreakdownRow[];
  couponCode: string | null;
  freeShipping: boolean;
}

export function computeTotals(input: TotalsInput): OrderTotals {
  const shippingTaxRate = input.shippingTaxRateBps ?? 2000;
  const surcharge = Math.max(0, Math.round(input.surchargeMinor ?? 0));

  const couponOk = input.coupon && input.coupon.ok ? input.coupon : null;
  const perLineDiscount = couponOk ? couponOk.perLineMinor : input.lines.map(() => 0);
  const autoPerLine = input.autoDiscountPerLineMinor ?? [];

  const lines: OrderLineTotals[] = input.lines.map((l, i) => {
    const qty = Math.max(0, Math.round(l.quantity));
    const unit = Math.max(0, Math.round(l.unitPriceMinor));
    const lineTotalMinor = unit * qty;
    const combinedDiscount =
      Math.max(0, perLineDiscount[i] ?? 0) + Math.max(0, autoPerLine[i] ?? 0);
    const discountMinor = Math.min(lineTotalMinor, combinedDiscount);
    const netLineMinor = lineTotalMinor - discountMinor;
    const tax = taxLine({ amountMinor: netLineMinor, rateBps: l.taxRateBps }, input.pricesIncludeTax);
    return {
      ...l,
      quantity: qty,
      unitPriceMinor: unit,
      lineTotalMinor,
      discountMinor,
      netLineMinor,
      taxMinor: tax.taxMinor,
    };
  });

  const itemsSubtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0);
  const discountTotalMinor = lines.reduce((s, l) => s + l.discountMinor, 0);

  const freeShipping = Boolean(couponOk?.freeShipping) || (input.shipping?.priceMinor ?? 0) === 0;
  const shippingTotalMinor = input.shipping ? input.shipping.priceMinor : 0;
  const shippingTax = taxLine(
    { amountMinor: shippingTotalMinor, rateBps: shippingTaxRate },
    input.pricesIncludeTax,
  );
  const surchargeTax = taxLine(
    { amountMinor: surcharge, rateBps: shippingTaxRate },
    input.pricesIncludeTax,
  );

  const lineTaxes = lines.map((l) =>
    taxLine({ amountMinor: l.netLineMinor, rateBps: l.taxRateBps }, input.pricesIncludeTax),
  );
  const breakdown = taxBreakdown([...lineTaxes, shippingTax, surchargeTax].filter((t) => t.grossMinor > 0));
  const taxTotalMinor = breakdown.reduce((s, r) => s + r.taxMinor, 0);

  // KDV dahilse vergi zaten tutarların içinde; hariçse üstüne eklenir.
  const netGoods = itemsSubtotalMinor - discountTotalMinor;
  const grandTotalMinor = input.pricesIncludeTax
    ? netGoods + shippingTotalMinor + surcharge
    : netGoods + shippingTotalMinor + surcharge + taxTotalMinor;

  return {
    lines,
    itemsSubtotalMinor,
    discountTotalMinor,
    shippingTotalMinor,
    surchargeMinor: surcharge,
    taxTotalMinor,
    grandTotalMinor,
    taxBreakdown: breakdown,
    couponCode: couponOk?.code ?? null,
    freeShipping,
  };
}
