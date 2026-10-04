// Panel > Kargolar — siparişten bağımsız, tüm sevkiyatların listesi.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { carrierLabels, type Carrier } from './carriers';
import { SHIPMENT_TABS, type ShipmentTab } from './shipment-tabs';

export interface AdminShipmentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  carrier: string;
  carrierLabel: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  itemCount: number;
  weightGrams: number | null;
  desi: number | null;
  costMinor: number | null;
  customerName: string;
  customerCity: string;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface ShipmentListParams {
  tab?: ShipmentTab;
  status?: string;
  carrier?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ShipmentListResult {
  items: AdminShipmentRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: Record<ShipmentTab, number>;
}

const shipmentRowInclude = {
  order: {
    select: {
      orderNumber: true,
      status: true,
      shippingAddress: true,
      guestEmail: true,
      customer: { select: { firstName: true, lastName: true, email: true } },
    },
  },
} satisfies Prisma.ShipmentInclude;

type ShipmentRow = Prisma.ShipmentGetPayload<{ include: typeof shipmentRowInclude }>;

function toRow(s: ShipmentRow): AdminShipmentRow {
  const addr = s.order.shippingAddress as { city?: string } | null;
  const items = (s.items as { orderItemId: string; quantity: number }[]) ?? [];
  return {
    id: s.id,
    orderId: s.orderId,
    orderNumber: s.order.orderNumber,
    orderStatus: s.order.status,
    carrier: s.carrier,
    carrierLabel: carrierLabels[s.carrier as Carrier] ?? s.carrier,
    trackingNumber: s.trackingNumber,
    trackingUrl: s.trackingUrl,
    status: s.status,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    weightGrams: s.weightGrams,
    desi: s.desi,
    costMinor: s.costMinor,
    customerName: [s.order.customer?.firstName, s.order.customer?.lastName].filter(Boolean).join(' ') || s.order.customer?.email || s.order.guestEmail || '—',
    customerCity: addr?.city ?? '',
    createdAt: s.createdAt.toISOString(),
    shippedAt: s.shippedAt?.toISOString() ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
  };
}

export async function listAdminShipments(params: ShipmentListParams): Promise<ShipmentListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));

  const where: Prisma.ShipmentWhereInput = { order: { store: currentStore() } };
  const tab = params.tab ?? 'tumu';
  const tabStatuses = SHIPMENT_TABS[tab]?.statuses;
  if (tabStatuses) where.status = { in: [...tabStatuses] };
  if (params.status) where.status = params.status;
  if (params.carrier) where.carrier = params.carrier;
  if (params.from || params.to) {
    where.createdAt = { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) };
  }
  if (params.q) {
    const q = params.q.trim();
    where.OR = [
      { trackingNumber: { contains: q } },
      { order: { orderNumber: { contains: q.toUpperCase() } } },
      { order: { customer: { email: { contains: q.toLowerCase() } } } },
      { order: { guestEmail: { contains: q.toLowerCase() } } },
    ];
  }

  const [total, rows, countRows] = await Promise.all([
    db.shipment.count({ where }),
    db.shipment.findMany({
      where,
      include: shipmentRowInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.shipment.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const byStatus = new Map(countRows.map((r) => [r.status, r._count._all]));
  const counts = Object.fromEntries(
    (Object.keys(SHIPMENT_TABS) as ShipmentTab[]).map((t) => {
      const statuses = SHIPMENT_TABS[t].statuses;
      const count = statuses ? statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0) : countRows.reduce((sum, r) => sum + r._count._all, 0);
      return [t, count];
    }),
  ) as Record<ShipmentTab, number>;

  return {
    items: rows.map(toRow),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}
