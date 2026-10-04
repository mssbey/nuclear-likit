// Gelişmiş indirim kuralları — saf değerlendirme.
//
// `pricing/coupons.ts` ile aynı felsefe: veritabanı erişimi YOK. Kural listesi
// ve fiyatlanmış sepet satırları parametreyle gelir; sonuç, satır bazında ek
// indirim (kuruş) ve uygulanan kuralların özetidir.
//
// Kupon ile birleşme: bu motor yalnız KENDİ payını üretir. Kupon + kural
// toplamının satır tutarını geçmemesi `orders/totals.ts` içinde güvence altına
// alınır (`autoDiscountPerLineMinor`).
//
// İki tip:
//   sepet-yuzde : uygun satır toplamı ≥ eşik ise, uygun satırlara `percentBps` indirim.
//   x-al-y-ode  : uygun ürünlerden her `buyQuantity` adette (buyQuantity - payQuantity)
//                 adet BEDAVA — en ucuz birimler seçilir.

import { allocateMinor } from '@/lib/money';

export type DiscountRuleType = 'sepet-yuzde' | 'x-al-y-ode';

export interface DiscountRule {
  id: string;
  name: string;
  type: DiscountRuleType;
  isActive: boolean;
  /** Küçük değer önce uygulanır. */
  priority: number;
  /** false ise bu kural uygulandıktan sonra kalan kurallar atlanır. */
  stackable: boolean;
  /** Boşsa tüm kategoriler. */
  includeCategoryIds: string[];
  /** Boşsa tüm ürünler (kategori filtresiyle kesişir). */
  includeProductIds: string[];
  /** sepet-yuzde: on binde (3000 = %30). */
  percentBps: number;
  /** sepet-yuzde: uygun satır toplamı için alt eşik, kuruş (null = yok). */
  minCartTotalMinor: number | null;
  /** x-al-y-ode: X. */
  buyQuantity: number | null;
  /** x-al-y-ode: Y (bedava adet = X - Y). */
  payQuantity: number | null;
  /** x-al-y-ode: kuralın tetiklenmesi için min uygun ürün adedi (null → X). */
  minQuantity: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface DiscountRuleLine {
  productId: string;
  categoryIds: string[];
  unitPriceMinor: number;
  quantity: number;
}

export interface DiscountRuleContext {
  lines: DiscountRuleLine[];
  now?: Date;
}

export interface AppliedDiscount {
  id: string;
  name: string;
  type: DiscountRuleType;
  discountMinor: number;
}

export interface DiscountRulesOutcome {
  /** `ctx.lines` ile aynı sıra ve uzunluk. */
  perLineMinor: number[];
  applied: AppliedDiscount[];
}

/** Satır bu kuralın kapsamına giriyor mu (kategori / ürün filtresi). */
function isEligibleLine(rule: DiscountRule, line: DiscountRuleLine): boolean {
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

function isInWindow(rule: DiscountRule, now: Date): boolean {
  if (rule.startsAt && now < rule.startsAt) return false;
  if (rule.endsAt && now > rule.endsAt) return false;
  return true;
}

/** sepet-yuzde: uygun satırların toplamına yüzde indirim, satırlara dağıtılır. */
function evalCartPercent(rule: DiscountRule, lines: DiscountRuleLine[]): number[] {
  const zero = lines.map(() => 0);
  if (rule.percentBps <= 0) return zero;

  const eligibleTotals = lines.map((l) =>
    isEligibleLine(rule, l) ? l.unitPriceMinor * l.quantity : 0,
  );
  const eligibleTotal = eligibleTotals.reduce((s, n) => s + n, 0);
  if (eligibleTotal <= 0) return zero;
  if (rule.minCartTotalMinor != null && eligibleTotal < rule.minCartTotalMinor) return zero;

  const discount = Math.round((eligibleTotal * rule.percentBps) / 10_000);
  if (discount <= 0) return zero;

  // Kuruş kaybı olmadan uygun satırlara ağırlıklı dağıt.
  return allocateMinor(Math.min(discount, eligibleTotal), eligibleTotals);
}

/**
 * x-al-y-ode: uygun satırları birim seviyesine açar, en ucuz birimleri bedava
 * yapar. `buyQuantity` adette `buyQuantity - payQuantity` adet bedava.
 */
function evalBuyXPayY(rule: DiscountRule, lines: DiscountRuleLine[]): number[] {
  const zero = lines.map(() => 0);
  const buy = rule.buyQuantity ?? 0;
  const pay = rule.payQuantity ?? 0;
  const freePerSet = buy - pay;
  if (buy <= 0 || freePerSet <= 0) return zero;

  // Uygun birimler: { lineIndex, unitPriceMinor } — adet kadar tekrar.
  const units: { lineIndex: number; unitPriceMinor: number }[] = [];
  lines.forEach((l, i) => {
    if (!isEligibleLine(rule, l)) return;
    for (let q = 0; q < l.quantity; q += 1) {
      units.push({ lineIndex: i, unitPriceMinor: l.unitPriceMinor });
    }
  });

  const minQty = rule.minQuantity ?? buy;
  if (units.length < Math.max(minQty, buy)) return zero;

  const sets = Math.floor(units.length / buy);
  const freeUnits = sets * freePerSet;
  if (freeUnits <= 0) return zero;

  // En ucuz birimler bedava.
  units.sort((a, b) => a.unitPriceMinor - b.unitPriceMinor);
  const perLine = zero.slice();
  for (let k = 0; k < freeUnits && k < units.length; k += 1) {
    perLine[units[k].lineIndex] += units[k].unitPriceMinor;
  }
  return perLine;
}

export function evaluateDiscountRules(
  rules: DiscountRule[],
  ctx: DiscountRuleContext,
): DiscountRulesOutcome {
  const now = ctx.now ?? new Date();
  const perLine = ctx.lines.map(() => 0);
  const applied: AppliedDiscount[] = [];

  const ordered = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    if (!rule.isActive || !isInWindow(rule, now)) continue;

    const contribution =
      rule.type === 'sepet-yuzde'
        ? evalCartPercent(rule, ctx.lines)
        : rule.type === 'x-al-y-ode'
          ? evalBuyXPayY(rule, ctx.lines)
          : ctx.lines.map(() => 0);

    let ruleTotal = 0;
    for (let i = 0; i < perLine.length; i += 1) {
      const lineMax = ctx.lines[i].unitPriceMinor * ctx.lines[i].quantity;
      const add = Math.max(0, Math.min(contribution[i] ?? 0, lineMax - perLine[i]));
      perLine[i] += add;
      ruleTotal += add;
    }

    if (ruleTotal > 0) {
      applied.push({ id: rule.id, name: rule.name, type: rule.type, discountMinor: ruleTotal });
      if (!rule.stackable) break;
    }
  }

  return { perLineMinor: perLine, applied };
}
