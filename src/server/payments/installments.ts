// Taksit tablosu ve vade farkı — saf.
//
// Türkiye'de taksit, kartın bankasına (BIN) ve tutara göre değişir. Gerçek
// tablo sağlayıcıdan (iyzico installment-info) veya panel ayarından gelir;
// burada iki kaynak da aynı kurala indirgenir: her taksit seçeneği için ON BİNDE
// vade farkı oranı. Tutar hesabı kuruş tam sayısı.

export interface InstallmentRule {
  /** Taksit sayısı (1 = tek çekim). */
  count: number;
  /** Vade farkı, on binde (0 = vade farksız). */
  rateBps: number;
  /** Bu taksitin geçerli olduğu minimum sepet tutarı, kuruş. */
  minAmountMinor?: number;
}

export interface BankInstallmentTable {
  /** Banka/kart programı adı; 'varsayilan' hepsine uygulanır. */
  bank: string;
  /** BIN önekleri (6 hane). Boşsa varsayılan tablo. */
  bins: string[];
  rules: InstallmentRule[];
}

export interface InstallmentOption {
  count: number;
  rateBps: number;
  /** Toplam ödenen (vade farkı dahil), kuruş. */
  totalMinor: number;
  /** Aylık tutar (son ay kuruş farkını kapatır), kuruş. */
  perMonthMinor: number;
  /** Vade farkı, kuruş. */
  interestMinor: number;
}

export const DEFAULT_INSTALLMENTS: BankInstallmentTable[] = [
  {
    bank: 'varsayilan',
    bins: [],
    rules: [
      { count: 1, rateBps: 0 },
      { count: 2, rateBps: 0, minAmountMinor: 30_000 },
      { count: 3, rateBps: 250, minAmountMinor: 30_000 },
      { count: 6, rateBps: 600, minAmountMinor: 60_000 },
      { count: 9, rateBps: 950, minAmountMinor: 100_000 },
    ],
  },
];

/** BIN'e uyan tablo; yoksa 'varsayilan'. */
export function tableForBin(tables: BankInstallmentTable[], bin: string | null | undefined): BankInstallmentTable | null {
  const clean = (bin ?? '').replace(/\D/g, '').slice(0, 6);
  if (clean.length === 6) {
    const hit = tables.find((t) => t.bins.some((b) => clean.startsWith(b)));
    if (hit) return hit;
  }
  return tables.find((t) => t.bank === 'varsayilan' || t.bins.length === 0) ?? null;
}

export function installmentOptions(
  amountMinor: number,
  tables: BankInstallmentTable[],
  bin?: string | null,
  maxCount = 12,
): InstallmentOption[] {
  const table = tableForBin(tables, bin);
  const rules = table ? table.rules : [{ count: 1, rateBps: 0 }];
  const out: InstallmentOption[] = [];
  for (const r of rules) {
    if (r.count < 1 || r.count > maxCount) continue;
    if (r.minAmountMinor != null && amountMinor < r.minAmountMinor) continue;
    const interestMinor = Math.round((amountMinor * r.rateBps) / 10_000);
    const totalMinor = amountMinor + interestMinor;
    out.push({
      count: r.count,
      rateBps: r.rateBps,
      totalMinor,
      interestMinor,
      perMonthMinor: Math.ceil(totalMinor / r.count),
    });
  }
  // Tek çekim her zaman var.
  if (!out.some((o) => o.count === 1)) {
    out.unshift({ count: 1, rateBps: 0, totalMinor: amountMinor, interestMinor: 0, perMonthMinor: amountMinor });
  }
  return out.sort((a, b) => a.count - b.count);
}

/** Seçilen taksitin toplamı — sipariş/ödeme kaydına yazılır. Geçersiz taksit → tek çekim. */
export function resolveInstallment(
  amountMinor: number,
  tables: BankInstallmentTable[],
  count: number,
  bin?: string | null,
): InstallmentOption {
  const opts = installmentOptions(amountMinor, tables, bin);
  return opts.find((o) => o.count === count) ?? opts[0];
}
