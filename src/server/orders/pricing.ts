// Sepet → veritabanından fiyatlanmış satırlar.
//
// GÜVENLİK: İstemci yalnızca (variantId, adet) gönderir. Fiyat, ad, KDV oranı
// ve stok burada veritabanından okunur. İstemciden gelen tutara asla güvenilmez.

import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { currentStore } from '../store-context';
import { jsonRecord } from '../catalog/mapping';
import { getStoreSettings } from '../settings';
import type { PricedLine } from './totals';
import { evaluateCoupon, normalizeCouponCode, type CouponOutcome, type CouponRule } from '../pricing/coupons';
import { jsonArray } from '../catalog/mapping';

export const cartLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export interface PricedCart {
  lines: PricedLine[];
  /** Satır → stok durumu; checkout arayüzü eksik stoku göstersin. */
  availability: { variantId: string; requested: number; available: number }[];
  /** Kupon değerlendirmesi için satır bağlamı. */
  couponLines: { productId: string; categoryIds: string[]; lineTotalMinor: number }[];
  problems: string[];
}

export class CartProblemError extends Error {
  readonly status = 422 as const;
  constructor(public readonly problems: string[]) {
    super(problems[0] ?? 'Sepet doğrulanamadı');
    this.name = 'CartProblemError';
  }
}

/** Varyant etiketini seçenek değerlerinden üretir: "30ml · Yoğun". */
function variantLabel(
  optionValues: Record<string, string>,
  options: { localId: string; position: number; values: { localId: string; label: string }[] }[],
): string {
  return [...options]
    .sort((a, b) => a.position - b.position)
    .map((o) => o.values.find((v) => v.localId === optionValues[o.localId])?.label)
    .filter((x): x is string => Boolean(x))
    .join(' · ');
}

export async function priceCart(input: CartLineInput[]): Promise<PricedCart> {
  const settings = await getStoreSettings();

  // Aynı varyant birden çok satırda gelirse birleştir.
  const merged = new Map<string, number>();
  for (const l of input) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity);

  const variants = await db.variant.findMany({
    // Başka mağazanın varyantı bu sepette bulunamaz → "satışta değil" olarak düşer.
    where: { id: { in: [...merged.keys()] }, product: { store: currentStore() } },
    include: {
      product: {
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          options: { include: { values: true } },
          categories: { orderBy: { position: 'asc' } },
          taxRate: true,
        },
      },
    },
  });

  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: PricedLine[] = [];
  const availability: PricedCart['availability'] = [];
  const couponLines: PricedCart['couponLines'] = [];
  const problems: string[] = [];

  for (const [variantId, quantity] of merged) {
    const v = byId.get(variantId);
    if (!v || !v.isActive || v.product.status !== 'yayında') {
      problems.push('Sepetinizdeki bir ürün artık satışta değil ve çıkarıldı.');
      continue;
    }

    const label = variantLabel(jsonRecord(v.optionValues), v.product.options);
    const name = v.product.name;
    // Stok takibi kapalıysa adet sınırı yoktur; elle seçilen durum geçerlidir.
    const available = v.trackStock ? v.stock : v.inStock ? quantity : 0;
    availability.push({ variantId, requested: quantity, available });

    if (available <= 0) {
      problems.push(`${name}${label ? ` (${label})` : ''} stokta kalmadı.`);
      continue;
    }
    const qty = Math.min(quantity, available);
    if (qty < quantity) {
      problems.push(`${name}${label ? ` (${label})` : ''} için yalnızca ${available} adet stok var; adet düşürüldü.`);
    }

    lines.push({
      productId: v.productId,
      variantId: v.id,
      name,
      variantLabel: label,
      sku: v.sku,
      imageUrl: v.image ?? v.product.images[0]?.src ?? '',
      unitPriceMinor: v.priceMinor,
      quantity: qty,
      taxRateBps: v.product.taxRate?.rateBps ?? settings.defaultTaxRateBps,
    });
    couponLines.push({
      productId: v.productId,
      categoryIds: v.product.categories.map((c) => c.categoryId),
      lineTotalMinor: v.priceMinor * qty,
    });
  }

  return { lines, availability, couponLines, problems };
}

/** Kupon kaydını okuyup saf kuralla değerlendirir. Kod yoksa null. */
export async function resolveCoupon(
  rawCode: string | null | undefined,
  cart: PricedCart,
  who: { customerId: string | null; email: string | null },
): Promise<CouponOutcome | null> {
  if (!rawCode || !rawCode.trim()) return null;
  const code = normalizeCouponCode(rawCode);

  const row = await db.coupon.findUnique({ where: { store_code: { store: currentStore(), code } } });
  if (!row) return { ok: false, reason: 'Böyle bir kupon kodu bulunamadı.' };

  const rule: CouponRule = {
    code: row.code,
    type: row.type as CouponRule['type'],
    value: row.value,
    minCartTotalMinor: row.minCartTotalMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    usageLimit: row.usageLimit,
    usageLimitPerCustomer: row.usageLimitPerCustomer,
    usedCount: row.usedCount,
    includeProductIds: jsonArray<string>(row.includeProductIds),
    excludeProductIds: jsonArray<string>(row.excludeProductIds),
    includeCategoryIds: jsonArray<string>(row.includeCategoryIds),
    firstOrderOnly: row.firstOrderOnly,
    isActive: row.isActive,
    stackable: row.stackable,
  };

  const [customerUsageCount, previousOrders] = await Promise.all([
    db.couponRedemption.count({
      where: {
        couponId: row.id,
        revokedAt: null,
        OR: [
          ...(who.customerId ? [{ customerId: who.customerId }] : []),
          ...(who.email ? [{ email: who.email.toLocaleLowerCase('tr') }] : []),
        ],
      },
    }),
    db.order.count({
      where: {
        store: currentStore(),
        status: { notIn: ['taslak', 'iptal', 'başarısız'] },
        OR: [
          ...(who.customerId ? [{ customerId: who.customerId }] : []),
          ...(who.email ? [{ guestEmail: who.email.toLocaleLowerCase('tr') }] : []),
        ],
      },
    }),
  ]);

  return evaluateCoupon(rule, {
    lines: cart.couponLines,
    customerUsageCount,
    hasPreviousOrders: previousOrders > 0,
  });
}
