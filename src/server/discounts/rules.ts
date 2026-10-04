// Fiyatlama için indirim kurallarını okur. `resolveCoupon`'un eşdeğeri ama
// parametresiz: checkout tekliflerinde aktif tüm kurallar değerlendirilir.
// Tarih penceresi filtresi saf motorda (`pricing/discount-rules.ts`) yapılır.

import 'server-only';
import { db } from '../db';
import { currentStore } from '../store-context';
import { jsonArray } from '../catalog/mapping';
import type { DiscountRule } from '../pricing/discount-rules';

export async function loadActiveDiscountRules(): Promise<DiscountRule[]> {
  const rows = await db.discountRule.findMany({
    where: { store: currentStore(), isActive: true },
    orderBy: { priority: 'asc' },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as DiscountRule['type'],
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
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  }));
}
