// Sipariş durum geçişi — tek giriş noktası.
//
// Her geçiş:
//   1. durum makinesinde doğrulanır (geçersizse 409),
//   2. yan etkilerini uygular (stok kesinleştir/geri ver, kupon geri al, damga),
//   3. OrderEvent yazar (kim, ne zaman, nereden nereye, not),
//   4. transaction dışında e-posta kuyruğuna yazar.
//
// Panel, webhook ve müşteri akışlarının HEPSİ buradan geçer; başka yerde
// `order.status` doğrudan güncellenmez.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { commitStock, releaseStock, restock } from '../inventory/reserve';
import { revalidateCatalog } from '../catalog/queries';
import { orderEmailVars, queueEmail, type EmailTemplateKey } from '../notifications/email';
import { getStoreSettings } from '../settings';
import {
  assertTransition,
  derivedStatuses,
  effectsOf,
  isOrderStatus,
  type OrderStatus,
} from './state-machine';

export interface Actor {
  /** Panel kullanıcısı. */
  userId?: string | null;
  /** Müşteri (kendi siparişinde işlem). */
  customerId?: string | null;
  /** Sistem / webhook. */
  system?: string;
}

export interface TransitionOptions {
  note?: string;
  visibleToCustomer?: boolean;
  /** Yan etki e-postasını bastır (ör. webhook zaten göndermişse). */
  skipEmail?: boolean;
  meta?: Record<string, unknown>;
}

function actorLabel(actor: Actor): string {
  if (actor.system) return `sistem:${actor.system}`;
  if (actor.customerId) return 'müşteri';
  return 'panel';
}

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  options: TransitionOptions = {},
) {
  const settings = await getStoreSettings();

  const result = await db.$transaction(async (tx) => {
    // Aynı siparişe eşzamanlı iki geçiş (ör. iptal iki kez tetiklendi) sırayla
    // işlensin: ikincisi kilidi bekler, güncel durumu okur ve geçersiz geçiş
    // olarak reddedilir — stok iki kez geri eklenmez.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, customer: true },
    });
    if (!order) throw new OrderNotFoundError(orderId);
    if (!isOrderStatus(order.status)) throw new Error(`Bilinmeyen sipariş durumu: ${order.status}`);

    const from = order.status;
    assertTransition(from, to);
    const effects = effectsOf(from, to);

    if (effects.commitStock) {
      await commitStock(tx, order.id, actor.userId ?? null);
    }

    if (effects.releaseStock) {
      // Ödenmemişse rezervasyon açıktır → geri ver. Ödenmişse (kesinleşmiş)
      // kalemlerden geri yükle. İade edilen adetler zaten iade akışında
      // stoka döndüğü için burada yalnız iade edilmemiş adetler yüklenir.
      const released = await releaseStock(tx, order.id, 'iptal', actor.userId ?? null);
      if (released === 0 && to === 'iptal') {
        await restock(
          tx,
          order.id,
          order.items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity - i.refundedQuantity,
          })),
          'iptal',
          actor.userId ?? null,
          'Sipariş iptali',
        );
      }
    }

    if (effects.revokeCoupon && order.couponCode) {
      await tx.couponRedemption.updateMany({
        where: { orderId: order.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.coupon.updateMany({
        where: { code: order.couponCode, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }

    const derived = derivedStatuses(to);
    const stamps: Prisma.OrderUpdateInput = {};
    if (effects.stamp === 'paidAt' && !order.paidAt) stamps.paidAt = new Date();
    if (effects.stamp === 'cancelledAt') stamps.cancelledAt = new Date();
    if (effects.stamp === 'completedAt') stamps.completedAt = new Date();

    const updated = await tx.order.update({
      where: { id: order.id, version: order.version },
      data: {
        status: to,
        ...derived,
        ...stamps,
        version: { increment: 1 },
      },
      include: { customer: true, items: true },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'durum-degisti',
        fromStatus: from,
        toStatus: to,
        message: options.note ?? `${actorLabel(actor)} tarafından durum değiştirildi`,
        visibleToCustomer: options.visibleToCustomer ?? false,
        userId: actor.userId ?? null,
        meta: (options.meta ?? null) as Prisma.InputJsonValue,
      },
    });

    return { order: updated, from, effects };
  });

  // Stok değiştiyse vitrin katalog önbelleği tazelensin.
  if (result.effects.commitStock || result.effects.releaseStock) revalidateCatalog();

  if (result.effects.email && !options.skipEmail) {
    const to = result.order.customer?.email ?? result.order.guestEmail;
    if (to) {
      await queueEmail({
        to,
        template: result.effects.email as EmailTemplateKey,
        vars: {
          ...orderEmailVars(result.order),
          caymaGun: settings.withdrawalDays,
        },
        orderId: result.order.id,
      });
    }
  }

  return result.order;
}

export class OrderNotFoundError extends Error {
  readonly status = 404 as const;
  constructor(id: string) {
    super(`Sipariş bulunamadı: ${id}`);
    this.name = 'OrderNotFoundError';
  }
}

/** Serbest not ekleme (durum değiştirmeden). */
export async function addOrderNote(
  orderId: string,
  actor: Actor,
  message: string,
  visibleToCustomer = false,
) {
  return db.orderEvent.create({
    data: {
      orderId,
      kind: 'not',
      message,
      visibleToCustomer,
      userId: actor.userId ?? null,
    },
  });
}
