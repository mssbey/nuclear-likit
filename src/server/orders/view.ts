// Müşteriye gösterilen sipariş görünümü.
//
// Panel görünümünden AYRIDIR: admin notu, IP, user-agent, ham ödeme yanıtı,
// müşteriye görünmeyen olaylar burada yoktur. Tutarlar kuruştur; biçimlendirme
// arayüzde yapılır.

import 'server-only';
import { jsonArray } from '../catalog/mapping';
import { orderStatusLabels, type OrderStatus } from './state-machine';
import { paymentMethodLabel } from '@/lib/payment-labels';
import type { AddressSnapshot } from '../customers/address-schema';

export interface PublicOrderItem {
  id: string;
  productId: string | null;
  name: string;
  variantLabel: string;
  sku: string;
  imageUrl: string;
  unitPriceMinor: number;
  quantity: number;
  discountMinor: number;
  lineTotalMinor: number;
  refundedQuantity: number;
}

export interface PublicShipment {
  id: string;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface PublicOrderEvent {
  at: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  message: string;
}

export interface PublicOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  placedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  itemsSubtotalMinor: number;
  discountTotalMinor: number;
  shippingTotalMinor: number;
  surchargeMinor: number;
  taxTotalMinor: number;
  grandTotalMinor: number;
  refundedTotalMinor: number;
  couponCode: string | null;
  shippingMethod: { name: string; carrier: string | null; estimatedDays: string } | null;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  customerNote: string | null;
  items: PublicOrderItem[];
  shipments: PublicShipment[];
  events: PublicOrderEvent[];
  /** Kabul edilen yasal metin sürümleri — sipariş sayfası doğru sürümü gösterir. */
  consents: { distanceSales?: { version: number }; preInfo?: { version: number } };
  /** Mock ödeme sayfası için (yalnız kart + ödeme bekliyor). */
  canRetryPayment: boolean;
  /** En son (varsa açık, yoksa son sonuçlanan) iade talebi. */
  returnRequest: {
    id: string;
    status: string;
    requestedAt: string;
    resolutionNote: string | null;
    returnCode: string | null;
  } | null;
}

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentMethod: string;
  placedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  itemsSubtotalMinor: number;
  discountTotalMinor: number;
  shippingTotalMinor: number;
  surchargeMinor: number;
  taxTotalMinor: number;
  grandTotalMinor: number;
  refundedTotalMinor: number;
  couponCode: string | null;
  shippingMethod: unknown;
  shippingAddress: unknown;
  billingAddress: unknown;
  customerNote: string | null;
  consents: unknown;
  items: {
    id: string;
    productId: string | null;
    name: string;
    variantLabel: string;
    sku: string;
    imageUrl: string;
    unitPriceMinor: number;
    quantity: number;
    discountMinor: number;
    lineTotalMinor: number;
    refundedQuantity: number;
  }[];
  shipments: {
    id: string;
    carrier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  }[];
  events: {
    createdAt: Date;
    kind: string;
    fromStatus: string | null;
    toStatus: string | null;
    message: string;
  }[];
  returns: { id: string; status: string; requestedAt: Date; resolutionNote: string | null; returnCode: string | null }[];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function publicOrderView(o: OrderRow): PublicOrder {
  const sm = (o.shippingMethod ?? null) as { name?: string; carrier?: string | null; estimatedDays?: string } | null;
  const status = o.status as OrderStatus;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status,
    statusLabel: orderStatusLabels[status] ?? o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    paymentMethod: o.paymentMethod,
    paymentMethodLabel: paymentMethodLabel(o.paymentMethod),
    placedAt: o.placedAt.toISOString(),
    paidAt: iso(o.paidAt),
    cancelledAt: iso(o.cancelledAt),
    completedAt: iso(o.completedAt),
    itemsSubtotalMinor: o.itemsSubtotalMinor,
    discountTotalMinor: o.discountTotalMinor,
    shippingTotalMinor: o.shippingTotalMinor,
    surchargeMinor: o.surchargeMinor,
    taxTotalMinor: o.taxTotalMinor,
    grandTotalMinor: o.grandTotalMinor,
    refundedTotalMinor: o.refundedTotalMinor,
    couponCode: o.couponCode,
    shippingMethod: sm
      ? { name: sm.name ?? '', carrier: sm.carrier ?? null, estimatedDays: sm.estimatedDays ?? '' }
      : null,
    shippingAddress: (o.shippingAddress ?? {}) as AddressSnapshot,
    billingAddress: (o.billingAddress ?? {}) as AddressSnapshot,
    customerNote: o.customerNote,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      variantLabel: i.variantLabel,
      sku: i.sku,
      imageUrl: i.imageUrl,
      unitPriceMinor: i.unitPriceMinor,
      quantity: i.quantity,
      discountMinor: i.discountMinor,
      lineTotalMinor: i.lineTotalMinor,
      refundedQuantity: i.refundedQuantity,
    })),
    shipments: o.shipments.map((s) => ({
      id: s.id,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      trackingUrl: s.trackingUrl,
      status: s.status,
      shippedAt: iso(s.shippedAt),
      deliveredAt: iso(s.deliveredAt),
    })),
    events: o.events.map((e) => ({
      at: e.createdAt.toISOString(),
      kind: e.kind,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      message: e.message,
    })),
    consents: (o.consents ?? {}) as PublicOrder['consents'],
    canRetryPayment:
      o.paymentMethod === 'kart' && (o.status === 'ödeme-bekliyor' || o.status === 'başarısız'),
    returnRequest: o.returns[0]
      ? {
          id: o.returns[0].id,
          status: o.returns[0].status,
          requestedAt: o.returns[0].requestedAt.toISOString(),
          resolutionNote: o.returns[0].resolutionNote,
          returnCode: o.returns[0].returnCode,
        }
      : null,
  };
}

/** `publicOrderView` için ortak include — tek yerden yönetilir. */
export const publicOrderInclude = {
  items: true,
  shipments: { orderBy: { createdAt: 'desc' } },
  events: { where: { visibleToCustomer: true }, orderBy: { createdAt: 'asc' } },
  returns: { orderBy: { requestedAt: 'desc' }, take: 1 },
} as const;

export { jsonArray };
