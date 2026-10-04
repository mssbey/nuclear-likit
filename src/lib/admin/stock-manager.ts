// Stok Yönetimi — tüm ürünlerin fiyat / stok / SKU bilgisini tek tabloda
// düzenleme. Bu dosya istemci ile sunucunun ortak kullandığı SAF parçaları
// içerir: tipler, stok ifadesi ("40", "+20", "-5") ve CSV üretme / okuma.
//
// İKİNCİ STOK YOKTUR: ekran `Variant.stock` sütununu okur ve yazar; her
// değişiklik `StockMovement` geçmişine (kim, ne zaman, neden) düşer.
//
// FİYAT: buradan girilen fiyat doğrudan satış fiyatı olur. Üstü çizili eski
// fiyat / indirim rozeti oluşturulmaz; varsa kaldırılır.

import { z } from 'zod';
import { parseMajorInput } from '@/lib/money';

// ------------------------------------------------------------------ tipler --

export interface ManagerVariant {
  id: string;
  /** "60 ML / Sert" — seçeneksiz üründe boş. */
  label: string;
  sku: string;
  priceMinor: number;
  /** Bilgi amaçlı: eski üstü çizili fiyat (fiyat değişince temizlenir). */
  compareAtPriceMinor: number | null;
  stock: number;
  trackStock: boolean;
  inStock: boolean;
  weightGrams: number | null;
  isActive: boolean;
  image: string | null;
}

export interface ManagerProduct {
  id: string;
  slug: string;
  name: string;
  status: string;
  image: string | null;
  categoryIds: string[];
  taxRateId: string | null;
  shippingClass: string;
  variants: ManagerVariant[];
}

export interface ManagerTaxRate {
  id: string;
  name: string;
  rateBps: number;
}

export interface ManagerData {
  products: ManagerProduct[];
  taxRates: ManagerTaxRate[];
  defaultTaxRateBps: number;
  lowStockThreshold: number;
  loadedAt: string;
}

/** Varyant satılabilir mi? Takip açıksa adet, kapalıysa elle seçilen durum. */
export function isAvailable(v: Pick<ManagerVariant, 'trackStock' | 'inStock' | 'stock'>): boolean {
  return v.trackStock ? v.stock > 0 : v.inStock;
}

// --------------------------------------------------------- stok ifadesi ----

export type StockOp = 'set' | 'add' | 'sub';

export interface StockExpr {
  op: StockOp;
  value: number;
}

/**
 * Hücreye yazılanı yorumlar: "40" → 40 yap, "+20" → 20 ekle, "-5" → 5 düş.
 * Geçersizse null.
 */
export function parseStockExpr(text: string): StockExpr | null {
  const t = text.trim().replace(/\s+/g, '');
  const m = /^([+-]?)(\d{1,7})$/.exec(t);
  if (!m) return null;
  const value = Number(m[2]);
  if (m[1] === '+') return value === 0 ? null : { op: 'add', value };
  if (m[1] === '-') return value === 0 ? null : { op: 'sub', value };
  return { op: 'set', value };
}

export function applyStockExpr(current: number, e: StockExpr): number {
  if (e.op === 'add') return current + e.value;
  if (e.op === 'sub') return current - e.value;
  return e.value;
}

// ------------------------------------------------------- kaydetme isteği ----

const stockExprSchema = z.object({
  op: z.enum(['set', 'add', 'sub']),
  value: z.number().int().min(0).max(1_000_000),
  /**
   * "set" işleminde ekranda görülen değer. Kaydederken veritabanındaki stok
   * bundan farklıysa (bu arada sipariş geldiyse) satır ÇAKIŞMA olarak döner,
   * üzerine yazılmaz.
   */
  expected: z.number().int().optional(),
});

export const variantChangeSchema = z.object({
  /** CSV satır numarası ya da tablodaki satır anahtarı — sonuçta geri döner. */
  key: z.string().max(80).optional(),
  variantId: z.string().min(1),
  sku: z.string().trim().max(64).optional(),
  priceMinor: z.number().int().min(1, 'Fiyat 0’dan büyük olmalı').max(100_000_000).optional(),
  stock: stockExprSchema.optional(),
  trackStock: z.boolean().optional(),
  inStock: z.boolean().optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

export const productChangeSchema = z.object({
  productId: z.string().min(1),
  taxRateId: z.string().min(1).nullable().optional(),
  shippingClass: z.string().trim().max(60).optional(),
});

export const managerSaveSchema = z.object({
  source: z.enum(['panel', 'csv']).default('panel'),
  dryRun: z.boolean().default(false),
  variants: z.array(variantChangeSchema).max(5000).default([]),
  products: z.array(productChangeSchema).max(2000).default([]),
});

export type VariantChange = z.infer<typeof variantChangeSchema>;
export type ProductChange = z.infer<typeof productChangeSchema>;
export type ManagerSaveInput = z.input<typeof managerSaveSchema>;

export type RowStatus = 'guncellenecek' | 'guncellendi' | 'degisiklik-yok' | 'cakisma' | 'hata';

export interface RowResult {
  key: string;
  variantId: string | null;
  productId: string | null;
  productName: string;
  label: string;
  sku: string;
  status: RowStatus;
  message?: string;
  /** İnsan okunur değişiklik özetleri: "Stok: 20 → 50", "Fiyat: 500 ₺ → 550 ₺". */
  changes: string[];
  /** Çakışmada veritabanındaki güncel stok. */
  currentStock?: number;
}

export interface ManagerSaveResult {
  ok: true;
  dryRun: boolean;
  results: RowResult[];
  summary: { total: number; updated: number; unchanged: number; conflicts: number; errors: number };
}

// --------------------------------------------------------------- CSV ------
//
// Türkçe Excel ondalık virgül kullandığından ayırıcı ";" ve dosya UTF-8 BOM'lu
// yazılır. Okurken ";", "," ve sekme otomatik algılanır.
//
// EŞLEŞTİRME ASLA ÜRÜN ADIYLA YAPILMAZ: önce Varyasyon ID, sonra SKU, en son
// (tek varyantlı ürünlerde) Ürün ID.

export const CSV_HEADERS = [
  'Ürün ID',
  'Varyasyon ID',
  'SKU',
  'Ürün',
  'Varyasyon',
  'Ürün tipi',
  'Fiyat',
  'Eski üstü çizili fiyat',
  'Stok',
  'Stok takibi',
  'Stok durumu',
  'Ağırlık (g)',
] as const;

function csvCell(value: string): string {
  return /[";\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function trMoney(minor: number): string {
  return (minor / 100).toFixed(2).replace('.', ',');
}

export function buildStockCsv(products: ManagerProduct[]): string {
  const lines = [CSV_HEADERS.join(';')];
  for (const p of products) {
    const variable = p.variants.length > 1;
    for (const v of p.variants) {
      lines.push(
        [
          p.id,
          v.id,
          v.sku,
          p.name,
          v.label,
          variable ? 'Varyasyonlu' : 'Basit',
          trMoney(v.priceMinor),
          v.compareAtPriceMinor != null && v.compareAtPriceMinor > v.priceMinor ? trMoney(v.compareAtPriceMinor) : '',
          v.trackStock ? String(v.stock) : '',
          v.trackStock ? 'Açık' : 'Kapalı',
          isAvailable(v) ? 'Stokta' : 'Stokta yok',
          v.weightGrams == null ? '' : String(v.weightGrams),
        ]
          .map(csvCell)
          .join(';'),
      );
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Tırnaklı alanları ve tırnak içi satır sonlarını destekleyen CSV ayrıştırıcı. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = [';', '\t', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ';');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** CSV'nin bir satırı — sunucu eşleştirmeyi ve doğrulamayı yapar. */
export const csvRowSchema = z.object({
  line: z.number().int(),
  productId: z.string().default(''),
  variantId: z.string().default(''),
  sku: z.string().default(''),
  name: z.string().default(''),
  price: z.string().default(''),
  stock: z.string().default(''),
  trackStock: z.string().default(''),
  inStock: z.string().default(''),
  weight: z.string().default(''),
});
export type CsvRow = z.infer<typeof csvRowSchema>;

const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/[\s_()-]+/g, '')
    .replace(/[ıçşğüö]/g, (c) => ({ ı: 'i', ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o' })[c] ?? c);

const HEADER_KEYS: Record<string, keyof Omit<CsvRow, 'line'>> = {
  [norm('Ürün ID')]: 'productId',
  [norm('Varyasyon ID')]: 'variantId',
  [norm('Varyant ID')]: 'variantId',
  [norm('SKU')]: 'sku',
  [norm('Stok kodu')]: 'sku',
  [norm('Ürün')]: 'name',
  [norm('Fiyat')]: 'price',
  [norm('Stok')]: 'stock',
  [norm('Stok takibi')]: 'trackStock',
  [norm('Stok durumu')]: 'inStock',
  [norm('Ağırlık (g)')]: 'weight',
  [norm('Ağırlık')]: 'weight',
};

export function parseStockCsv(text: string): { rows: CsvRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'Dosyada başlık satırı ve en az bir ürün satırı olmalı.' };
  const header = table[0].map((h) => HEADER_KEYS[norm(h)] ?? null);
  if (!header.includes('variantId') && !header.includes('sku') && !header.includes('productId')) {
    return { rows: [], error: '“Varyasyon ID”, “SKU” ya da “Ürün ID” sütunu bulunamadı.' };
  }
  const rows: CsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const row: CsvRow = {
      line: r + 1,
      productId: '',
      variantId: '',
      sku: '',
      name: '',
      price: '',
      stock: '',
      trackStock: '',
      inStock: '',
      weight: '',
    };
    header.forEach((key, i) => {
      if (key) row[key] = (table[r][i] ?? '').trim();
    });
    rows.push(row);
  }
  return { rows, error: null };
}

/** "Açık / evet / 1 / true" → true, "Kapalı / hayır / 0" → false, boş → undefined. */
export function parseOnOff(text: string): boolean | undefined | null {
  const t = norm(text);
  if (!t) return undefined;
  if (['acik', 'evet', '1', 'true', 'var', 'on'].includes(t)) return true;
  if (['kapali', 'hayir', '0', 'false', 'yok', 'off'].includes(t)) return false;
  return null;
}

/** "Stokta" → true, "Stokta yok / Tükendi" → false, boş → undefined. */
export function parseAvailability(text: string): boolean | undefined | null {
  const t = norm(text);
  if (!t) return undefined;
  if (['stokta', 'var', 'mevcut', 'instock', 'evet', '1'].includes(t)) return true;
  if (['stoktayok', 'yok', 'tukendi', 'outofstock', 'hayir', '0'].includes(t)) return false;
  return null;
}

/** "1.250,50" / "1250.5" / "1250" → kuruş; boş → undefined; geçersiz → null. */
export function parsePriceCell(text: string): number | undefined | null {
  const t = text.replace(/[₺\s]|TL/gi, '');
  if (!t) return undefined;
  const minor = parseMajorInput(t);
  return minor == null || minor <= 0 ? null : minor;
}
