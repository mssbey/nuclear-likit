// Panel > Stok Yönetimi — sunucu tarafı.
//
// Okuma her zaman veritabanından TAZE yapılır (önbellek yok): ekranda görülen
// stok, sitenin satış yaptığı stokla aynıdır.
//
// Kaydetme tek transaction'dır:
//   1. Değişen varyant satırları `FOR UPDATE` ile kilitlenir — aynı anda gelen
//      sipariş (reserveStock) ya bekler ya da bizden önce biter.
//   2. "Stoku X yap" işleminde ekranda görülen değer veritabanındakiyle
//      karşılaştırılır; arada sipariş düştüyse satır ÇAKIŞMA olur ve yazılmaz.
//      "+20" / "-5" işlemleri güncel değere uygulanır (çakışmaz).
//   3. Tüm varyantlar tek UPDATE ... FROM (VALUES ...) ile yazılır, her stok
//      farkı için `StockMovement` (kim / neden / sonrası) eklenir.

import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { formatMinor } from '@/lib/money';
import {
  applyStockExpr,
  managerSaveSchema,
  parseAvailability,
  parseOnOff,
  parsePriceCell,
  parseStockExpr,
  type CsvRow,
  type ManagerData,
  type ManagerProduct,
  type ManagerSaveResult,
  type ProductChange,
  type RowResult,
  type VariantChange,
} from '@/lib/admin/stock-manager';
import { db } from '../db';
import { currentStore } from '../store-context';
import { writeAudit } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { getStoreSettings } from '../settings';
import { revalidateCatalog } from '../catalog/queries';
import { jsonRecord } from '../catalog/mapping';

const CHUNK = 400;

// ---------------------------------------------------------------- okuma ----

export async function loadManagerData(): Promise<ManagerData> {
  const [rows, taxRates, settings] = await Promise.all([
    db.product.findMany({
      where: { store: currentStore() },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        taxRateId: true,
        shippingClass: true,
        images: { orderBy: { position: 'asc' }, take: 1, select: { src: true } },
        options: {
          orderBy: { position: 'asc' },
          select: { localId: true, values: { select: { localId: true, label: true } } },
        },
        categories: { orderBy: { position: 'asc' }, select: { categoryId: true } },
        variants: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            optionValues: true,
            sku: true,
            priceMinor: true,
            compareAtPriceMinor: true,
            stock: true,
            trackStock: true,
            inStock: true,
            weightGrams: true,
            isActive: true,
            image: true,
          },
        },
      },
    }),
    db.taxRate.findMany({ orderBy: { rateBps: 'asc' }, select: { id: true, name: true, rateBps: true } }),
    getStoreSettings(),
  ]);

  const products: ManagerProduct[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    image: p.images[0]?.src ?? null,
    categoryIds: p.categories.map((c) => c.categoryId),
    taxRateId: p.taxRateId,
    shippingClass: p.shippingClass,
    variants: p.variants.map((v) => {
      const sel = jsonRecord(v.optionValues);
      const label = p.options
        .map((o) => o.values.find((x) => x.localId === sel[o.localId])?.label)
        .filter((x): x is string => Boolean(x))
        .join(' / ');
      return {
        id: v.id,
        label,
        sku: v.sku,
        priceMinor: v.priceMinor,
        compareAtPriceMinor: v.compareAtPriceMinor,
        stock: v.stock,
        trackStock: v.trackStock,
        inStock: v.inStock,
        weightGrams: v.weightGrams,
        isActive: v.isActive,
        image: v.image,
      };
    }),
  }));

  return {
    products,
    taxRates,
    defaultTaxRateBps: settings.defaultTaxRateBps,
    lowStockThreshold: settings.lowStockThreshold,
    loadedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------- kaydetme ----

interface LockedVariant {
  id: string;
  productId: string;
  sku: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  stock: number;
  trackStock: boolean;
  inStock: boolean;
  weightGrams: number | null;
  productName: string;
  optionValues: unknown;
}

type VariantState = Pick<
  LockedVariant,
  'sku' | 'priceMinor' | 'compareAtPriceMinor' | 'stock' | 'trackStock' | 'inStock' | 'weightGrams'
>;

const stateOf = (v: LockedVariant): VariantState => ({
  sku: v.sku,
  priceMinor: v.priceMinor,
  compareAtPriceMinor: v.compareAtPriceMinor,
  stock: v.stock,
  trackStock: v.trackStock,
  inStock: v.inStock,
  weightGrams: v.weightGrams,
});

interface PlannedVariant {
  before: LockedVariant;
  after: VariantState;
  movement: { delta: number; reason: string; note: string } | null;
}

const onOff = (b: boolean) => (b ? 'Açık' : 'Kapalı');
const avail = (b: boolean) => (b ? 'Stokta' : 'Stokta yok');

function stockMovementFor(
  source: 'panel' | 'csv',
  op: 'set' | 'add' | 'sub',
  delta: number,
): { reason: string; note: string } {
  if (source === 'csv') return { reason: 'csv', note: 'CSV aktarımı' };
  if (op === 'add') return { reason: 'giriş', note: `Yeni stok girişi: ${delta} adet eklendi` };
  if (op === 'sub') return { reason: 'çıkış', note: `Manuel stok çıkışı: ${-delta} adet düşüldü` };
  return {
    reason: 'manuel',
    note: delta > 0 ? `Manuel ${delta} adet eklendi` : `Manuel ${-delta} adet düşüldü`,
  };
}

export async function saveManagerChanges(
  raw: unknown,
  user: AdminUser,
  extraResults: RowResult[] = [],
): Promise<ManagerSaveResult> {
  const input = managerSaveSchema.parse(raw);
  const results: RowResult[] = [...extraResults];

  const store = currentStore();
  const outcome = await db.$transaction(
    async (tx) => {
      const ids = [...new Set(input.variants.map((c) => c.variantId))];
      const locked = ids.length
        ? await tx.$queryRaw<LockedVariant[]>`
            SELECT v.id, v."productId", v.sku, v."priceMinor", v."compareAtPriceMinor", v.stock,
                   v."trackStock", v."inStock", v."weightGrams", v."optionValues", p.name AS "productName"
            FROM "Variant" v JOIN "Product" p ON p.id = v."productId"
            WHERE v.id IN (${Prisma.join(ids)}) AND p.store = ${store}
            FOR UPDATE OF v`
        : [];
      const byId = new Map(locked.map((v) => [v.id, v]));

      // SKU çakışması: bu partide yeni SKU alacak varyantlar, başka bir
      // varyantın (partide olmayan ya da partide aynı SKU'yu alan) SKU'su olamaz.
      const finalSku = new Map<string, string>();
      for (const v of locked) finalSku.set(v.id, v.sku);
      for (const c of input.variants) if (c.sku !== undefined && byId.has(c.variantId)) finalSku.set(c.variantId, c.sku);
      const wantedSkus = [
        ...new Set(
          input.variants
            .filter((c) => c.sku && byId.has(c.variantId) && c.sku !== byId.get(c.variantId)!.sku)
            .map((c) => c.sku as string),
        ),
      ];
      const skuOwners = wantedSkus.length
        ? await tx.variant.findMany({
            where: { sku: { in: wantedSkus }, id: { notIn: ids } },
            select: { id: true, sku: true, product: { select: { name: true } } },
          })
        : [];
      const takenOutside = new Map(skuOwners.map((o) => [o.sku, o.product.name]));
      const skuCount = new Map<string, number>();
      for (const s of finalSku.values()) if (s) skuCount.set(s, (skuCount.get(s) ?? 0) + 1);

      const planned = new Map<string, PlannedVariant>();

      for (const c of input.variants) {
        const key = c.key ?? c.variantId;
        const cur = byId.get(c.variantId);
        const base: Omit<RowResult, 'status' | 'changes'> = {
          key,
          variantId: c.variantId,
          productId: cur?.productId ?? null,
          productName: cur?.productName ?? '',
          label: '',
          sku: cur?.sku ?? c.sku ?? '',
        };
        if (!cur) {
          results.push({ ...base, status: 'hata', message: 'Varyant bulunamadı (silinmiş olabilir).', changes: [] });
          continue;
        }
        // Aynı varyanta ikinci değişiklik (CSV'de tekrarlanan satır) — öncekinin üzerine kurulur.
        const prev = planned.get(cur.id);
        const from: VariantState = prev ? prev.after : stateOf(cur);
        const next = { ...from };
        const changes: string[] = [];
        let error: string | null = null;
        let conflict: number | undefined;
        let movement = prev?.movement ?? null;

        if (c.sku !== undefined && c.sku !== from.sku) {
          if (c.sku && takenOutside.has(c.sku)) error = `“${c.sku}” SKU’su başka bir üründe kullanılıyor (${takenOutside.get(c.sku)}).`;
          else if (c.sku && (skuCount.get(c.sku) ?? 0) > 1) error = `“${c.sku}” SKU’su bu kayıtta birden fazla varyanta verilmiş.`;
          else {
            changes.push(`SKU: ${from.sku || '—'} → ${c.sku || '—'}`);
            next.sku = c.sku;
          }
        }

        if (!error && c.priceMinor !== undefined && c.priceMinor !== from.priceMinor) {
          changes.push(`Fiyat: ${formatMinor(from.priceMinor)} → ${formatMinor(c.priceMinor)}`);
          next.priceMinor = c.priceMinor;
          // Doğrudan güncelleme: üstü çizili eski fiyat / indirim rozeti kalkar.
          next.compareAtPriceMinor = null;
        }

        if (!error && c.trackStock !== undefined && c.trackStock !== from.trackStock) {
          changes.push(`Stok takibi: ${onOff(from.trackStock)} → ${onOff(c.trackStock)}`);
          next.trackStock = c.trackStock;
        }

        if (!error && c.stock) {
          if (c.stock.op === 'set' && c.stock.expected !== undefined && !prev && c.stock.expected !== cur.stock) {
            conflict = cur.stock;
            error = `Stok bu arada değişti (ekranda ${c.stock.expected}, şu an ${cur.stock}). Satırı yenileyip tekrar deneyin.`;
          } else {
            const target = applyStockExpr(from.stock, c.stock);
            if (target < 0) error = `Stok negatif olamaz (mevcut ${from.stock}, düşülmek istenen ${c.stock.value}).`;
            else if (target > 1_000_000) error = 'Stok en fazla 1.000.000 olabilir.';
            else if (target !== from.stock) {
              changes.push(`Stok: ${from.stock} → ${target}`);
              next.stock = target;
              const delta = target - cur.stock;
              movement = delta === 0 ? null : { delta, ...stockMovementFor(input.source, c.stock.op, delta) };
            }
          }
        }

        if (!error && c.inStock !== undefined && c.inStock !== from.inStock) {
          // Takip açıkken durum adetten türetilir; elle seçim yalnız takip kapalıyken anlamlı.
          if (!next.trackStock) changes.push(`Stok durumu: ${avail(from.inStock)} → ${avail(c.inStock)}`);
          next.inStock = c.inStock;
        }

        if (!error && c.weightGrams !== undefined && c.weightGrams !== from.weightGrams) {
          changes.push(`Ağırlık: ${from.weightGrams ?? '—'} g → ${c.weightGrams ?? '—'} g`);
          next.weightGrams = c.weightGrams;
        }

        if (error) {
          results.push({ ...base, status: conflict !== undefined ? 'cakisma' : 'hata', message: error, changes: [], currentStock: conflict });
          continue;
        }
        planned.set(cur.id, { before: cur, after: next, movement });
        results.push({
          ...base,
          status: changes.length ? (input.dryRun ? 'guncellenecek' : 'guncellendi') : 'degisiklik-yok',
          changes,
        });
      }

      // --- ürün düzeyi (KDV, kargo sınıfı)
      const productPlans: { id: string; data: { taxRateId?: string | null; shippingClass?: string } }[] = [];
      if (input.products.length) {
        const pRows = await tx.product.findMany({
          where: { store, id: { in: input.products.map((p) => p.productId) } },
          select: { id: true, name: true, taxRateId: true, shippingClass: true, taxRate: { select: { name: true } } },
        });
        const taxIds = input.products.map((p) => p.taxRateId).filter((x): x is string => !!x);
        const taxes = taxIds.length ? await tx.taxRate.findMany({ where: { id: { in: taxIds } }, select: { id: true, name: true } }) : [];
        const taxName = new Map(taxes.map((t) => [t.id, t.name]));
        const pById = new Map(pRows.map((p) => [p.id, p]));
        for (const c of input.products as ProductChange[]) {
          const p = pById.get(c.productId);
          const base = { key: `urun:${c.productId}`, variantId: null, productId: c.productId, productName: p?.name ?? '', label: '', sku: '' };
          if (!p) {
            results.push({ ...base, status: 'hata', message: 'Ürün bulunamadı.', changes: [] });
            continue;
          }
          const data: { taxRateId?: string | null; shippingClass?: string } = {};
          const changes: string[] = [];
          if (c.taxRateId !== undefined && c.taxRateId !== p.taxRateId) {
            if (c.taxRateId && !taxName.has(c.taxRateId)) {
              results.push({ ...base, status: 'hata', message: 'KDV oranı bulunamadı.', changes: [] });
              continue;
            }
            changes.push(`KDV: ${p.taxRate?.name ?? 'Varsayılan'} → ${c.taxRateId ? taxName.get(c.taxRateId) : 'Varsayılan'}`);
            data.taxRateId = c.taxRateId;
          }
          if (c.shippingClass !== undefined && c.shippingClass !== p.shippingClass) {
            changes.push(`Kargo sınıfı: ${p.shippingClass || '—'} → ${c.shippingClass || '—'}`);
            data.shippingClass = c.shippingClass;
          }
          if (changes.length) productPlans.push({ id: p.id, data });
          results.push({ ...base, status: changes.length ? (input.dryRun ? 'guncellenecek' : 'guncellendi') : 'degisiklik-yok', changes });
        }
      }

      if (input.dryRun) return { variantPlans: [] as PlannedVariant[], productPlans: [] as typeof productPlans };

      const variantPlans = [...planned.values()].filter(
        (pl) =>
          pl.after.sku !== pl.before.sku ||
          pl.after.priceMinor !== pl.before.priceMinor ||
          pl.after.compareAtPriceMinor !== pl.before.compareAtPriceMinor ||
          pl.after.stock !== pl.before.stock ||
          pl.after.trackStock !== pl.before.trackStock ||
          pl.after.inStock !== pl.before.inStock ||
          pl.after.weightGrams !== pl.before.weightGrams,
      );

      for (let i = 0; i < variantPlans.length; i += CHUNK) {
        const rows = variantPlans.slice(i, i + CHUNK).map(
          ({ before: b, after: a }) =>
            Prisma.sql`(${b.id}, ${a.sku}, ${a.priceMinor}::int, ${a.compareAtPriceMinor}::int, ${a.stock}::int, ${a.trackStock}::boolean, ${a.inStock}::boolean, ${a.weightGrams}::int)`,
        );
        await tx.$executeRaw`
          UPDATE "Variant" AS v
          SET sku = x.sku, "priceMinor" = x.p, "compareAtPriceMinor" = x.c, stock = x.s,
              "trackStock" = x.t, "inStock" = x.i, "weightGrams" = x.w,
              version = v.version + 1, "updatedAt" = now()
          FROM (VALUES ${Prisma.join(rows)}) AS x(id, sku, p, c, s, t, i, w)
          WHERE v.id = x.id`;
      }

      const movements = variantPlans
        .filter((pl) => pl.movement)
        .map((pl) => ({
          variantId: pl.before.id,
          delta: pl.movement!.delta,
          reason: pl.movement!.reason,
          note: pl.movement!.note,
          stockAfter: pl.after.stock,
          createdByUserId: user.id,
        }));
      if (movements.length) await tx.stockMovement.createMany({ data: movements });

      for (const pp of productPlans) await tx.product.update({ where: { id: pp.id }, data: pp.data });

      const touched = [...new Set([...variantPlans.map((pl) => pl.before.productId), ...productPlans.map((p) => p.id)])];
      if (touched.length) await tx.product.updateMany({ where: { id: { in: touched } }, data: { updatedAt: new Date() } });

      return { variantPlans, productPlans };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  if (!input.dryRun && (outcome.variantPlans.length || outcome.productPlans.length)) {
    revalidateCatalog();
    const lines = results.filter((r) => r.status === 'guncellendi');
    await writeAudit({
      user,
      action: 'guncelle',
      entityType: 'StokYonetimi',
      entityId: input.source,
      diff: {
        stokYonetimi: {
          before: null,
          after: lines
            .slice(0, 300)
            .map((r) => `${r.productName}${r.sku ? ` [${r.sku}]` : ''}: ${r.changes.join(', ')}`),
        },
      },
    });
  }

  const count = (s: RowResult['status'][]) => results.filter((r) => s.includes(r.status)).length;
  return {
    ok: true,
    dryRun: input.dryRun,
    results,
    summary: {
      total: results.length,
      updated: count(['guncellenecek', 'guncellendi']),
      unchanged: count(['degisiklik-yok']),
      conflicts: count(['cakisma']),
      errors: count(['hata']),
    },
  };
}

// ------------------------------------------------------------------ CSV ----

/**
 * CSV satırlarını varyantlarla eşleştirir ve değişiklik listesine çevirir.
 * Eşleştirme sırası: Varyasyon ID → SKU → Ürün ID (yalnız tek varyantlı
 * üründe). Ürün ADI hiçbir zaman kullanılmaz.
 */
export async function csvToChanges(rows: CsvRow[]): Promise<{ changes: VariantChange[]; errors: RowResult[] }> {
  const variants = await db.variant.findMany({
    where: { product: { store: currentStore() } },
    select: { id: true, sku: true, productId: true, product: { select: { name: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const bySku = new Map<string, typeof variants>();
  const byProduct = new Map<string, typeof variants>();
  for (const v of variants) {
    if (v.sku) bySku.set(v.sku.toLocaleUpperCase('tr'), [...(bySku.get(v.sku.toLocaleUpperCase('tr')) ?? []), v]);
    byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  }

  const changes: VariantChange[] = [];
  const errors: RowResult[] = [];
  for (const r of rows) {
    const key = `satır ${r.line}`;
    const fail = (message: string) =>
      errors.push({ key, variantId: null, productId: null, productName: r.name, label: '', sku: r.sku, status: 'hata', message, changes: [] });

    let match: (typeof variants)[number] | undefined;
    if (r.variantId) {
      match = byId.get(r.variantId);
      if (!match) {
        fail(`Varyasyon ID bulunamadı: ${r.variantId}`);
        continue;
      }
    } else if (r.sku) {
      const hits = bySku.get(r.sku.toLocaleUpperCase('tr')) ?? [];
      if (hits.length > 1) {
        fail(`“${r.sku}” SKU’su birden fazla varyantta var; Varyasyon ID ile eşleştirin.`);
        continue;
      }
      match = hits[0];
      if (!match) {
        fail(`SKU bulunamadı: ${r.sku}`);
        continue;
      }
    } else if (r.productId) {
      const hits = byProduct.get(r.productId) ?? [];
      if (hits.length > 1) {
        fail('Varyasyonlu ürün: satırda Varyasyon ID ya da SKU olmalı.');
        continue;
      }
      match = hits[0];
      if (!match) {
        fail(`Ürün ID bulunamadı: ${r.productId}`);
        continue;
      }
    } else {
      fail('Satırda Varyasyon ID, SKU ya da Ürün ID yok.');
      continue;
    }

    const change: VariantChange = { key, variantId: match.id };
    const price = parsePriceCell(r.price);
    if (price === null) {
      fail(`Geçersiz fiyat: “${r.price}”`);
      continue;
    }
    if (price !== undefined) change.priceMinor = price;

    if (r.stock.trim()) {
      const expr = parseStockExpr(r.stock);
      if (!expr) {
        fail(`Geçersiz stok: “${r.stock}” (ör. 40, +20, -5)`);
        continue;
      }
      change.stock = expr;
    }
    const track = parseOnOff(r.trackStock);
    if (track === null) {
      fail(`Geçersiz stok takibi: “${r.trackStock}” (Açık / Kapalı)`);
      continue;
    }
    if (track !== undefined) change.trackStock = track;
    const av = parseAvailability(r.inStock);
    if (av === null) {
      fail(`Geçersiz stok durumu: “${r.inStock}” (Stokta / Stokta yok)`);
      continue;
    }
    // Takip açıkken durum adetten türetilir; dosyadaki değer yok sayılır.
    if (av !== undefined && track !== true) change.inStock = av;
    if (r.weight.trim()) {
      const w = Number(r.weight.replace(',', '.'));
      if (!Number.isFinite(w) || w < 0) {
        fail(`Geçersiz ağırlık: “${r.weight}”`);
        continue;
      }
      change.weightGrams = Math.round(w);
    }
    changes.push(change);
  }
  return { changes, errors };
}

// --------------------------------------------------------------- geçmiş ----

export async function variantHistory(variantId: string) {
  const [variant, movements] = await Promise.all([
    db.variant.findFirst({
      where: { id: variantId, product: { store: currentStore() } },
      select: { id: true, sku: true, stock: true, trackStock: true, product: { select: { name: true } } },
    }),
    db.stockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { order: { select: { id: true, orderNumber: true } }, user: { select: { name: true, email: true } } },
    }),
  ]);
  return {
    variant,
    items: movements.map((m) => ({
      id: m.id,
      delta: m.delta,
      stockBefore: m.stockAfter - m.delta,
      stockAfter: m.stockAfter,
      reason: m.reason,
      note: m.note,
      orderId: m.order?.id ?? null,
      orderNumber: m.order?.orderNumber ?? null,
      byName: m.user?.name || m.user?.email || null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export type VariantHistory = Awaited<ReturnType<typeof variantHistory>>;
