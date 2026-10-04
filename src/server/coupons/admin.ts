// Panel > Kuponlar — CRUD. Değerlendirme mantığı `pricing/coupons.ts`'te (saf,
// değişmedi); burası yalnız `Coupon` tablosunu okur/yazar.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { jsonArray } from '../catalog/mapping';
import { normalizeCouponCode } from '../pricing/coupons';
import { couponInputSchema, type CouponInput } from './schema';

export { couponInputSchema, type CouponInput };

export class CouponAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'CouponAdminError';
  }
}

export interface AdminCoupon {
  id: string;
  code: string;
  type: string;
  value: number;
  minCartTotalMinor: number | null;
  maxDiscountMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  includeProductIds: string[];
  excludeProductIds: string[];
  includeCategoryIds: string[];
  firstOrderOnly: boolean;
  isActive: boolean;
  stackable: boolean;
  createdAt: string;
}

function toView(row: {
  id: string; code: string; type: string; value: number; minCartTotalMinor: number | null; maxDiscountMinor: number | null;
  startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; usageLimitPerCustomer: number | null; usedCount: number;
  includeProductIds: unknown; excludeProductIds: unknown; includeCategoryIds: unknown;
  firstOrderOnly: boolean; isActive: boolean; stackable: boolean; createdAt: Date;
}): AdminCoupon {
  return {
    id: row.id, code: row.code, type: row.type, value: row.value,
    minCartTotalMinor: row.minCartTotalMinor, maxDiscountMinor: row.maxDiscountMinor,
    startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit, usageLimitPerCustomer: row.usageLimitPerCustomer, usedCount: row.usedCount,
    includeProductIds: jsonArray<string>(row.includeProductIds), excludeProductIds: jsonArray<string>(row.excludeProductIds),
    includeCategoryIds: jsonArray<string>(row.includeCategoryIds),
    firstOrderOnly: row.firstOrderOnly, isActive: row.isActive, stackable: row.stackable, createdAt: row.createdAt.toISOString(),
  };
}

export interface CouponListParams {
  q?: string;
  active?: 'aktif' | 'pasif';
  page?: number;
  pageSize?: number;
}

export async function listAdminCoupons(params: CouponListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));
  const where: Prisma.CouponWhereInput = { store: currentStore() };
  if (params.q) where.code = { contains: normalizeCouponCode(params.q) };
  if (params.active === 'aktif') where.isActive = true;
  if (params.active === 'pasif') where.isActive = false;

  const [total, rows] = await Promise.all([
    db.coupon.count({ where }),
    db.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: rows.map(toView), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminCoupon(id: string): Promise<AdminCoupon | null> {
  const row = await db.coupon.findFirst({ where: { id, store: currentStore() } });
  return row ? toView(row) : null;
}

function toData(input: CouponInput) {
  return {
    code: normalizeCouponCode(input.code),
    type: input.type,
    value: input.type === 'ücretsiz-kargo' ? 0 : input.value,
    minCartTotalMinor: input.minCartTotalMinor,
    maxDiscountMinor: input.maxDiscountMinor,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    usageLimit: input.usageLimit,
    usageLimitPerCustomer: input.usageLimitPerCustomer,
    includeProductIds: input.includeProductIds as unknown as Prisma.InputJsonValue,
    excludeProductIds: input.excludeProductIds as unknown as Prisma.InputJsonValue,
    includeCategoryIds: input.includeCategoryIds as unknown as Prisma.InputJsonValue,
    firstOrderOnly: input.firstOrderOnly,
    isActive: input.isActive,
    stackable: input.stackable,
  };
}

export async function createCoupon(raw: unknown, user: AdminUser, ip: string | null): Promise<AdminCoupon> {
  const input = couponInputSchema.parse(raw);
  const code = normalizeCouponCode(input.code);
  const existing = await db.coupon.findUnique({ where: { store_code: { store: currentStore(), code } } });
  if (existing) throw new CouponAdminError(`"${code}" koduyla bir kupon zaten var.`, 409);

  const row = await db.coupon.create({ data: { ...toData(input), store: currentStore() } });
  await auditChange({ user, action: 'olustur', entityType: 'Coupon', entityId: row.id, after: { code: row.code, type: row.type, value: row.value }, ip });
  return toView(row);
}

export async function updateCoupon(id: string, raw: unknown, user: AdminUser, ip: string | null): Promise<AdminCoupon> {
  const input = couponInputSchema.parse(raw);
  const current = await db.coupon.findFirst({ where: { id, store: currentStore() } });
  if (!current) throw new CouponAdminError('Kupon bulunamadı.', 404);

  const code = normalizeCouponCode(input.code);
  if (code !== current.code) {
    const clash = await db.coupon.findUnique({ where: { store_code: { store: current.store, code } } });
    if (clash) throw new CouponAdminError(`"${code}" koduyla bir kupon zaten var.`, 409);
  }

  const row = await db.coupon.update({ where: { id }, data: { ...toData(input), version: { increment: 1 } } });
  await auditChange({
    user, action: 'guncelle', entityType: 'Coupon', entityId: id,
    before: { code: current.code, isActive: current.isActive, value: current.value },
    after: { code: row.code, isActive: row.isActive, value: row.value },
    ip,
  });
  return toView(row);
}

export async function deleteCoupon(id: string, user: AdminUser, ip: string | null): Promise<void> {
  const current = await db.coupon.findFirst({ where: { id, store: currentStore() } });
  if (!current) throw new CouponAdminError('Kupon bulunamadı.', 404);
  if (current.usedCount > 0) {
    throw new CouponAdminError('Kullanılmış kupon silinemez; bunun yerine pasife alın (kullanım geçmişi korunur).', 409);
  }
  await db.coupon.delete({ where: { id } });
  await auditChange({ user, action: 'sil', entityType: 'Coupon', entityId: id, before: { code: current.code }, ip });
}
