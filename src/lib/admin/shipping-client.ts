'use client';

// Panel kargo uçları için istemci sarmalayıcısı: sevkiyat listesi, bölge/tarife
// yönetimi, taşıyıcı ayarları.

import { ApiError } from './client';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
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

export interface ShipmentListParams {
  tab?: string;
  status?: string;
  carrier?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminShipmentRow {
  id: string; orderId: string; orderNumber: string; orderStatus: string; carrier: string; carrierLabel: string;
  trackingNumber: string | null; trackingUrl: string | null; status: string; itemCount: number;
  weightGrams: number | null; desi: number | null; costMinor: number | null;
  customerName: string; customerCity: string; createdAt: string; shippedAt: string | null; deliveredAt: string | null;
}

export interface ShipmentListResult {
  items: AdminShipmentRow[]; total: number; page: number; pageSize: number; pageCount: number;
  counts: Record<string, number>;
}

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

export interface RateTier { upTo: number | null; priceMinor: number }
export interface AdminShippingMethod {
  id: string; zoneId: string; name: string; type: 'sabit' | 'desi' | 'tutara-göre' | 'ücretsiz' | 'kapıda';
  priceMinor: number; freeOverMinor: number | null; tiers: RateTier[] | null; estimatedDays: string;
  carrier: string | null; isActive: boolean; sortOrder: number;
}
export interface AdminShippingZone {
  id: string; name: string; countries: string[]; cities: string[]; sortOrder: number; methods: AdminShippingMethod[];
}

export interface CarrierSettingsView { enabled: boolean; apiKey: string; apiKeySet?: boolean; apiSecret: string; apiSecretSet?: boolean; customerCode: string; customerCodeSet?: boolean }
export interface KargoSettingsResponse {
  providers: Record<'yurtici' | 'aras' | 'mng' | 'surat' | 'ptt', CarrierSettingsView>;
  cod: { codSurchargeMinor: number; codMaxTotalMinor: number | null };
  encryptionConfigured: boolean;
}

export const shipmentsApi = {
  list: (p: ShipmentListParams) => request<ShipmentListResult>(`/api/admin/shipments?${qs(p)}`, { cache: 'no-store' }),
  update: (id: string, patch: { status?: string; trackingNumber?: string; note?: string }) =>
    request<{ shipment: unknown }>(`/api/admin/shipments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  sync: (id: string) => request<{ updated: boolean; reason: string; newStatus?: string }>(`/api/admin/shipments/${encodeURIComponent(id)}/takip`, { method: 'POST' }),
  syncBulk: (ids: string[]) => request<{ updated: number; total: number }>('/api/admin/shipments/toplu', { method: 'POST', body: JSON.stringify({ ids }) }),
};

export const zonesApi = {
  list: () => request<{ zones: AdminShippingZone[] }>('/api/admin/shipping/zones', { cache: 'no-store' }),
  createZone: (data: { name: string; countries: string[]; cities: string[] }) =>
    request<{ zone: AdminShippingZone }>('/api/admin/shipping/zones', { method: 'POST', body: JSON.stringify(data) }),
  updateZone: (id: string, patch: Partial<{ name: string; countries: string[]; cities: string[] }>) =>
    request<{ zone: AdminShippingZone }>(`/api/admin/shipping/zones/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteZone: (id: string) => request<{ ok: true }>(`/api/admin/shipping/zones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reorderZones: (orderedIds: string[]) => request<{ zones: AdminShippingZone[] }>('/api/admin/shipping/zones/reorder', { method: 'POST', body: JSON.stringify({ orderedIds }) }),
  createMethod: (zoneId: string, data: Omit<AdminShippingMethod, 'id' | 'zoneId' | 'sortOrder'>) =>
    request<{ method: AdminShippingMethod }>(`/api/admin/shipping/zones/${encodeURIComponent(zoneId)}/methods`, { method: 'POST', body: JSON.stringify(data) }),
  updateMethod: (id: string, patch: Partial<Omit<AdminShippingMethod, 'id' | 'zoneId' | 'sortOrder'>>) =>
    request<{ method: AdminShippingMethod }>(`/api/admin/shipping/methods/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteMethod: (id: string) => request<{ ok: true }>(`/api/admin/shipping/methods/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reorderMethods: (zoneId: string, orderedIds: string[]) =>
    request<{ zones: AdminShippingZone[] }>('/api/admin/shipping/methods/reorder', { method: 'POST', body: JSON.stringify({ zoneId, orderedIds }) }),
};

export const kargoSettingsApi = {
  get: () => request<KargoSettingsResponse>('/api/admin/settings/kargo', { cache: 'no-store' }),
  save: (body: KargoSettingsResponse) => request<KargoSettingsResponse>('/api/admin/settings/kargo', { method: 'PUT', body: JSON.stringify(body) }),
};
