// Kupon kuralları — saf değerlendirme.
//
// Veritabanı erişimi yok: kupon kaydı ve sepet bağlamı parametreyle gelir,
// sonuç olarak indirim tutarı (kuruş) veya Türkçe bir ret sebebi döner.
// Yüzde tipinde `value` ON BİNDE (2000 = %20), tutar tipinde KURUŞ.

import { allocateMinor } from '@/lib/money';

export type CouponType = 'yüzde' | 'tutar' | 'ücretsiz-kargo';

export interface CouponRule {
  code: string;
  type: CouponType;
  value: number;
  minCartTotalMinor: number | null;
  maxDiscountMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  includeProductIds: string[];
  excludeProductIds: string[];
  includeCategoryIds: string[];
  firstOrderOnly: boolean;
  isActive: boolean;
  stackable: boolean;
}

export interface CouponCartLine {
  productId: string;
  categoryIds: string[];
  /** Satır toplamı (adet × birim), kuruş. */
  lineTotalMinor: number;
}

export interface CouponContext {
  lines: CouponCartLine[];
  /** Bu müşterinin bu kuponu daha önce kaç kez kullandığı. */
  customerUsageCount: number;
  /** Müşterinin daha önce tamamlanmış siparişi var mı (ilk sipariş kuralı). */
  hasPreviousOrders: boolean;
  now?: Date;
}

export type CouponOutcome =
  | {
      ok: true;
      code: string;
      type: CouponType;
      /** Toplam indirim, kuruş. Ücretsiz kargoda 0 — kargo satırı ayrı sıfırlanır. */
      discountMinor: number;
      /** Satır bazında dağıtılmış indirim (fatura/iade için). */
      perLineMinor: number[];
      freeShipping: boolean;
    }
  | { ok: false; reason: string };

function isEligibleLine(rule: CouponRule, line: CouponCartLine): boolean {
  if (rule.excludeProductIds.includes(line.productId)) return false;
  if (rule.includeProductIds.length && !rule.includeProductIds.includes(line.productId)) {
    return false;
  }
  if (
    rule.includeCategoryIds.length &&
    !line.categoryIds.some((c) => rule.includeCategoryIds.includes(c))
  ) {
    return false;
  }
  return true;
}

export function evaluateCoupon(rule: CouponRule, ctx: CouponContext): CouponOutcome {
  const now = ctx.now ?? new Date();

  if (!rule.isActive) return { ok: false, reason: 'Bu kupon artık geçerli değil.' };
  if (rule.startsAt && now < rule.startsAt) {
    return { ok: false, reason: 'Bu kupon henüz başlamadı.' };
  }
  if (rule.endsAt && now > rule.endsAt) {
    return { ok: false, reason: 'Bu kuponun süresi dolmuş.' };
  }
  if (rule.usageLimit != null && rule.usedCount >= rule.usageLimit) {
    return { ok: false, reason: 'Bu kuponun kullanım limiti dolmuş.' };
  }
  if (rule.usageLimitPerCustomer != null && ctx.customerUsageCount >= rule.usageLimitPerCustomer) {
    return { ok: false, reason: 'Bu kuponu daha önce kullandınız.' };
  }
  if (rule.firstOrderOnly && ctx.hasPreviousOrders) {
    return { ok: false, reason: 'Bu kupon yalnızca ilk siparişte geçerlidir.' };
  }

  const cartTotal = ctx.lines.reduce((s, l) => s + l.lineTotalMinor, 0);
  if (rule.minCartTotalMinor != null && cartTotal < rule.minCartTotalMinor) {
    return {
      ok: false,
      reason: `Bu kupon için sepet tutarı en az ${(rule.minCartTotalMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} olmalı.`,
    };
  }

  const eligible = ctx.lines.map((l) => (isEligibleLine(rule, l) ? l.lineTotalMinor : 0));
  const eligibleTotal = eligible.reduce((s, n) => s + n, 0);

  if (rule.type === 'ücretsiz-kargo') {
    return {
      ok: true,
      code: rule.code,
      type: rule.type,
      discountMinor: 0,
      perLineMinor: ctx.lines.map(() => 0),
      freeShipping: true,
    };
  }

  if (eligibleTotal <= 0) {
    return { ok: false, reason: 'Sepetinizde bu kuponun geçerli olduğu ürün yok.' };
  }

  let discount =
    rule.type === 'yüzde'
      ? Math.round((eligibleTotal * rule.value) / 10_000)
      : Math.min(rule.value, eligibleTotal);

  if (rule.maxDiscountMinor != null) discount = Math.min(discount, rule.maxDiscountMinor);
  discount = Math.max(0, Math.min(discount, eligibleTotal));

  // İndirim uygun satırlara ağırlıklı ve kuruş kaybı olmadan dağıtılır.
  const perLineMinor = allocateMinor(discount, eligible);

  return {
    ok: true,
    code: rule.code,
    type: rule.type,
    discountMinor: discount,
    perLineMinor,
    freeShipping: false,
  };
}

const TR_TO_ASCII: Record<string, string> = {
  ı: 'I', İ: 'I', i: 'I', ş: 'S', Ş: 'S', ğ: 'G', Ğ: 'G',
  ç: 'C', Ç: 'C', ö: 'O', Ö: 'O', ü: 'U', Ü: 'U',
};

/**
 * Kupon kodu normalizasyonu — boşluksuz, ASCII büyük harf.
 *
 * `toLocaleUpperCase('tr')` KULLANILMAZ: "nefis" → "NEFİS" (noktalı İ) olur ve
 * kayıtlı "NEFIS10" ile eşleşmez. Kodlar kimliktir, dil kuralı değil; Türkçe
 * harfler ASCII karşılığına katlanır ki "ilkaroma" ile "İLKAROMA" aynı koda çıksın.
 */
export function normalizeCouponCode(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[ıİişŞğĞçÇöÖüÜ]/g, (ch) => TR_TO_ASCII[ch] ?? ch)
    .toUpperCase();
}
