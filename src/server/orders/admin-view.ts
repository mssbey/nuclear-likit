// Panel sipariş görünümü ve filtreli liste.
//
// Müşteri görünümünden (view.ts) farkı: admin notu, IP/user-agent, ödeme
// kayıtları (hassas alanlar maskeli), iadeler, TÜM olaylar, e-posta günlüğü ve
// müşteri özeti (sipariş sayısı, toplam harcama) burada vardır.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { ORDER_STATUSES, orderStatusLabels, type OrderStatus } from './state-machine';
import { paymentMethodLabel } from '@/lib/payment-labels';
import { ORDER_TABS, type OrderTab } from './order-tabs';
import type { AddressSnapshot } from '../customers/address-schema';

// ------------------------------------------------------------- maskeleme ---

const SENSITIVE_KEY = /pan|card_?number|cardnumber|cvv|cvc|expire|expiry|identity|tckn|password|secret|token/i;

/** Ham sağlayıcı yanıtındaki hassas anahtarları maskeler (derin). */
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '***' : maskSensitive(v);
    }
    return out;
  }
  return value;
}

// ------------------------------------------------------------- detay -------

export const adminOrderInclude = {
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true, name: true } } } },
  shipments: { orderBy: { createdAt: 'desc' } },
  events: { orderBy: { createdAt: 'asc' }, include: { user: { select: { email: true, name: true } } } },
  emails: { orderBy: { createdAt: 'desc' } },
  customer: true,
} satisfies Prisma.OrderInclude;

type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof adminOrderInclude }>;

export interface TimelineEntry {
  at: string;
  kind: 'durum' | 'not' | 'odeme' | 'iade' | 'kargo' | 'eposta' | 'sistem';
  title: string;
  detail: string;
  actor: string;
  visibleToCustomer: boolean;
}

export interface AdminOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  source: string;
  placedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  version: number;
  totals: {
    itemsSubtotalMinor: number;
    discountTotalMinor: number;
    shippingTotalMinor: number;
    surchargeMinor: number;
    taxTotalMinor: number;
    grandTotalMinor: number;
    refundedTotalMinor: number;
    taxBreakdown: { rateBps: number; netMinor: number; taxMinor: number }[];
  };
  couponCode: string | null;
  shippingMethod: { id?: string; name: string; carrier: string | null; priceMinor: number; estimatedDays: string; type?: string } | null;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  customerNote: string | null;
  adminNote: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  consents: unknown;
  customer: {
    id: string | null;
    email: string;
    name: string;
    phone: string | null;
    isGuest: boolean;
    orderCount: number;
    totalSpentMinor: number;
    tags: string[];
  };
  items: {
    id: string;
    productId: string | null;
    variantId: string | null;
    name: string;
    variantLabel: string;
    sku: string;
    imageUrl: string;
    unitPriceMinor: number;
    quantity: number;
    discountMinor: number;
    taxRateBps: number;
    taxMinor: number;
    lineTotalMinor: number;
    refundedQuantity: number;
    shippedQuantity: number;
  }[];
  payments: {
    id: string;
    provider: string;
    providerPaymentId: string | null;
    status: string;
    amountMinor: number;
    installment: number;
    cardBrand: string | null;
    cardLast4: string | null;
    threeDS: boolean;
    errorMessage: string | null;
    createdAt: string;
    capturedAt: string | null;
    rawResponse: unknown;
  }[];
  refunds: {
    id: string;
    amountMinor: number;
    reason: string;
    type: string;
    status: string;
    items: { orderItemId: string; quantity: number; amountMinor: number }[];
    createdAt: string;
    by: string;
  }[];
  shipments: {
    id: string;
    carrier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    items: { orderItemId: string; quantity: number }[];
    shippedAt: string | null;
    deliveredAt: string | null;
    createdAt: string;
  }[];
  timeline: TimelineEntry[];
  /** Kalan iade edilebilir tutar. */
  refundableMinor: number;
  /** Durum makinesine göre şu an mümkün geçişler. */
  allowedTransitions: OrderStatus[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function getAdminOrder(id: string): Promise<AdminOrderView | null> {
  const row = await db.order.findFirst({
    where: { store: currentStore(), OR: [{ id }, { orderNumber: id.toUpperCase() }] },
    include: adminOrderInclude,
  });
  if (!row) return null;

  const [orderCount, spent] = row.customerId
    ? await Promise.all([
        db.order.count({ where: { customerId: row.customerId, status: { notIn: ['taslak', 'iptal', 'başarısız'] } } }),
        db.order.aggregate({
          where: { customerId: row.customerId, status: { notIn: ['taslak', 'iptal', 'başarısız'] } },
          _sum: { grandTotalMinor: true, refundedTotalMinor: true },
        }),
      ])
    : [0, { _sum: { grandTotalMinor: 0, refundedTotalMinor: 0 } }];

  return toAdminView(row, {
    orderCount,
    totalSpentMinor: (spent._sum.grandTotalMinor ?? 0) - (spent._sum.refundedTotalMinor ?? 0),
  });
}

function toAdminView(
  o: AdminOrderRow,
  stats: { orderCount: number; totalSpentMinor: number },
): AdminOrderView {
  const shippedByItem = new Map<string, number>();
  for (const s of o.shipments) {
    if (s.status === 'iade-yolda' || s.status === 'kayıp') continue;
    for (const it of (s.items as { orderItemId: string; quantity: number }[]) ?? []) {
      shippedByItem.set(it.orderItemId, (shippedByItem.get(it.orderItemId) ?? 0) + it.quantity);
    }
  }

  const actorOf = (u: { email: string; name: string } | null | undefined, fallback: string) =>
    u ? u.name || u.email : fallback;

  const timeline: TimelineEntry[] = [
    ...o.events.map((e) => ({
      at: e.createdAt.toISOString(),
      kind: (e.kind === 'durum-degisti' ? 'durum' : e.kind === 'not' ? 'not' : 'sistem') as TimelineEntry['kind'],
      title:
        e.kind === 'durum-degisti'
          ? `${orderStatusLabels[e.fromStatus as OrderStatus] ?? e.fromStatus ?? '—'} → ${orderStatusLabels[e.toStatus as OrderStatus] ?? e.toStatus}`
          : e.kind === 'not'
            ? 'Not'
            : e.kind,
      detail: e.message,
      actor: actorOf(e.user, e.userId ? 'panel' : 'sistem'),
      visibleToCustomer: e.visibleToCustomer,
    })),
    ...o.payments.map((p) => ({
      at: (p.capturedAt ?? p.failedAt ?? p.createdAt).toISOString(),
      kind: 'odeme' as const,
      title: `Ödeme · ${paymentMethodLabel(p.provider)} · ${p.status}`,
      detail: `${(p.amountMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}${p.cardLast4 ? ` · ${p.cardBrand ?? ''} •••• ${p.cardLast4}` : ''}${p.errorMessage ? ` · ${p.errorMessage}` : ''}`,
      actor: 'ödeme',
      visibleToCustomer: false,
    })),
    ...o.refunds.map((r) => ({
      at: r.createdAt.toISOString(),
      kind: 'iade' as const,
      title: `İade · ${r.type} · ${r.status}`,
      detail: `${(r.amountMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}${r.reason ? ` · ${r.reason}` : ''}`,
      actor: actorOf(r.user, 'panel'),
      visibleToCustomer: false,
    })),
    ...o.shipments.map((s) => ({
      at: (s.shippedAt ?? s.createdAt).toISOString(),
      kind: 'kargo' as const,
      title: `Kargo · ${s.carrier} · ${s.status}`,
      detail: s.trackingNumber ? `Takip: ${s.trackingNumber}` : 'Takip numarası yok',
      actor: 'kargo',
      visibleToCustomer: true,
    })),
    ...o.emails.map((m) => ({
      at: (m.sentAt ?? m.createdAt).toISOString(),
      kind: 'eposta' as const,
      title: `E-posta · ${m.template} · ${m.status}`,
      detail: `${m.to} — ${m.subject}`,
      actor: 'sistem',
      visibleToCustomer: false,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const status = o.status as OrderStatus;
  const paid = o.payments.filter((p) => p.status === 'başarılı').reduce((s, p) => s + p.amountMinor, 0);
  const refundable = Math.max(0, Math.min(o.grandTotalMinor, paid || o.grandTotalMinor) - o.refundedTotalMinor);

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status,
    statusLabel: orderStatusLabels[status] ?? o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    paymentMethod: o.paymentMethod,
    paymentMethodLabel: paymentMethodLabel(o.paymentMethod),
    source: o.source,
    placedAt: o.placedAt.toISOString(),
    paidAt: iso(o.paidAt),
    cancelledAt: iso(o.cancelledAt),
    completedAt: iso(o.completedAt),
    version: o.version,
    totals: {
      itemsSubtotalMinor: o.itemsSubtotalMinor,
      discountTotalMinor: o.discountTotalMinor,
      shippingTotalMinor: o.shippingTotalMinor,
      surchargeMinor: o.surchargeMinor,
      taxTotalMinor: o.taxTotalMinor,
      grandTotalMinor: o.grandTotalMinor,
      refundedTotalMinor: o.refundedTotalMinor,
      taxBreakdown: (o.taxBreakdown as AdminOrderView['totals']['taxBreakdown']) ?? [],
    },
    couponCode: o.couponCode,
    shippingMethod: (o.shippingMethod as AdminOrderView['shippingMethod']) ?? null,
    shippingAddress: (o.shippingAddress ?? {}) as AddressSnapshot,
    billingAddress: (o.billingAddress ?? {}) as AddressSnapshot,
    customerNote: o.customerNote,
    adminNote: o.adminNote,
    ipAddress: o.ipAddress,
    userAgent: o.userAgent,
    consents: o.consents,
    customer: {
      id: o.customer?.id ?? null,
      email: o.customer?.email ?? o.guestEmail ?? '',
      name: o.customer ? `${o.customer.firstName} ${o.customer.lastName}`.trim() : '',
      phone: o.customer?.phone ?? null,
      isGuest: o.customer?.isGuest ?? true,
      orderCount: stats.orderCount,
      totalSpentMinor: stats.totalSpentMinor,
      tags: Array.isArray(o.customer?.tags) ? (o.customer!.tags as string[]) : [],
    },
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      variantLabel: i.variantLabel,
      sku: i.sku,
      imageUrl: i.imageUrl,
      unitPriceMinor: i.unitPriceMinor,
      quantity: i.quantity,
      discountMinor: i.discountMinor,
      taxRateBps: i.taxRateBps,
      taxMinor: i.taxMinor,
      lineTotalMinor: i.lineTotalMinor,
      refundedQuantity: i.refundedQuantity,
      shippedQuantity: shippedByItem.get(i.id) ?? 0,
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      providerPaymentId: p.providerPaymentId,
      status: p.status,
      amountMinor: p.amountMinor,
      installment: p.installment,
      cardBrand: p.cardBrand,
      cardLast4: p.cardLast4,
      threeDS: p.threeDS,
      errorMessage: p.errorMessage,
      createdAt: p.createdAt.toISOString(),
      capturedAt: iso(p.capturedAt),
      rawResponse: maskSensitive(p.rawResponse),
    })),
    refunds: o.refunds.map((r) => ({
      id: r.id,
      amountMinor: r.amountMinor,
      reason: r.reason,
      type: r.type,
      status: r.status,
      items: (r.items as { orderItemId: string; quantity: number; amountMinor: number }[]) ?? [],
      createdAt: r.createdAt.toISOString(),
      by: actorOf(r.user, 'panel'),
    })),
    shipments: o.shipments.map((s) => ({
      id: s.id,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      trackingUrl: s.trackingUrl,
      status: s.status,
      items: (s.items as { orderItemId: string; quantity: number }[]) ?? [],
      shippedAt: iso(s.shippedAt),
      deliveredAt: iso(s.deliveredAt),
      createdAt: s.createdAt.toISOString(),
    })),
    timeline,
    refundableMinor: refundable,
    allowedTransitions: [...allowedFor(status)],
  };
}

// state-machine'den yeniden dışa aktarım (döngüsel import olmasın diye lokal)
import { allowedTransitions as allowedFor } from './state-machine';

// ------------------------------------------------------------- liste -------

export { ORDER_TABS } from './order-tabs';
export type { OrderTab } from './order-tabs';

export const orderListQuerySchema = z.object({
  tab: z.enum(Object.keys(ORDER_TABS) as [OrderTab, ...OrderTab[]]).default('tumu'),
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minMinor: z.coerce.number().int().min(0).optional(),
  maxMinor: z.coerce.number().int().min(0).optional(),
  paymentMethod: z.string().max(20).optional(),
  carrier: z.string().max(40).optional(),
  source: z.string().max(20).optional(),
  sort: z.enum(['placedAt', 'grandTotalMinor', 'orderNumber', 'status']).default('placedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(25),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export interface OrderListItem {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  source: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  grandTotalMinor: number;
  refundedTotalMinor: number;
  carrier: string | null;
  trackingNumber: string | null;
}

export interface OrderListResult {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Sekme sayaçları — filtrelerden bağımsız. */
  tabCounts: Record<OrderTab, number>;
}

export async function listAdminOrders(q: OrderListQuery): Promise<OrderListResult> {
  const where: Prisma.OrderWhereInput = { store: currentStore(), status: { not: 'taslak' } };

  const tabStatuses = ORDER_TABS[q.tab].statuses;
  if (q.status) where.status = q.status;
  else if (tabStatuses) where.status = { in: [...tabStatuses] };

  if (q.from || q.to) {
    where.placedAt = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {}),
    };
  }
  if (q.minMinor != null || q.maxMinor != null) {
    where.grandTotalMinor = {
      ...(q.minMinor != null ? { gte: q.minMinor } : {}),
      ...(q.maxMinor != null ? { lte: q.maxMinor } : {}),
    };
  }
  if (q.paymentMethod) where.paymentMethod = q.paymentMethod;
  if (q.source) where.source = q.source;
  if (q.carrier) where.shipments = { some: { carrier: q.carrier } };

  if (q.q) {
    const term = q.q;
    where.OR = [
      { orderNumber: { contains: term.toUpperCase() } },
      { guestEmail: { contains: term.toLocaleLowerCase('tr') } },
      { customer: { email: { contains: term.toLocaleLowerCase('tr') } } },
      { customer: { firstName: { contains: term } } },
      { customer: { lastName: { contains: term } } },
      { customer: { phone: { contains: term.replace(/\D/g, '') || term } } },
      { items: { some: { name: { contains: term } } } },
      { items: { some: { sku: { contains: term } } } },
      { shipments: { some: { trackingNumber: { contains: term } } } },
    ];
  }

  const [total, rows, ...counts] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { [q.sort]: q.dir },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        items: { select: { quantity: true } },
        shipments: { orderBy: { createdAt: 'desc' }, take: 1, select: { carrier: true, trackingNumber: true } },
      },
    }),
    ...(Object.keys(ORDER_TABS) as OrderTab[]).map((tab) => {
      const st = ORDER_TABS[tab].statuses;
      const store = currentStore();
      return db.order.count({ where: st ? { store, status: { in: [...st] } } : { store, status: { not: 'taslak' } } });
    }),
  ]);

  const tabCounts = Object.fromEntries(
    (Object.keys(ORDER_TABS) as OrderTab[]).map((tab, i) => [tab, counts[i] as number]),
  ) as Record<OrderTab, number>;

  return {
    items: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      placedAt: o.placedAt.toISOString(),
      status: o.status as OrderStatus,
      statusLabel: orderStatusLabels[o.status as OrderStatus] ?? o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      paymentMethod: o.paymentMethod,
      paymentMethodLabel: paymentMethodLabel(o.paymentMethod),
      source: o.source,
      customerName: o.customer ? `${o.customer.firstName} ${o.customer.lastName}`.trim() : '',
      customerEmail: o.customer?.email ?? o.guestEmail ?? '',
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      grandTotalMinor: o.grandTotalMinor,
      refundedTotalMinor: o.refundedTotalMinor,
      carrier: o.shipments[0]?.carrier ?? null,
      trackingNumber: o.shipments[0]?.trackingNumber ?? null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    tabCounts,
  };
}

/** CSV dışa aktarım — filtrelerle aynı `where`, sayfalama yok (üst sınır 5000). */
export async function exportOrdersCsv(q: OrderListQuery): Promise<string> {
  const all = await listAdminOrders({ ...q, page: 1, pageSize: 200 });
  const rows: OrderListItem[] = [...all.items];
  for (let p = 2; p <= Math.min(all.pageCount, 25); p += 1) {
    rows.push(...(await listAdminOrders({ ...q, page: p, pageSize: 200 })).items);
  }
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['siparis_no', 'tarih', 'durum', 'odeme_durumu', 'odeme_yontemi', 'musteri', 'eposta', 'kalem', 'toplam_tl', 'iade_tl', 'kargo', 'takip_no', 'kaynak'];
  const lines = rows.map((o) =>
    [
      o.orderNumber,
      o.placedAt,
      o.statusLabel,
      o.paymentStatus,
      o.paymentMethodLabel,
      o.customerName,
      o.customerEmail,
      o.itemCount,
      (o.grandTotalMinor / 100).toFixed(2).replace('.', ','),
      (o.refundedTotalMinor / 100).toFixed(2).replace('.', ','),
      o.carrier,
      o.trackingNumber,
      o.source,
    ]
      .map(esc)
      .join(';'),
  );
  // Excel (TR) için ; ayraç ve BOM.
  return '﻿' + [header.join(';'), ...lines].join('\r\n') + '\r\n';
}
