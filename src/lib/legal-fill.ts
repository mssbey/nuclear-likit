// Yasal metin yer tutucularını doldurur — saf, istemci ve sunucuda çalışır.
//
// Checkout özet adımı sözleşmeyi sipariş bilgileriyle doldurulmuş gösterir
// (istemci), sipariş sayfası ise kayıtlı sürümü aynı yolla doldurur (sunucu).

export type LegalVars = Record<string, string | number | null | undefined>;

export function fillLegal(body: string, vars: LegalVars): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null || v === '' ? '—' : String(v);
  });
}

/** Sipariş kalemlerini sözleşmedeki `{{urunListesi}}` için satır listesine çevirir. */
export function legalProductList(
  lines: { name: string; variantLabel: string; quantity: number; unitPriceMinor: number; netLineMinor: number }[],
  formatMinor: (minor: number) => string,
): string {
  return lines
    .map(
      (l) =>
        `- ${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} × ${l.quantity} — birim ${formatMinor(l.unitPriceMinor)}, satır ${formatMinor(l.netLineMinor)}`,
    )
    .join('\n');
}
