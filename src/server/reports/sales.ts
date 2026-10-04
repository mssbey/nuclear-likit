// Panel > Raporlar — satış özeti, zaman serisi, en çok satan ürünler,
// kategori kırılımı, ödeme yöntemi dağılımı, iade oranı/sebep kırılımı.
//
// Ciro, `REVENUE_STATUSES`teki (ödemesi alınmış/teslim edilmiş) siparişlerin
// `placedAt` tarihine göre hesaplanır — iade tarihine göre DEĞİL, basitlik ve
// tutarlılık için (`customers/admin.ts`teki müşteri harcaması ile aynı tanım).
// Kategori kırılımında bir ürün birden fazla kategoriye aitse tutarı HER
// kategoriye tam yazılır (toplamı aşabilir) — bu bilinçli bir yaklaşımdır,
// arayüzde belirtilir.

import 'server-only';
import { db } from '../db';
import { currentStore } from '../store-context';
import { REVENUE_STATUSES } from '../orders/state-machine';
import { returnReasonLabels, type ReturnReason } from '../returns/schema';
import { paymentMethodLabel } from '@/lib/payment-labels';

export interface ReportRange {
  from: string;
  to: string;
}

export interface SalesSummary {
  revenueMinor: number;
  netRevenueMinor: number;
  refundedMinor: number;
  orderCount: number;
  avgOrderValueMinor: number;
  returnRequestCount: number;
  /** 0-1 arası oran; arayüz yüzdeye çevirir. */
  returnRate: number;
}

export interface SalesPoint {
  /** YYYY-MM-DD, Europe/Istanbul. */
  date: string;
  revenueMinor: number;
  orderCount: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  slug: string;
  quantity: number;
  revenueMinor: number;
}

export interface CategoryBreakdownRow {
  categoryId: string;
  name: string;
  revenueMinor: number;
}

export interface PaymentMethodRow {
  method: string;
  label: string;
  count: number;
  revenueMinor: number;
}

export interface ReturnReasonRow {
  reason: string;
  reasonLabel: string;
  count: number;
}

export interface ReportsOverview {
  range: ReportRange;
  summary: SalesSummary;
  series: SalesPoint[];
  topProducts: TopProductRow[];
  categories: CategoryBreakdownRow[];
  paymentMethods: PaymentMethodRow[];
  returnReasons: ReturnReasonRow[];
}

const dayFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }); // YYYY-MM-DD

export async function getReportsOverview(range: { from: Date; to: Date }): Promise<ReportsOverview> {
  const store = currentStore();
  const where = { store, placedAt: { gte: range.from, lte: range.to }, status: { in: [...REVENUE_STATUSES] } };
  const orders = await db.order.findMany({
    where,
    select: { id: true, placedAt: true, grandTotalMinor: true, refundedTotalMinor: true, paymentMethod: true },
  });

  const revenueMinor = orders.reduce((s, o) => s + o.grandTotalMinor, 0);
  const refundedMinor = orders.reduce((s, o) => s + o.refundedTotalMinor, 0);
  const orderCount = orders.length;

  const returnRequestCount = await db.returnRequest.count({ where: { order: { store }, requestedAt: { gte: range.from, lte: range.to } } });

  const byDay = new Map<string, { revenueMinor: number; orderCount: number }>();
  const byMethod = new Map<string, { count: number; revenueMinor: number }>();
  for (const o of orders) {
    const day = dayFormatter.format(o.placedAt);
    const d = byDay.get(day) ?? { revenueMinor: 0, orderCount: 0 };
    d.revenueMinor += o.grandTotalMinor;
    d.orderCount += 1;
    byDay.set(day, d);

    const m = byMethod.get(o.paymentMethod) ?? { count: 0, revenueMinor: 0 };
    m.count += 1;
    m.revenueMinor += o.grandTotalMinor;
    byMethod.set(o.paymentMethod, m);
  }
  const series = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
  const paymentMethods = [...byMethod.entries()]
    .map(([method, v]) => ({ method, label: paymentMethodLabel(method), ...v }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor);

  const orderIds = orders.map((o) => o.id);
  const itemAgg = orderIds.length
    ? await db.orderItem.groupBy({
        by: ['productId'],
        where: { orderId: { in: orderIds }, productId: { not: null } },
        _sum: { quantity: true, lineTotalMinor: true },
      })
    : [];

  const productIds = itemAgg.map((a) => a.productId).filter((id): id is string => Boolean(id));
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, slug: true, categories: { select: { categoryId: true } } } })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const topProducts = [...itemAgg]
    .sort((a, b) => (b._sum.lineTotalMinor ?? 0) - (a._sum.lineTotalMinor ?? 0))
    .slice(0, 10)
    .map((a) => {
      const p = productById.get(a.productId!);
      return { productId: a.productId!, name: p?.name ?? '—', slug: p?.slug ?? '', quantity: a._sum.quantity ?? 0, revenueMinor: a._sum.lineTotalMinor ?? 0 };
    });

  const catRevenue = new Map<string, number>();
  for (const a of itemAgg) {
    const p = productById.get(a.productId!);
    for (const c of p?.categories ?? []) {
      catRevenue.set(c.categoryId, (catRevenue.get(c.categoryId) ?? 0) + (a._sum.lineTotalMinor ?? 0));
    }
  }
  const catIds = [...catRevenue.keys()];
  const catRows = catIds.length ? await db.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
  const categories = catRows
    .map((c) => ({ categoryId: c.id, name: c.name, revenueMinor: catRevenue.get(c.id) ?? 0 }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor);

  const reasonAgg = await db.returnRequest.groupBy({ by: ['reason'], where: { order: { store }, requestedAt: { gte: range.from, lte: range.to } }, _count: { _all: true } });
  const returnReasons = reasonAgg
    .map((r) => ({ reason: r.reason, reasonLabel: returnReasonLabels[r.reason as ReturnReason] ?? r.reason, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    summary: {
      revenueMinor,
      netRevenueMinor: revenueMinor - refundedMinor,
      refundedMinor,
      orderCount,
      avgOrderValueMinor: orderCount ? Math.round(revenueMinor / orderCount) : 0,
      returnRequestCount,
      returnRate: orderCount ? returnRequestCount / orderCount : 0,
    },
    series,
    topProducts,
    categories,
    paymentMethods,
    returnReasons,
  };
}

/** Günlük seri CSV dışa aktarımı — Excel (TR) için `;` ayraç ve BOM. */
export function salesSeriesToCsv(series: SalesPoint[]): string {
  const esc = (v: string | number) => String(v);
  const header = ['tarih', 'siparis_sayisi', 'ciro_tl'];
  const lines = series.map((p) => [p.date, p.orderCount, (p.revenueMinor / 100).toFixed(2).replace('.', ',')].map(esc).join(';'));
  return '﻿' + [header.join(';'), ...lines].join('\r\n') + '\r\n';
}
