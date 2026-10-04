// Basit CSV üretimi/ayrıştırması — tam katalog yedeği JSON'dur.
// CSV, tablo programında gözden geçirme ve toplu fiyat/stok güncellemesi içindir:
// her satır bir varyant; içe aktarımda SKU eşleşen varyantların
// price / compare_at_price / stock / barcode alanları ve ürün status'ü güncellenir.
//
// PARA BİRİMİ: CSV insan tarafından düzenlendiği için fiyat sütunları TL
// cinsindendir ("129.9"). Sınırda kuruşa çevrilir; hem "129,90" hem "129.90"
// kabul edilir. Modelde tutulan değer her zaman kuruştur.

import type { CatalogFile } from '@/types/admin';
import { fromMinor, parseMajorInput } from '@/lib/money';
import { comboLabel } from './variants';

const COLUMNS = [
  'product_slug',
  'product_name',
  'status',
  'category',
  'variant_sku',
  'variant_label',
  'price',
  'compare_at_price',
  'stock',
  'barcode',
  'is_default',
  'is_active',
] as const;

function escapeCell(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function catalogToCsv(catalog: CatalogFile): string {
  const lines = [COLUMNS.join(',')];
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      const row = [
        product.slug,
        product.name,
        product.status,
        product.categoryIds[0] ?? '',
        variant.sku,
        comboLabel(product, variant),
        String(fromMinor(variant.priceMinor)),
        variant.compareAtPriceMinor == null ? '' : String(fromMinor(variant.compareAtPriceMinor)),
        String(variant.stock),
        variant.barcode ?? '',
        variant.isDefault ? '1' : '0',
        variant.isActive ? '1' : '0',
      ];
      lines.push(row.map((c) => escapeCell(String(c))).join(','));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export interface CsvVariantPatch {
  sku: string;
  productSlug: string;
  status?: string;
  /** Kuruş. */
  priceMinor?: number;
  /** Kuruş; boş hücre null demektir. */
  compareAtPriceMinor?: number | null;
  stock?: number;
  barcode?: string | null;
}

export function parseCsvPatches(text: string): CsvVariantPatch[] {
  const rows = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (rows.length < 2) return [];

  const header = parseCsvLine(rows[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iSku = idx('variant_sku');
  const iSlug = idx('product_slug');
  if (iSku === -1 || iSlug === -1) {
    throw new Error('CSV başlığında variant_sku ve product_slug sütunları gerekli');
  }

  const iStatus = idx('status');
  const iPrice = idx('price');
  const iCompare = idx('compare_at_price');
  const iStock = idx('stock');
  const iBarcode = idx('barcode');

  const patches: CsvVariantPatch[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = parseCsvLine(rows[r]);
    const sku = (cells[iSku] ?? '').trim();
    const productSlug = (cells[iSlug] ?? '').trim();
    if (!sku || !productSlug) continue;

    const patch: CsvVariantPatch = { sku, productSlug };
    if (iStatus !== -1 && cells[iStatus]?.trim()) patch.status = cells[iStatus].trim();
    if (iPrice !== -1 && cells[iPrice]?.trim()) {
      const parsed = parseMajorInput(cells[iPrice]);
      if (parsed != null) patch.priceMinor = parsed;
    }
    if (iCompare !== -1) {
      const raw = cells[iCompare]?.trim() ?? '';
      patch.compareAtPriceMinor = raw === '' ? null : parseMajorInput(raw);
    }
    if (iStock !== -1 && cells[iStock]?.trim()) patch.stock = Number(cells[iStock]);
    if (iBarcode !== -1) {
      const raw = cells[iBarcode]?.trim() ?? '';
      patch.barcode = raw === '' ? null : raw;
    }
    patches.push(patch);
  }
  return patches;
}

/** CSV yamalarını kataloğa uygular; değişen ürün sayısını döndürür. */
export function applyCsvPatches(catalog: CatalogFile, patches: CsvVariantPatch[]): {
  catalog: CatalogFile;
  changed: number;
  skipped: number;
} {
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));
  let changed = 0;
  let skipped = 0;
  const touched = new Set<string>();

  for (const patch of patches) {
    const product = bySlug.get(patch.productSlug);
    if (!product) {
      skipped += 1;
      continue;
    }
    const variant = product.variants.find((v) => v.sku === patch.sku);
    if (!variant) {
      skipped += 1;
      continue;
    }
    if (patch.priceMinor != null) variant.priceMinor = patch.priceMinor;
    if (patch.compareAtPriceMinor !== undefined) {
      variant.compareAtPriceMinor = patch.compareAtPriceMinor;
    }
    if (patch.stock != null && Number.isFinite(patch.stock)) {
      variant.stock = Math.max(0, Math.round(patch.stock));
    }
    if (patch.barcode !== undefined) variant.barcode = patch.barcode || null;
    if (patch.status === 'taslak' || patch.status === 'yayında' || patch.status === 'arşiv') {
      product.status = patch.status;
    }
    if (!touched.has(product.id)) {
      touched.add(product.id);
      product.updatedAt = new Date().toISOString();
      changed += 1;
    }
  }

  return { catalog, changed, skipped };
}
