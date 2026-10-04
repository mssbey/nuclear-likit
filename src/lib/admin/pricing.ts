// Toplu fiyat güncelleme — belirli ürünler, kategoriler ya da tüm katalog için
// fiyatı yüzde / sabit tutar kadar düşür ya da artır. Düşürme bir "indirim"
// değildir: yeni fiyat doğrudan satış fiyatı olur, üstü çizili eski fiyat ya da
// indirim rozeti oluşmaz (100 → %10 düşür → 90 → tekrar → 81).
// Saf fonksiyonlar: hem sunucu (/api/admin/products/fiyat) hem de testler kullanır.

import { z } from 'zod';

export type PriceMode = 'dusur' | 'artir' | 'indirim-kaldir';
export type PriceValueType = 'yuzde' | 'tutar';
export type PriceScope = 'secili' | 'kategori' | 'tumu';

export const priceAdjustSchema = z
  .object({
    scope: z.enum(['secili', 'kategori', 'tumu']),
    ids: z.array(z.string().min(1)).default([]),
    categoryIds: z.array(z.string().min(1)).default([]),
    mode: z.enum(['dusur', 'artir', 'indirim-kaldir']),
    valueType: z.enum(['yuzde', 'tutar']).default('yuzde'),
    /** Yüzde (10 = %10) ya da TL tutar (25,5 = 25,50 ₺). */
    value: z.number().min(0).max(1_000_000).default(0),
    /** Küsüratı bir üst liraya yuvarla (ör. 183,56 → 184,00). */
    roundUp: z.boolean().default(false),
    /** true ise yazmaz, yalnızca etkilenecek kayıt sayısını döner. */
    dryRun: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'secili' && v.ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ürün seçilmedi', path: ['ids'] });
    }
    if (v.scope === 'kategori' && v.categoryIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Kategori seçilmedi', path: ['categoryIds'] });
    }
    if (v.mode !== 'indirim-kaldir' && v.value <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Değer 0’dan büyük olmalı', path: ['value'] });
    }
    if (v.mode === 'dusur' && v.valueType === 'yuzde' && v.value >= 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Yüzde 100’den küçük olmalı', path: ['value'] });
    }
    if (v.mode === 'artir' && v.valueType === 'yuzde' && v.value > 500) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Artış en fazla %500 olabilir', path: ['value'] });
    }
  });

export type PriceAdjustInput = z.input<typeof priceAdjustSchema>;

export interface PriceAdjustment {
  mode: PriceMode;
  valueType?: PriceValueType;
  value?: number;
  roundUp?: boolean;
}

export interface VariantPrice {
  priceMinor: number;
  compareAtPriceMinor: number | null;
}

/** Tek bir tutara işlemi uygular (kuruş). Önce kuruşa yuvarlanır, sonra istenirse üst liraya. */
function apply(minor: number, a: Required<PriceAdjustment>): number {
  const sign = a.mode === 'dusur' ? -1 : 1;
  const raw =
    a.valueType === 'yuzde' ? (minor * (100 + sign * a.value)) / 100 : minor + sign * Math.round(a.value * 100);
  const kurus = Math.round(raw);
  return a.roundUp ? Math.ceil(kurus / 100) * 100 : kurus;
}

/**
 * Tek varyantın yeni fiyatı; `null` → bu varyanta dokunulmaz.
 *
 * - dusur / artir: satış fiyatı doğrudan değişir. Varyantta önceden girilmiş
 *   bir üstü çizili fiyat varsa o da aynı işlemle değişir (oran korunur); yeni
 *   üstü çizili fiyat ASLA oluşturulmaz.
 * - indirim-kaldir: üstü çizili fiyat satış fiyatına geri döner.
 *
 * Fiyatı 0 olan (fiyatı girilmemiş) varyant ve düşürünce 0 ya da altına inecek
 * varyant atlanır.
 */
export function adjustPrice(v: VariantPrice, adj: PriceAdjustment): VariantPrice | null {
  const a: Required<PriceAdjustment> = { valueType: 'yuzde', value: 0, roundUp: false, ...adj };
  const onSale = v.compareAtPriceMinor != null && v.compareAtPriceMinor > v.priceMinor;

  if (a.mode === 'indirim-kaldir') {
    return { priceMinor: onSale ? (v.compareAtPriceMinor as number) : v.priceMinor, compareAtPriceMinor: null };
  }
  if (v.priceMinor <= 0) return null;

  const priceMinor = apply(v.priceMinor, a);
  if (priceMinor <= 0) return null;
  const compare = onSale ? apply(v.compareAtPriceMinor as number, a) : null;
  return { priceMinor, compareAtPriceMinor: compare != null && compare > priceMinor ? compare : null };
}

/** Seçilen kategoriler + tüm alt kategorileri (döngüye karşı korumalı). */
export function withDescendants(
  categories: { id: string; parentId: string | null }[],
  roots: string[],
): string[] {
  const out = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return [...out];
}
