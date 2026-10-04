// Takip senkronizasyonu — sağlayıcı API'sinden son durumu çekip `Shipment`'a
// yazar. Bu sürümde tüm sağlayıcılar (manuel dahil) otomatik sorgulamayı
// desteklemiyor (bkz. `adapters/*`); fonksiyon yine de çağrılabilir ve neden
// güncellenmediğini açıkça döner — panel ve `scripts/sync-shipments.mts` aynı
// yolu kullanır, gerçek bir taşıyıcı API'si eklendiğinde otomatik devreye girer.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { transitionOrder } from '../orders/transitions';
import { getShippingProvider } from './registry';
import { ShippingProviderError } from './provider';
import type { Carrier } from './carriers';

export interface SyncResult {
  shipmentId: string;
  updated: boolean;
  reason: string;
  newStatus?: string;
}

async function completeOrderIfAllDelivered(orderId: string, actor: { userId?: string; system?: string }) {
  const all = await db.shipment.findMany({ where: { orderId, status: { notIn: ['iade-yolda', 'kayıp'] } } });
  const allDelivered = all.length > 0 && all.every((s) => s.status === 'teslim-edildi');
  if (!allDelivered) return;
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (order?.status !== 'kargolandı') return;
  await transitionOrder(orderId, 'teslim-edildi', actor, { note: 'Tüm sevkiyatlar teslim edildi', visibleToCustomer: true });
  await transitionOrder(orderId, 'tamamlandı', actor, { note: 'Teslimat sonrası otomatik tamamlandı', skipEmail: true });
}

/** Tek sevkiyatı sağlayıcıdan senkronize eder. Sağlayıcı bağlı değilse `updated: false` döner, hata fırlatmaz. */
export async function syncShipment(shipmentId: string): Promise<SyncResult> {
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { shipmentId, updated: false, reason: 'Sevkiyat bulunamadı.' };
  if (!shipment.trackingNumber) return { shipmentId, updated: false, reason: 'Takip numarası yok.' };
  if (['teslim-edildi', 'iade-yolda', 'kayıp'].includes(shipment.status)) {
    return { shipmentId, updated: false, reason: 'Sevkiyat zaten sonuçlanmış.' };
  }

  const provider = await getShippingProvider(shipment.carrier as Carrier);
  if (!provider.configured()) {
    return { shipmentId, updated: false, reason: `${provider.label} için otomatik takip bağlı değil; durumu panelden elle güncelleyin.` };
  }

  try {
    const result = await provider.track(shipment.trackingNumber);
    if (result.status === shipment.status) {
      return { shipmentId, updated: false, reason: 'Durum değişmedi.' };
    }
    const events = [...(((shipment.events as unknown[]) ?? []) as { at: string; code: string; description: string }[]), ...result.events];
    await db.shipment.update({
      where: { id: shipment.id },
      data: {
        status: result.status,
        events: events as unknown as Prisma.InputJsonValue,
        deliveredAt: result.deliveredAt ? new Date(result.deliveredAt) : shipment.deliveredAt,
        version: { increment: 1 },
      },
    });
    if (result.status === 'teslim-edildi') {
      await completeOrderIfAllDelivered(shipment.orderId, { system: `kargo-takip:${provider.id}` });
    }
    return { shipmentId, updated: true, reason: 'Sağlayıcıdan güncellendi.', newStatus: result.status };
  } catch (err) {
    if (err instanceof ShippingProviderError) {
      return { shipmentId, updated: false, reason: err.message };
    }
    throw err;
  }
}

/** Aktif (sonuçlanmamış) tüm sevkiyatları sırayla senkronize eder — panel toplu işlem ve cron betiği için. */
export async function syncAllActiveShipments(): Promise<SyncResult[]> {
  const active = await db.shipment.findMany({
    where: { status: { notIn: ['teslim-edildi', 'iade-yolda', 'kayıp'] }, trackingNumber: { not: null } },
    select: { id: true },
  });
  const results: SyncResult[] = [];
  for (const s of active) {
    results.push(await syncShipment(s.id));
  }
  return results;
}
