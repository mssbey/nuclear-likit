// Checkout teklifi — arayüz her adımda (adres, kargo, kupon, ödeme) çağırır.
// Tutarlar burada sunucuda hesaplanır; istemci yalnız gösterir.

import { getCurrentCustomer } from '@/server/customers/auth';
import { buildQuote, quoteInputSchema } from '@/server/orders/quote';
import { readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const me = await getCurrentCustomer();
    const input = quoteInputSchema.parse(await readJsonBody(request));
    const quote = await buildQuote(input, { customerId: me?.id ?? null });

    // Kupon değerlendirmesinin iç dağılımı (perLineMinor) istemciye gerekmez.
    return Response.json({
      lines: quote.totals.lines,
      totals: {
        itemsSubtotalMinor: quote.totals.itemsSubtotalMinor,
        discountTotalMinor: quote.totals.discountTotalMinor,
        shippingTotalMinor: quote.totals.shippingTotalMinor,
        surchargeMinor: quote.totals.surchargeMinor,
        taxTotalMinor: quote.totals.taxTotalMinor,
        grandTotalMinor: quote.totals.grandTotalMinor,
        taxBreakdown: quote.totals.taxBreakdown,
        freeShipping: quote.totals.freeShipping,
      },
      shippingOptions: quote.shippingOptions,
      selectedShippingId: quote.selectedShipping?.methodId ?? null,
      coupon: quote.coupon
        ? quote.coupon.ok
          ? { ok: true, code: quote.coupon.code, type: quote.coupon.type, discountMinor: quote.coupon.discountMinor, freeShipping: quote.coupon.freeShipping }
          : { ok: false, reason: quote.coupon.reason }
        : null,
      appliedDiscounts: quote.appliedDiscounts,
      paymentOptions: quote.paymentOptions,
      selectedPayment: quote.selectedPayment,
      problems: quote.problems,
      pricesIncludeTax: quote.pricesIncludeTax,
      availability: quote.cart.availability,
    });
  } catch (err) {
    return storefrontError(err);
  }
}
