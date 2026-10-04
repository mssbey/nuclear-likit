// Panel > Stok — hareket listesi, düşük stok raporu, manuel düzeltme.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { getStoreSettings } from '../settings';
import { revalidateCatalog } from '../catalog/queries';

export class InventoryAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'InventoryAdminError';
  }
}

export const MANUAL_REASONS = ['manuel', 'sayım', 'fire'] as const;
export const manualAdjustSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, 'Miktar sıfır olamaz'),
  reason: z.enum(MANUAL_REASONS).default('manuel'),
  note: z.string().trim().max(300).default(''),
});
export type ManualAdjustInput = z.infer<typeof manualAdjustSchema>;

export interface AdminStockMovementRow {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  delta: number;
  reason: string;
  stockAfter: number;
  note: string;
  orderId: string | null;
  orderNumber: string | null;
  createdByName: string | null;
  createdAt: string;
}

const movementInclude = {
  variant: { select: { sku: true, product: { select: { name: true } } } },
  order: { select: { orderNumber: true } },
  user: { select: { name: true, email: true } },
} satisfies Prisma.StockMovementInclude;

function toRow(m: Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>): AdminStockMovementRow {
  return {
    id: m.id,
    variantId: m.variantId,
    productName: m.variant.product.name,
    sku: m.variant.sku,
    delta: m.delta,
    reason: m.reason,
    stockAfter: m.stockAfter,
    note: m.note,
    orderId: m.orderId,
    orderNumber: m.order?.orderNumber ?? null,
    createdByName: m.user?.name || m.user?.email || null,
    createdAt: m.createdAt.toISOString(),
  };
}

export interface StockMovementListParams {
  q?: string;
  reason?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listStockMovements(params: StockMovementListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));
  const where: Prisma.StockMovementWhereInput = { variant: { product: { store: currentStore() } } };
  if (params.reason) where.reason = params.reason;
  if (params.from || params.to) where.createdAt = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) };
  if (params.q) {
    const q = params.q.trim();
    where.OR = [
      { variant: { sku: { contains: q } } },
      { variant: { product: { name: { contains: q } } } },
      { order: { orderNumber: { contains: q.toUpperCase() } } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({ where, include: movementInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: rows.map(toRow), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface LowStockRow {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  stock: number;
}

export async function lowStockReport(): Promise<{ threshold: number; items: LowStockRow[] }> {
  const settings = await getStoreSettings();
  const rows = await db.variant.findMany({
    where: { isActive: true, stock: { lte: settings.lowStockThreshold }, product: { status: 'yayında', store: currentStore() } },
    select: { id: true, productId: true, sku: true, stock: true, product: { select: { name: true, slug: true } } },
    orderBy: { stock: 'asc' },
    take: 200,
  });
  return {
    threshold: settings.lowStockThreshold,
    items: rows.map((v) => ({ variantId: v.id, productId: v.productId, productSlug: v.product.slug, productName: v.product.name, sku: v.sku, stock: v.stock })),
  };
}

export async function manualAdjust(variantId: string, raw: unknown, user: AdminUser, ip: string | null): Promise<AdminStockMovementRow> {
  const input = manualAdjustSchema.parse(raw);
  const variant = await db.variant.findFirst({ where: { id: variantId, product: { store: currentStore() } }, select: { stock: true } });
  if (!variant) throw new InventoryAdminError('Varyant bulunamadı.', 404);

  const stockAfter = variant.stock + input.delta;
  if (stockAfter < 0) throw new InventoryAdminError(`Stok negatif olamaz (mevcut: ${variant.stock}, istenen değişim: ${input.delta}).`, 422);

  const [, movement] = await db.$transaction([
    db.variant.update({ where: { id: variantId }, data: { stock: stockAfter, version: { increment: 1 } } }),
    db.stockMovement.create({
      data: {
        variantId,
        delta: input.delta,
        reason: input.reason,
        note: input.note,
        stockAfter,
        createdByUserId: user.id,
      },
    }),
  ]);

  revalidateCatalog();

  const full = await db.stockMovement.findUniqueOrThrow({ where: { id: movement.id }, include: movementInclude });
  await auditChange({
    user, action: 'guncelle', entityType: 'Variant', entityId: variantId,
    before: { stock: variant.stock }, after: { stock: stockAfter, delta: input.delta, reason: input.reason },
    ip,
  });
  return toRow(full);
}
