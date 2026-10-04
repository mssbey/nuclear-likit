// Checkout teklifi — sepet + adres + kargo + kupon + ödeme yöntemi → toplamlar.
//
// Hem `/api/checkout/quote` (arayüz her adımda yeniden hesaplatır) hem de
// sipariş oluşturma bunu kullanır: sipariş, oluşturma anında YENİDEN
// hesaplanan teklife göre yazılır; istemcinin gördüğü tutar yalnızca bilgidir.

import 'server-only';
import { z } from 'zod';
import { computeTotals, type OrderTotals } from './totals';
import { cartLineSchema, priceCart, resolveCoupon, type PricedCart } from './pricing';
import { quoteShipping, type ShippingQuote } from '../pricing/shipping-rates';
import type { CouponOutcome } from '../pricing/coupons';
import { evaluateDiscountRules, type AppliedDiscount } from '../pricing/discount-rules';
import { loadActiveDiscountRules } from '../discounts/rules';
import { getShippingZones } from '../shipping/zones';
import { getStoreSettings } from '../settings';
import { DEMO_MODE } from '../config';
import { getPaymentSettings, installmentTables, isMethodEnabled } from '../payments/settings';
import { installmentOptions, type InstallmentOption } from '../payments/installments';

export const PAYMENT_METHODS = ['kart', 'havale', 'kapida'] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

export const quoteInputSchema = z.object({
  lines: z.array(cartLineSchema).min(1, 'Sepet boş'),
  /** Kargo hesabı için yalnız il yeter; tam adres sipariş anında doğrulanır. */
  city: z.string().trim().max(40).optional(),
  country: z.string().trim().max(2).default('TR'),
  shippingMethodId: z.string().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  couponCode: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export interface PaymentOption {
  id: PaymentMethodId;
  label: string;
  description: string;
  surchargeMinor: number;
  available: boolean;
  reason: string | null;
  /** Test modunda gerçek sağlayıcı yerine mock akışı çalışır. */
  testMode: boolean;
  /** Kart için taksit seçenekleri (bilgi amaçlı; nihai taksit sağlayıcı sayfasında kesinleşir). */
  installments?: InstallmentOption[];
}

export interface CheckoutQuote {
  cart: PricedCart;
  totals: OrderTotals;
  shippingOptions: ShippingQuote[];
  selectedShipping: ShippingQuote | null;
  coupon: CouponOutcome | null;
  /** Kod gerektirmeden otomatik uygulanan indirim kuralları. */
  appliedDiscounts: AppliedDiscount[];
  paymentOptions: PaymentOption[];
  selectedPayment: PaymentMethodId | null;
  /** Kullanıcıya gösterilecek uyarılar (stok düşürüldü, kupon reddedildi …). */
  problems: string[];
  pricesIncludeTax: boolean;
}

function withinLimits(l: { minMinor: number | null; maxMinor: number | null }, amount: number): boolean {
  if (l.minMinor != null && amount < l.minMinor) return false;
  if (l.maxMinor != null && amount > l.maxMinor) return false;
  return true;
}

export async function buildQuote(
  input: QuoteInput,
  who: { customerId: string | null },
): Promise<CheckoutQuote> {
  const settings = await getStoreSettings();
  const cart = await priceCart(input.lines);
  const problems = [...cart.problems];

  const coupon = await resolveCoupon(input.couponCode, cart, {
    customerId: who.customerId,
    email: input.email ?? null,
  });
  if (coupon && !coupon.ok) problems.push(coupon.reason);

  // Otomatik indirim kuralları: kod gerektirmez, uygun sepete uygulanır.
  // `couponLines` ve `cart.lines` `priceCart` içinde aynı sırada üretilir.
  const discountRules = await loadActiveDiscountRules();
  const ruleOutcome = evaluateDiscountRules(discountRules, {
    lines: cart.lines.map((l, i) => ({
      productId: l.productId,
      categoryIds: cart.couponLines[i]?.categoryIds ?? [],
      unitPriceMinor: l.unitPriceMinor,
      quantity: l.quantity,
    })),
  });
  const ruleDiscountTotal = ruleOutcome.applied.reduce((s, d) => s + d.discountMinor, 0);

  // Kupon + kural indirimi sonrası ara toplam, kargo eşikleri için.
  const subtotal = cart.lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
  const discount = (coupon?.ok ? coupon.discountMinor : 0) + ruleDiscountTotal;

  const zones = await getShippingZones();
  const shippingOptions = input.city
    ? quoteShipping(zones, {
        country: input.country || 'TR',
        city: input.city,
        cartTotalMinor: subtotal - discount,
        desi: 0,
        freeShippingCoupon: Boolean(coupon?.ok && coupon.freeShipping),
      })
    : [];

  // Kapıda ödeme yöntemi yalnız "kapıda" tipli kargo seçildiyse kullanılabilir
  // ve tersi: kapıda kargo seçildiyse ödeme kapıda olmalı.
  const selectedShipping =
    shippingOptions.find((s) => s.methodId === input.shippingMethodId) ?? null;

  const grandBeforeSurcharge = subtotal - discount + (selectedShipping?.priceMinor ?? 0);
  const pay = await getPaymentSettings();
  const codBlockedByMax =
    (settings.codMaxTotalMinor != null && grandBeforeSurcharge > settings.codMaxTotalMinor) ||
    !withinLimits(pay.limits.kapida, grandBeforeSurcharge);
  const kartOff = !isMethodEnabled(pay, 'kart');
  const kartLimit = !withinLimits(pay.limits.kart, grandBeforeSurcharge);
  const havaleOff = !isMethodEnabled(pay, 'havale');
  const havaleLimit = !withinLimits(pay.limits.havale, grandBeforeSurcharge);

  const paymentOptions: PaymentOption[] = [
    {
      id: 'kart',
      label: 'Kredi / banka kartı',
      description: DEMO_MODE
        ? 'Test modu: gerçek ödeme alınmaz, sonucu siz seçersiniz.'
        : '3D Secure ile güvenli ödeme.',
      surchargeMinor: 0,
      available: !kartOff && !kartLimit && selectedShipping?.type !== 'kapıda',
      reason: kartOff
        ? 'Kart ödemesi şu an kapalı.'
        : kartLimit
          ? 'Bu tutar için kart ödemesi kullanılamıyor.'
          : selectedShipping?.type === 'kapıda'
            ? 'Kapıda ödeme kargosuyla kart kullanılamaz.'
            : null,
      testMode: DEMO_MODE,
      installments: installmentOptions(grandBeforeSurcharge, installmentTables(pay)),
    },
    {
      id: 'havale',
      label: 'Havale / EFT',
      description: 'Sipariş sonrası IBAN bilgisi gösterilir; ödeme onaylanınca hazırlanır.',
      surchargeMinor: 0,
      available: !havaleOff && !havaleLimit && selectedShipping?.type !== 'kapıda',
      reason: havaleOff
        ? 'Havale şu an kapalı.'
        : havaleLimit
          ? 'Bu tutar için havale kullanılamıyor.'
          : selectedShipping?.type === 'kapıda'
            ? 'Kapıda ödeme kargosuyla havale kullanılamaz.'
            : null,
      testMode: false,
    },
    {
      id: 'kapida',
      label: 'Kapıda ödeme',
      description: `Teslimatta nakit veya kart. Hizmet bedeli ${(settings.codSurchargeMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}.`,
      surchargeMinor: settings.codSurchargeMinor,
      available: isMethodEnabled(pay, 'kapida') && selectedShipping?.type === 'kapıda' && !codBlockedByMax,
      reason: !isMethodEnabled(pay, 'kapida')
        ? 'Kapıda ödeme şu an kapalı.'
        : selectedShipping && selectedShipping.type !== 'kapıda'
          ? 'Kapıda ödeme için "kapıda ödeme ile kargo" yöntemini seçin.'
          : codBlockedByMax
            ? 'Bu tutar için kapıda ödeme kullanılamıyor.'
            : !selectedShipping
              ? 'Önce kargo yöntemi seçin.'
              : null,
      testMode: false,
    },
  ];

  const selectedPayment =
    input.paymentMethod && paymentOptions.find((p) => p.id === input.paymentMethod)?.available
      ? input.paymentMethod
      : null;
  const surcharge = selectedPayment
    ? paymentOptions.find((p) => p.id === selectedPayment)?.surchargeMinor ?? 0
    : 0;

  const totals = computeTotals({
    lines: cart.lines,
    coupon,
    shipping: selectedShipping,
    pricesIncludeTax: settings.pricesIncludeTax,
    shippingTaxRateBps: settings.shippingTaxRateBps,
    surchargeMinor: surcharge,
    autoDiscountPerLineMinor: ruleOutcome.perLineMinor,
  });

  return {
    cart,
    totals,
    shippingOptions,
    selectedShipping,
    coupon,
    appliedDiscounts: ruleOutcome.applied,
    paymentOptions,
    selectedPayment,
    problems,
    pricesIncludeTax: settings.pricesIncludeTax,
  };
}
