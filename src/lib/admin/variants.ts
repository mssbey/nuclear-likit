// Varyant matrisi yardımcıları — saf fonksiyonlar, hem istemci hem sunucu kullanır.

import type { AdminProduct, AdminVariant, ProductOption } from '@/types/admin';

let seq = 0;
/** Deterministik olmayan ama çakışmayan yerel kimlik (istemci tarafı geçici id). */
export function localId(prefix = 'id'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/** Seçenek sırasına göre kombinasyon anahtarı üretir. */
export function comboKeyOf(
  options: ProductOption[],
  optionValues: Record<string, string>,
): string {
  return [...options]
    .sort((a, b) => a.order - b.order)
    .map((opt) => `${opt.id}:${optionValues[opt.id] ?? ''}`)
    .join('|');
}

/** options dizisinden tüm değer kombinasyonlarının kartezyen çarpımı. */
export function cartesian(options: ProductOption[]): Record<string, string>[] {
  const ordered = [...options].sort((a, b) => a.order - b.order).filter((o) => o.values.length > 0);
  if (ordered.length === 0) return [];
  return ordered.reduce<Record<string, string>[]>(
    (acc, opt) => {
      const next: Record<string, string>[] = [];
      for (const row of acc) {
        for (const value of opt.values) {
          next.push({ ...row, [opt.id]: value.id });
        }
      }
      return next;
    },
    [{}],
  );
}

/** Yeni ürün/varyant açıldığında önerilen stok; editörde elle değiştirilebilir. */
export const DEFAULT_NEW_STOCK = 6000;

export function emptyVariant(overrides: Partial<AdminVariant> = {}): AdminVariant {
  return {
    id: localId('var'),
    comboKey: '',
    optionValues: {},
    sku: '',
    priceMinor: 0,
    compareAtPriceMinor: null,
    stock: DEFAULT_NEW_STOCK,
    barcode: null,
    image: null,
    isDefault: false,
    isActive: true,
    ...overrides,
  };
}

/** Seçeneksiz ürün için tek gizli varsayılan varyant. */
export function hiddenDefaultVariant(base?: Partial<AdminVariant>): AdminVariant {
  return emptyVariant({ isDefault: true, isActive: true, ...base });
}

/**
 * Seçenek tanımlarından varyant matrisini yeniden üretir.
 * Mevcut varyantların girilmiş verisi kombinasyon anahtarına göre korunur.
 */
export function generateMatrix(
  options: ProductOption[],
  existing: AdminVariant[],
): AdminVariant[] {
  const usableOptions = options.filter((o) => o.values.length > 0);

  if (usableOptions.length === 0) {
    // Seçeneksiz: tek varyant. Varsa ilk mevcut varyantın verisini koru.
    const keep = existing[0];
    return [
      hiddenDefaultVariant(
        keep
          ? {
              id: keep.id,
              sku: keep.sku,
              priceMinor: keep.priceMinor,
              compareAtPriceMinor: keep.compareAtPriceMinor,
              stock: keep.stock,
              barcode: keep.barcode,
              image: keep.image,
            }
          : undefined,
      ),
    ];
  }

  const byCombo = new Map<string, AdminVariant>();
  for (const v of existing) {
    const key = v.comboKey || comboKeyOf(options, v.optionValues);
    byCombo.set(key, v);
  }

  const rows = cartesian(usableOptions);
  const result: AdminVariant[] = rows.map((optionValues) => {
    const comboKey = comboKeyOf(options, optionValues);
    const prev = byCombo.get(comboKey);
    if (prev) {
      return { ...prev, comboKey, optionValues, isDefault: false };
    }
    return emptyVariant({ comboKey, optionValues, isDefault: false });
  });

  return ensureSingleDefault(result, existing);
}

/** Tam olarak bir varsayılan varyant olmasını garanti eder. */
export function ensureSingleDefault(
  variants: AdminVariant[],
  previous: AdminVariant[] = [],
): AdminVariant[] {
  if (variants.length === 0) return variants;
  const prevDefaultKey = previous.find((v) => v.isDefault)?.comboKey;

  let defaultIndex = variants.findIndex((v) => v.comboKey && v.comboKey === prevDefaultKey);
  if (defaultIndex === -1) defaultIndex = variants.findIndex((v) => v.isDefault && v.isActive);
  if (defaultIndex === -1) defaultIndex = variants.findIndex((v) => v.isActive);
  if (defaultIndex === -1) defaultIndex = 0;

  return variants.map((v, i) => ({ ...v, isDefault: i === defaultIndex }));
}

export function setDefaultVariant(variants: AdminVariant[], variantId: string): AdminVariant[] {
  const target = variants.find((v) => v.id === variantId);
  if (!target) return variants;
  return variants.map((v) => ({
    ...v,
    isDefault: v.id === variantId,
    isActive: v.id === variantId ? true : v.isActive,
  }));
}

export type BulkVariantPatch =
  | { kind: 'priceMinor'; value: number }
  | { kind: 'stock'; value: number }
  | { kind: 'compareAtPriceMinor'; value: number | null }
  | { kind: 'discountPercent'; value: number };

/** "Tüm satırlara uygula" hızlı işlemi. */
export function applyToAll(variants: AdminVariant[], patch: BulkVariantPatch): AdminVariant[] {
  return variants.map((v) => {
    switch (patch.kind) {
      case 'priceMinor':
        return { ...v, priceMinor: Math.max(0, Math.round(patch.value)) };
      case 'stock':
        return { ...v, stock: Math.max(0, Math.round(patch.value)) };
      case 'compareAtPriceMinor':
        return {
          ...v,
          compareAtPriceMinor: patch.value == null ? null : Math.max(0, Math.round(patch.value)),
        };
      case 'discountPercent': {
        const pct = Math.min(90, Math.max(0, patch.value));
        if (pct === 0) return { ...v, compareAtPriceMinor: null };
        const base = v.compareAtPriceMinor ?? v.priceMinor;
        return {
          ...v,
          compareAtPriceMinor: base,
          priceMinor: Math.round((base * (100 - pct)) / 100),
        };
      }
      default:
        return v;
    }
  });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Kuruş cinsinden fiyat aralığı. */
export interface VariantPriceRange {
  min: number;
  max: number;
}

export function priceRangeOf(variants: AdminVariant[]): VariantPriceRange {
  const active = variants.filter((v) => v.isActive);
  const pool = (active.length ? active : variants).map((v) => v.priceMinor).filter((p) => p > 0);
  if (pool.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...pool), max: Math.max(...pool) };
}

/** Bir üründe stokta olmayan (aktif ama stok 0) varyant sayısı. */
export function outOfStockCount(product: Pick<AdminProduct, 'variants'>): number {
  return product.variants.filter((v) => v.isActive && v.stock <= 0).length;
}

/** İnsan-okur kombinasyon etiketi: "250g · Vanilya" */
export function comboLabel(product: AdminProduct, variant: AdminVariant): string {
  const parts = [...product.options]
    .sort((a, b) => a.order - b.order)
    .map((opt) => opt.values.find((val) => val.id === variant.optionValues[opt.id])?.label)
    .filter((x): x is string => Boolean(x));
  return parts.length ? parts.join(' · ') : 'Tek varyant';
}
