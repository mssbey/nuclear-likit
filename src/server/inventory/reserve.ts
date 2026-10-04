// Stok rezervasyonu ve hareketleri.
//
// AKIŞ
//   sipariş oluşturma → reserveStock()   : stok düşürülür + StockReservation + hareket "sipariş"
//   ödeme onayı       → commitStock()    : rezervasyon kapatılır
//   iptal / süre dolumu → releaseStock() : stok geri verilir, hareket "iptal"
//   iade              → restock()        : stok geri verilir, hareket "iade"
//
// Stok, rezervasyon anında düşürülür (aşırı satışı önlemek için); ödeme
// gelmezse geri verilir. Her değişiklik `StockMovement` ile izlenir ve
// `stockAfter` o anki değeri dondurur.
//
// EŞZAMANLILIK: Düşürme koşullu güncellemeyle yapılır (`stock >= adet`);
// etkilenen satır 0 ise yetersiz stoktur ve transaction geri alınır.
// SQLite yazmayı zaten serileştirir; Postgres'te satır kilidi devreye girer.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';

export interface ReserveLine {
  variantId: string;
  quantity: number;
}

export class InsufficientStockError extends Error {
  readonly status = 409 as const;
  constructor(
    public readonly variantId: string,
    public readonly requested: number,
    public readonly available: number,
    public readonly productName?: string,
  ) {
    super(
      available <= 0
        ? `${productName ?? 'Ürün'} stokta kalmadı.`
        : `${productName ?? 'Ürün'} için yalnızca ${available} adet stok var (istenen: ${requested}).`,
    );
    this.name = 'InsufficientStockError';
  }
}

/**
 * Stoku düşürüp rezervasyon yazar. Transaction içinde çağrılır; herhangi bir
 * satırda stok yetmezse fırlatır ve çağıran transaction geri alınır.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  lines: ReserveLine[],
  opts: { orderId: string; expiresAt: Date; names?: Record<string, string> },
): Promise<void> {
  for (const line of lines) {
    const qty = Math.max(1, Math.round(line.quantity));

    // Stok takibi kapalı varyant: adet düşülmez, rezervasyon yazılmaz (iptalde
    // geri verilecek bir şey de olmaz). Yalnız elle seçilen durum kontrol edilir.
    const tracking = await tx.variant.findUnique({
      where: { id: line.variantId },
      select: { trackStock: true, inStock: true, isActive: true },
    });
    if (tracking && !tracking.trackStock) {
      if (!tracking.isActive || !tracking.inStock) {
        throw new InsufficientStockError(line.variantId, qty, 0, opts.names?.[line.variantId]);
      }
      continue;
    }

    const result = await tx.variant.updateMany({
      where: { id: line.variantId, isActive: true, stock: { gte: qty } },
      data: { stock: { decrement: qty }, version: { increment: 1 } },
    });

    if (result.count === 0) {
      const current = await tx.variant.findUnique({
        where: { id: line.variantId },
        select: { stock: true, isActive: true },
      });
      throw new InsufficientStockError(
        line.variantId,
        qty,
        current?.isActive ? current.stock : 0,
        opts.names?.[line.variantId],
      );
    }

    await tx.stockReservation.create({
      data: {
        variantId: line.variantId,
        orderId: opts.orderId,
        quantity: qty,
        expiresAt: opts.expiresAt,
      },
    });
    // Stok şimdi düştüğü için geçmiş kaydı da şimdi yazılır ("50 → 49 — Sipariş").
    // Ödeme gelmezse releaseStock "+1 iptal" yazar.
    await movement(tx, line.variantId, -qty, 'sipariş', { orderId: opts.orderId });
  }
}

async function movement(
  tx: Prisma.TransactionClient,
  variantId: string,
  delta: number,
  reason: string,
  extra: { orderId?: string | null; userId?: string | null; note?: string },
): Promise<void> {
  const v = await tx.variant.findUnique({ where: { id: variantId }, select: { stock: true } });
  await tx.stockMovement.create({
    data: {
      variantId,
      delta,
      reason,
      orderId: extra.orderId ?? null,
      createdByUserId: extra.userId ?? null,
      note: extra.note ?? '',
      stockAfter: v?.stock ?? 0,
    },
  });
}

/**
 * Ödeme onaylandı: rezervasyonlar kesinleşir. Stok zaten düşük; yalnızca
 * rezervasyon kapatılır ve kalıcı "sipariş" hareketi yazılır.
 */
export async function commitStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId?: string | null,
): Promise<number> {
  const open = await tx.stockReservation.findMany({
    where: { orderId, releasedAt: null },
  });
  // Hareket artık rezervasyon anında yazılıyor; bu sürümden önce açılmış
  // rezervasyonlarda yoksa burada yazılır (çift kayıt olmaz).
  const logged = new Set(
    (
      await tx.stockMovement.findMany({
        where: { orderId, reason: 'sipariş' },
        select: { variantId: true },
      })
    ).map((m) => m.variantId),
  );
  for (const r of open) {
    if (!logged.has(r.variantId)) await movement(tx, r.variantId, -r.quantity, 'sipariş', { orderId, userId });
  }
  await tx.stockReservation.updateMany({
    where: { orderId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  return open.length;
}

/**
 * Sipariş iptal edildi (ödenmemişken) veya rezervasyon süresi doldu:
 * stok geri verilir.
 */
export async function releaseStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason: 'iptal' | 'rezervasyon-iptal',
  userId?: string | null,
): Promise<number> {
  const open = await tx.stockReservation.findMany({
    where: { orderId, releasedAt: null },
  });
  for (const r of open) {
    await tx.variant.update({
      where: { id: r.variantId },
      data: { stock: { increment: r.quantity }, version: { increment: 1 } },
    });
    await movement(tx, r.variantId, r.quantity, reason, { orderId, userId });
  }
  await tx.stockReservation.updateMany({
    where: { orderId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  return open.length;
}

/**
 * Ödenmiş siparişin iptali veya iadesi: kesinleşmiş stok geri verilir.
 * Kalem bazında miktar verilebilir (kısmi iade).
 */
export async function restock(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: { variantId: string | null; quantity: number }[],
  reason: 'iptal' | 'iade',
  userId?: string | null,
  note?: string,
): Promise<void> {
  for (const item of items) {
    if (!item.variantId || item.quantity <= 0) continue;
    const exists = await tx.variant.findUnique({ where: { id: item.variantId }, select: { trackStock: true } });
    if (!exists) continue; // varyant silinmişse stok geri verilecek yer yok
    if (!exists.trackStock) continue; // stok takibi kapalı: adet tutulmuyor
    await tx.variant.update({
      where: { id: item.variantId },
      data: { stock: { increment: item.quantity }, version: { increment: 1 } },
    });
    await movement(tx, item.variantId, item.quantity, reason, { orderId, userId, note });
  }
}

/** Manuel düzeltme / sayım (panel). */
export async function adjustStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  delta: number,
  reason: 'manuel' | 'sayım' | 'fire',
  userId: string,
  note = '',
): Promise<void> {
  await tx.variant.update({
    where: { id: variantId },
    data: { stock: { increment: delta }, version: { increment: 1 } },
  });
  await movement(tx, variantId, delta, reason, { userId, note });
}

/**
 * Süresi dolmuş rezervasyonları serbest bırakır. Sipariş oluşturma ucundan
 * seyrek ve bakım betiğinden düzenli çağrılır. Siparişi de "başarısız" yapmaz;
 * yalnız stoku geri verir — sipariş durumu ödeme katmanının işidir.
 */
export async function releaseExpiredReservations(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<number> {
  const expired = await tx.stockReservation.findMany({
    where: { releasedAt: null, expiresAt: { lt: now } },
    select: { orderId: true },
    distinct: ['orderId'],
  });
  let released = 0;
  for (const { orderId } of expired) {
    if (!orderId) continue;
    // Yalnız hâlâ ödeme bekleyen siparişlerin rezervasyonu düşer.
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (order?.status === 'ödeme-bekliyor' || order?.status === 'taslak' || order?.status === 'başarısız') {
      released += await releaseStock(tx, orderId, 'rezervasyon-iptal');
    }
  }
  return released;
}
