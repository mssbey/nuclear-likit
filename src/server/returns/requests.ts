// Müşteri iade talebi — oluşturma ve kendi talebini görüntüleme.
//
// Sipariş durumu `teslim-edildi` veya `tamamlandı` olmalı (durum makinesinin
// izin verdiği tek giriş noktaları). Talep açılınca sipariş `iade-talebi`ne
// geçer (bkz. `state-machine.ts` — bu geçiş otomatik "talebiniz alındı"
// e-postası gönderir). Aynı anda yalnız bir AÇIK talep olabilir.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { transitionOrder } from '../orders/transitions';
import { getStoreSettings } from '../settings';
import { OPEN_RETURN_STATUSES, returnRequestSchema, type ReturnStatus } from './schema';

export class ReturnError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'ReturnError';
  }
}

/** Sipariş `iade-talebi`ne girmeden önceki durumu — yalnız bu ikisinden gelinebilir. */
export function priorStatusOf(order: { completedAt: Date | null }): 'tamamlandı' | 'teslim-edildi' {
  return order.completedAt ? 'tamamlandı' : 'teslim-edildi';
}

export interface CustomerReturnView {
  id: string;
  status: ReturnStatus;
  reason: string;
  description: string;
  items: { orderItemId: string; quantity: number }[];
  resolutionNote: string | null;
  returnCode: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

function toCustomerView(r: {
  id: string;
  status: string;
  reason: string;
  description: string;
  items: unknown;
  resolutionNote: string | null;
  returnCode: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
}): CustomerReturnView {
  return {
    id: r.id,
    status: r.status as ReturnStatus,
    reason: r.reason,
    description: r.description,
    items: (r.items as { orderItemId: string; quantity: number }[]) ?? [],
    resolutionNote: r.resolutionNote,
    returnCode: r.returnCode,
    requestedAt: r.requestedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

/** Bir siparişin en güncel (varsa açık, yoksa son) iade talebi — sipariş detayında gösterilir. */
export async function getOrderReturnRequest(orderId: string): Promise<CustomerReturnView | null> {
  const row = await db.returnRequest.findFirst({ where: { orderId }, orderBy: { requestedAt: 'desc' } });
  return row ? toCustomerView(row) : null;
}

const RETURNABLE_ORDER_STATUSES = new Set(['teslim-edildi', 'tamamlandı']);

export async function createReturnRequest(
  orderId: string,
  customerId: string,
  raw: unknown,
): Promise<CustomerReturnView> {
  const input = returnRequestSchema.parse(raw);

  const order = await db.order.findFirst({
    where: { id: orderId, customerId },
    include: { items: true },
  });
  if (!order) throw new ReturnError('Sipariş bulunamadı.', 404);
  if (!RETURNABLE_ORDER_STATUSES.has(order.status)) {
    throw new ReturnError('Bu sipariş için şu an iade talebi açılamıyor.', 409);
  }

  const settings = await getStoreSettings();
  const reference = order.completedAt ?? order.updatedAt;
  const deadline = new Date(reference.getTime() + settings.withdrawalDays * 24 * 60 * 60 * 1000);
  if (new Date() > deadline) {
    throw new ReturnError(`Cayma hakkı süresi (${settings.withdrawalDays} gün) dolmuş.`, 409);
  }

  const openExisting = await db.returnRequest.findFirst({
    where: { orderId: order.id, status: { in: [...OPEN_RETURN_STATUSES] } },
  });
  if (openExisting) throw new ReturnError('Bu sipariş için zaten açık bir iade talebi var.', 409);

  for (const req of input.items) {
    const item = order.items.find((i) => i.id === req.orderItemId);
    if (!item) throw new ReturnError('Seçilen ürün siparişte bulunamadı.');
    const remaining = item.quantity - item.refundedQuantity;
    if (req.quantity > remaining) {
      throw new ReturnError(`${item.name}: en fazla ${remaining} adet iade edilebilir.`);
    }
  }

  const created = await db.returnRequest.create({
    data: {
      orderId: order.id,
      customerId,
      status: 'talep',
      reason: input.reason,
      description: input.description,
      items: input.items as unknown as Prisma.InputJsonValue,
      photos: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await transitionOrder(order.id, 'iade-talebi', { customerId }, {
    note: 'Müşteri iade talebi açtı',
    visibleToCustomer: true,
  });

  return toCustomerView(created);
}
