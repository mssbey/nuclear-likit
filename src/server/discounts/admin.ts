// Panel > İndirimler — CRUD. Değerlendirme mantığı `pricing/discount-rules.ts`'te
// (saf); burası yalnız `DiscountRule` tablosunu okur/yazar.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { jsonArray } from '../catalog/mapping';
import type { DiscountRuleType } from '../pricing/discount-rules';
import { discountRuleInputSchema, type DiscountRuleInput } from './schema';
import { revalidateDiscountRules } from './campaigns';

export { discountRuleInputSchema, type DiscountRuleInput };

export class DiscountRuleAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'DiscountRuleAdminError';
  }
}

export interface AdminDiscountRule {
  id: string;
  name: string;
  type: DiscountRuleType;
  isActive: boolean;
  priority: number;
  stackable: boolean;
  includeCategoryIds: string[];
  includeProductIds: string[];
  percentBps: number;
  minCartTotalMinor: number | null;
  buyQuantity: number | null;
  payQuantity: number | null;
  minQuantity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

function toView(row: {
  id: string; name: string; type: string; isActive: boolean; priority: number; stackable: boolean;
  includeCategoryIds: unknown; includeProductIds: unknown;
  percentBps: number; minCartTotalMinor: number | null;
  buyQuantity: number | null; payQuantity: number | null; minQuantity: number | null;
  startsAt: Date | null; endsAt: Date | null; createdAt: Date;
}): AdminDiscountRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DiscountRuleType,
    isActive: row.isActive,
    priority: row.priority,
    stackable: row.stackable,
    includeCategoryIds: jsonArray<string>(row.includeCategoryIds),
    includeProductIds: jsonArray<string>(row.includeProductIds),
    percentBps: row.percentBps,
    minCartTotalMinor: row.minCartTotalMinor,
    buyQuantity: row.buyQuantity,
    payQuantity: row.payQuantity,
    minQuantity: row.minQuantity,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface DiscountRuleListParams {
  q?: string;
  type?: DiscountRuleType;
  active?: 'aktif' | 'pasif';
  page?: number;
  pageSize?: number;
}

export async function listAdminDiscountRules(params: DiscountRuleListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));
  const where: Prisma.DiscountRuleWhereInput = { store: currentStore() };
  if (params.q) where.name = { contains: params.q };
  if (params.type) where.type = params.type;
  if (params.active === 'aktif') where.isActive = true;
  if (params.active === 'pasif') where.isActive = false;

  const [total, rows] = await Promise.all([
    db.discountRule.count({ where }),
    db.discountRule.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: rows.map(toView),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminDiscountRule(id: string): Promise<AdminDiscountRule | null> {
  const row = await db.discountRule.findFirst({ where: { id, store: currentStore() } });
  return row ? toView(row) : null;
}

function toData(input: DiscountRuleInput) {
  const isPercent = input.type === 'sepet-yuzde';
  const isBogo = input.type === 'x-al-y-ode';
  return {
    name: input.name,
    type: input.type,
    isActive: input.isActive,
    priority: input.priority,
    stackable: input.stackable,
    includeCategoryIds: input.includeCategoryIds as unknown as Prisma.InputJsonValue,
    includeProductIds: input.includeProductIds as unknown as Prisma.InputJsonValue,
    percentBps: isPercent ? input.percentBps : 0,
    minCartTotalMinor: isPercent ? input.minCartTotalMinor : null,
    buyQuantity: isBogo ? input.buyQuantity : null,
    payQuantity: isBogo ? input.payQuantity : null,
    minQuantity: isBogo ? input.minQuantity : null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  };
}

export async function createDiscountRule(
  raw: unknown,
  user: AdminUser,
  ip: string | null,
): Promise<AdminDiscountRule> {
  const input = discountRuleInputSchema.parse(raw);
  const row = await db.discountRule.create({ data: { ...toData(input), store: currentStore() } });
  revalidateDiscountRules();
  await auditChange({
    user,
    action: 'olustur',
    entityType: 'DiscountRule',
    entityId: row.id,
    after: { name: row.name, type: row.type, isActive: row.isActive },
    ip,
  });
  return toView(row);
}

export async function updateDiscountRule(
  id: string,
  raw: unknown,
  user: AdminUser,
  ip: string | null,
): Promise<AdminDiscountRule> {
  const input = discountRuleInputSchema.parse(raw);
  const current = await db.discountRule.findFirst({ where: { id, store: currentStore() } });
  if (!current) throw new DiscountRuleAdminError('İndirim kuralı bulunamadı.', 404);

  const row = await db.discountRule.update({
    where: { id },
    data: { ...toData(input), version: { increment: 1 } },
  });
  revalidateDiscountRules();
  await auditChange({
    user,
    action: 'guncelle',
    entityType: 'DiscountRule',
    entityId: id,
    before: { name: current.name, type: current.type, isActive: current.isActive },
    after: { name: row.name, type: row.type, isActive: row.isActive },
    ip,
  });
  return toView(row);
}

export async function deleteDiscountRule(
  id: string,
  user: AdminUser,
  ip: string | null,
): Promise<void> {
  const current = await db.discountRule.findFirst({ where: { id, store: currentStore() } });
  if (!current) throw new DiscountRuleAdminError('İndirim kuralı bulunamadı.', 404);
  await db.discountRule.delete({ where: { id } });
  revalidateDiscountRules();
  await auditChange({
    user,
    action: 'sil',
    entityType: 'DiscountRule',
    entityId: id,
    before: { name: current.name, type: current.type },
    ip,
  });
}
