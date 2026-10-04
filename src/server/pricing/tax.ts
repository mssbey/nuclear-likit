// KDV hesabı.
//
// Türkiye'de perakende fiyatlar KDV DAHİL gösterilir; mağaza ayarı
// (`pricesIncludeTax`) bunu belirler. Oranlar ON BİNDE tutulur (2000 = %20).
// Bütün aritmetik kuruş tam sayısı üzerinde; yuvarlama satır bazında yapılır ki
// fatura satırlarının toplamı sipariş toplamına eşit çıksın.
//
// Saf modül — birim testleri doğrudan çalıştırır.

import { taxFromGross, taxFromNet } from '@/lib/money';

/** Türkiye KDV oranları (on binde). */
export const TAX_RATE_BPS = {
  standart: 2000, // %20 — varsayılan
  indirimli: 1000, // %10 — bazı gıda
  temel: 100, // %1 — temel gıda
  sifir: 0,
} as const;

export interface TaxLineInput {
  /** Satır brüt veya net tutarı (ayarına göre), kuruş. */
  amountMinor: number;
  rateBps: number;
}

export interface TaxLineResult {
  /** KDV hariç tutar. */
  netMinor: number;
  /** KDV tutarı. */
  taxMinor: number;
  /** KDV dahil tutar. */
  grossMinor: number;
  rateBps: number;
}

/**
 * Tek bir satır için KDV ayrıştırması.
 * `pricesIncludeTax=true` ise `amountMinor` brüttür ve KDV içinden ayrılır;
 * değilse nettir ve KDV üstüne eklenir.
 */
export function taxLine(input: TaxLineInput, pricesIncludeTax: boolean): TaxLineResult {
  const rate = Math.max(0, Math.round(input.rateBps));
  const amount = Math.max(0, Math.round(input.amountMinor));

  if (pricesIncludeTax) {
    const taxMinor = taxFromGross(amount, rate);
    return { grossMinor: amount, taxMinor, netMinor: amount - taxMinor, rateBps: rate };
  }
  const taxMinor = taxFromNet(amount, rate);
  return { netMinor: amount, taxMinor, grossMinor: amount + taxMinor, rateBps: rate };
}

/** Oran bazında KDV matrahı dökümü — fatura ve sipariş özeti için. */
export interface TaxBreakdownRow {
  rateBps: number;
  netMinor: number;
  taxMinor: number;
}

export function taxBreakdown(lines: TaxLineResult[]): TaxBreakdownRow[] {
  const byRate = new Map<number, TaxBreakdownRow>();
  for (const l of lines) {
    const row = byRate.get(l.rateBps) ?? { rateBps: l.rateBps, netMinor: 0, taxMinor: 0 };
    row.netMinor += l.netMinor;
    row.taxMinor += l.taxMinor;
    byRate.set(l.rateBps, row);
  }
  return [...byRate.values()].sort((a, b) => b.rateBps - a.rateBps);
}
