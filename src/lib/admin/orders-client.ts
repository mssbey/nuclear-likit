'use client';

// Panel sipariş uçları için istemci sarmalayıcısı.

import type { AdminOrderView, OrderListResult } from '@/server/orders/admin-view';
import type { OrderTab } from '@/server/orders/order-tabs';
import type { OrderStatus } from '@/server/orders/state-machine';
import type { Carrier, ShipmentStatus } from '@/server/shipping/carriers';
import type { AddressInput } from '@/server/customers/address-schema';
import { ApiError } from './client';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(
      (payload && typeof payload.message === 'string' && payload.message) || `İstek başarısız (${res.status})`,
      res.status,
      payload?.issues ?? {},
    );
  }
  return payload as T;
}

export interface OrderListParams {
  tab?: OrderTab;
  status?: OrderStatus;
  q?: string;
  from?: string;
  to?: string;
  minMinor?: number;
  maxMinor?: number;
  paymentMethod?: string;
  carrier?: string;
  source?: string;
  sort?: 'placedAt' | 'grandTotalMinor' | 'orderNumber' | 'status';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export function orderListQueryString(p: OrderListParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  }
  return sp.toString();
}

export const ordersApi = {
  list: (p: OrderListParams) =>
    request<OrderListResult>(`/api/admin/orders?${orderListQueryString(p)}`, { cache: 'no-store' }),

  exportUrl: (p: OrderListParams) => `/api/admin/orders?${orderListQueryString(p)}&format=csv`,

  get: (id: string) => request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}`, { cache: 'no-store' }),

  updateMeta: (id: string, body: { shippingAddress?: AddressInput; billingAddress?: AddressInput; adminNote?: string; customerVisibleNote?: string }) =>
    request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  transition: (id: string, to: OrderStatus, note = '', visibleToCustomer = false) =>
    request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/durum`, {
      method: 'POST',
      body: JSON.stringify({ to, note, visibleToCustomer }),
    }),

  setPaymentStatus: (id: string, to: 'ödendi' | 'bekliyor' | 'başarısız', note?: string) =>
    request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/odeme`, { method: 'PATCH', body: JSON.stringify({ to, note }) }),
  recordPayment: (id: string, body: { amountMinor: number; method: string; reference?: string; note?: string }) =>
    request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/odeme`, { method: 'POST', body: JSON.stringify(body) }),

  refund: (id: string, body: { items: { orderItemId: string; quantity: number }[]; amountMinor?: number; reason: string; restock: boolean; includeShipping: boolean }) =>
    request<{ refundId: string; order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/iade`, { method: 'POST', body: JSON.stringify(body) }),

  createShipment: (id: string, body: { carrier: Carrier; trackingNumber?: string; trackingUrl?: string; items?: { orderItemId: string; quantity: number }[]; note?: string; markShipped?: boolean; desi?: number; weightGrams?: number }) =>
    request<{ shipmentId: string; order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/kargo`, { method: 'POST', body: JSON.stringify(body) }),

  updateShipment: (id: string, shipmentId: string, body: { status?: ShipmentStatus; trackingNumber?: string; trackingUrl?: string; note?: string }) =>
    request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/kargo/${encodeURIComponent(shipmentId)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  updateItems: (id: string, body: { items: { id?: string; variantId: string; quantity: number; discountMinor?: number; unitPriceMinor?: number }[]; shippingTotalMinor?: number; note?: string }) =>
    request<{ order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/kalemler`, { method: 'POST', body: JSON.stringify(body) }),

  resendEmail: (id: string, template: string) =>
    request<{ ok: true; order: AdminOrderView }>(`/api/admin/orders/${encodeURIComponent(id)}/eposta`, { method: 'POST', body: JSON.stringify({ template }) }),

  bulk: (body: { action: 'durum'; ids: string[]; to: OrderStatus; note?: string } | { action: 'kargo'; ids: string[]; carrier: Carrier } | { action: 'eposta'; ids: string[]; template: string }) =>
    request<{ results: { id: string; orderNumber: string; ok: boolean; message?: string }[]; ok: number; failed: number }>('/api/admin/orders/toplu', { method: 'POST', body: JSON.stringify(body) }),

  createManual: (body: { order: unknown; markPaid: boolean; source: 'panel' | 'telefon'; customerId?: string | null }) =>
    request<{ orderId: string; orderNumber: string; status: string }>('/api/admin/orders', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(body),
    }),
};
