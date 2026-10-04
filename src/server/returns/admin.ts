// Panel > İadeler — talep listesi, onay/red, ürün alındı, tamamlama (iade işler).

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { transitionOrder } from '../orders/transitions';
import { createRefund } from '../orders/refunds';
import { orderEmailVars, queueEmail } from '../notifications/email';
import { returnReasonLabels, type ReturnReason, type ReturnStatus } from './schema';
import { priorStatusOf, ReturnError } from './requests';

export { ReturnError };

const returnRowInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      guestEmail: true,
      customer: { select: { firstName: true, lastName: true, email: true } },
    },
  },
} satisfies Prisma.ReturnRequestInclude;

type ReturnRow = Prisma.ReturnRequestGetPayload<{ include: typeof returnRowInclude }>;

export interface AdminReturnRow {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  status: ReturnStatus;
  reason: string;
  reasonLabel: string;
  description: string;
  itemCount: number;
  customerName: string;
  requestedAt: string;
  resolvedAt: string | null;
}

function toRow(r: ReturnRow): AdminReturnRow {
  const items = (r.items as { orderItemId: string; quantity: number }[]) ?? [];
  return {
    id: r.id,
    orderId: r.order.id,
    orderNumber: r.order.orderNumber,
    orderStatus: r.order.status,
    status: r.status as ReturnStatus,
    reason: r.reason,
    reasonLabel: returnReasonLabels[r.reason as ReturnReason] ?? r.reason,
    description: r.description,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    customerName: [r.order.customer?.firstName, r.order.customer?.lastName].filter(Boolean).join(' ') || r.order.customer?.email || r.order.guestEmail || '—',
    requestedAt: r.requestedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

export interface ReturnListParams {
  status?: ReturnStatus | 'tumu';
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminReturns(params: ReturnListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));
  const where: Prisma.ReturnRequestWhereInput = { order: { store: currentStore() } };
  if (params.status && params.status !== 'tumu') where.status = params.status;
  if (params.q) {
    const q = params.q.trim();
    where.order = { OR: [{ orderNumber: { contains: q.toUpperCase() } }, { customer: { email: { contains: q.toLowerCase() } } }, { guestEmail: { contains: q.toLowerCase() } }] };
  }

  const [total, rows, statusCounts] = await Promise.all([
    db.returnRequest.count({ where }),
    db.returnRequest.findMany({ where, include: returnRowInclude, orderBy: { requestedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.returnRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return {
    items: rows.map(toRow),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Record<string, number>,
  };
}

export interface AdminReturnDetail extends AdminReturnRow {
  items: { orderItemId: string; quantity: number; name: string; sku: string }[];
  returnCode: string | null;
  resolutionNote: string | null;
}

export async function getAdminReturn(id: string): Promise<AdminReturnDetail | null> {
  const row = await db.returnRequest.findUnique({
    where: { id },
    include: { ...returnRowInclude, order: { include: { items: true, customer: true } } },
  });
  if (!row) return null;
  const requested = (row.items as { orderItemId: string; quantity: number }[]) ?? [];
  const orderItems = row.order.items;
  return {
    ...toRow(row as unknown as ReturnRow),
    items: requested.map((i) => {
      const oi = orderItems.find((x) => x.id === i.orderItemId);
      return { orderItemId: i.orderItemId, quantity: i.quantity, name: oi?.name ?? '—', sku: oi?.sku ?? '' };
    }),
    returnCode: row.returnCode,
    resolutionNote: row.resolutionNote,
  };
}

async function loadOpen(id: string) {
  const row = await db.returnRequest.findUnique({ where: { id }, include: { order: { include: { customer: true } } } });
  if (!row) throw new ReturnError('İade talebi bulunamadı.', 404);
  return row;
}

export async function approveReturn(id: string, note: string, returnCode: string | undefined, user: AdminUser, ip: string | null) {
  const row = await loadOpen(id);
  if (row.status !== 'talep') throw new ReturnError('Yalnız yeni talepler onaylanabilir.', 409);

  const updated = await db.returnRequest.update({
    where: { id },
    data: { status: 'onaylandı', resolutionNote: note || null, returnCode: returnCode || null },
  });

  const to = row.order.customer?.email ?? row.order.guestEmail;
  if (to) {
    await queueEmail({
      to,
      template: 'iade-talebi-onaylandi',
      vars: { ...orderEmailVars(row.order), iadeTalimati: note || 'Ürünü orijinal ambalajıyla bize gönderin.' },
      orderId: row.order.id,
    });
  }

  await auditChange({ user, action: 'guncelle', entityType: 'ReturnRequest', entityId: id, before: { status: row.status }, after: { status: 'onaylandı' }, ip });
  return updated;
}

export async function rejectReturn(id: string, note: string, user: AdminUser, ip: string | null) {
  const row = await loadOpen(id);
  if (row.status !== 'talep' && row.status !== 'onaylandı') throw new ReturnError('Bu talep artık reddedilemez.', 409);

  const updated = await db.returnRequest.update({
    where: { id },
    data: { status: 'reddedildi', resolutionNote: note, resolvedAt: new Date() },
  });

  const prior = priorStatusOf(row.order);
  if (row.order.status === 'iade-talebi') {
    await transitionOrder(row.order.id, prior, { userId: user.id }, { note: `İade talebi reddedildi: ${note}`, visibleToCustomer: true, skipEmail: true });
  }

  const to = row.order.customer?.email ?? row.order.guestEmail;
  if (to) {
    await queueEmail({ to, template: 'iade-talebi-reddedildi', vars: { ...orderEmailVars(row.order), redSebebi: note }, orderId: row.order.id });
  }

  await auditChange({ user, action: 'guncelle', entityType: 'ReturnRequest', entityId: id, before: { status: row.status }, after: { status: 'reddedildi', note }, ip });
  return updated;
}

export async function markGoodsReceived(id: string, user: AdminUser, ip: string | null) {
  const row = await loadOpen(id);
  if (row.status !== 'onaylandı') throw new ReturnError('Yalnız onaylanmış talepte ürün alındı işaretlenebilir.', 409);

  const updated = await db.returnRequest.update({ where: { id }, data: { status: 'ürün-alındı' } });
  await auditChange({ user, action: 'guncelle', entityType: 'ReturnRequest', entityId: id, before: { status: row.status }, after: { status: 'ürün-alındı' }, ip });
  return updated;
}

export async function completeReturn(
  id: string,
  input: { restock: boolean; includeShipping: boolean; amountMinor?: number },
  user: AdminUser,
  ip: string | null,
) {
  const row = await loadOpen(id);
  if (row.status !== 'ürün-alındı') throw new ReturnError('İadeyi tamamlamak için önce ürünün alındığını işaretleyin.', 409);

  const requested = (row.items as { orderItemId: string; quantity: number }[]) ?? [];
  const refund = await createRefund(
    row.order.id,
    {
      items: requested,
      amountMinor: input.amountMinor,
      reason: `İade talebi (${returnReasonLabels[row.reason as ReturnReason] ?? row.reason})`,
      restock: input.restock,
      includeShipping: input.includeShipping,
    },
    user,
    ip,
  );

  const updated = await db.returnRequest.update({
    where: { id },
    data: { status: 'tamamlandı', refundId: refund.id, resolvedAt: new Date() },
  });

  const orderAfter = await db.order.findUnique({ where: { id: row.order.id }, select: { status: true } });
  if (orderAfter?.status === 'iade-talebi') {
    await transitionOrder(row.order.id, priorStatusOf(row.order), { userId: user.id }, { note: 'İade süreci tamamlandı', skipEmail: true });
  }

  await auditChange({ user, action: 'iade', entityType: 'ReturnRequest', entityId: id, before: { status: row.status }, after: { status: 'tamamlandı', refundId: refund.id }, ip });
  return updated;
}
