// Para birimi yardımcıları.
//
// KURAL: Tutarlar her yerde tam sayı KURUŞ olarak taşınır (`priceMinor`).
// Float aritmetiği yalnızca görüntüleme sınırında yapılır. `12990` = 129,90 ₺.
//
// Vitrin tipleri (`ProductVariant.price`) geriye dönük uyumluluk için hâlâ TL
// cinsindendir; dönüşüm `src/data/catalog-adapter.ts` içinde tek noktada olur.

import { currency } from '@/lib/site';

export const MINOR_PER_MAJOR = 100;

/** TL (float) → kuruş (int). Yarım kuruş yukarı yuvarlanır. */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) return 0;
  // Number.EPSILON: 12.99 * 100 = 1298.9999... gibi ikilik gösterim hatalarını kapatır.
  return Math.round((major + Number.EPSILON) * MINOR_PER_MAJOR);
}

/**
 * Kuruş (int) → TL (float). YALNIZCA görüntüleme ve vitrin uyumluluk katmanında
 * kullanılır; hesaplama için kullanılmaz.
 */
export function fromMinor(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return minor / MINOR_PER_MAJOR;
}

/** "129,90 ₺" — vitrindeki `currency()` ile birebir aynı çıktıyı verir. */
export function formatMinor(minor: number): string {
  return currency(fromMinor(minor));
}

/** Form alanı değeri: "129,90" (para simgesi ve binlik ayracı olmadan). */
export function minorToInput(minor: number): string {
  const major = fromMinor(minor);
  return Number.isInteger(major) ? String(major) : major.toFixed(2).replace('.', ',');
}

/**
 * Kullanıcı girdisini kuruşa çevirir. Hem "129,90" hem "129.90" kabul eder;
 * binlik ayracı olarak nokta kullanımını ("1.299,90") da çözer.
 * Geçersiz girdide `null` döner — çağıran taraf hatayı gösterir.
 */
export function parseMajorInput(text: string): number | null {
  const raw = text.trim();
  if (raw === '') return null;

  let normalized = raw.replace(/\s|₺|TL/gi, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // İkisi de var: sonuncusu ondalık ayracıdır, diğeri binlik ayracıdır.
    if (lastComma > lastDot) normalized = normalized.replace(/\./g, '').replace(',', '.');
    else normalized = normalized.replace(/,/g, '');
  } else if (lastComma !== -1) {
    normalized = normalized.replace(',', '.');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return toMinor(value);
}

/** Yüzde indirim oranı (0-100). Karşılaştırma fiyatı yoksa 0. */
export function discountPercentMinor(priceMinor: number, compareAtMinor?: number | null): number {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return 0;
  return Math.round((1 - priceMinor / compareAtMinor) * 100);
}

/**
 * Bir tutarı ağırlıklara göre kuruş kaybı olmadan paylaştırır.
 * Sepet indirimini satırlara dağıtırken kullanılır: parçaların toplamı
 * her zaman girdiye eşittir (kalan kuruşlar en büyük ağırlıklardan başlayarak dağıtılır).
 */
export function allocateMinor(totalMinor: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (totalMinor * w) / sum);
  const floored = exact.map((n) => Math.floor(n));
  let remainder = totalMinor - floored.reduce((a, b) => a + b, 0);

  // Kalan kuruşları en büyük ondalık artığı olan satırlara sırayla ver.
  const order = exact
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac);

  const out = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

/** KDV oranı on binde tutulur: 2000 = %20. */
export const BPS_PER_PERCENT = 100;

export function bpsToPercent(bps: number): number {
  return bps / BPS_PER_PERCENT;
}

export function percentToBps(percent: number): number {
  return Math.round(percent * BPS_PER_PERCENT);
}

/** KDV DAHİL tutardan KDV payını ayırır. */
export function taxFromGross(grossMinor: number, rateBps: number): number {
  if (rateBps <= 0) return 0;
  return Math.round((grossMinor * rateBps) / (10_000 + rateBps));
}

/** KDV HARİÇ tutara KDV ekler. */
export function taxFromNet(netMinor: number, rateBps: number): number {
  if (rateBps <= 0) return 0;
  return Math.round((netMinor * rateBps) / 10_000);
}
