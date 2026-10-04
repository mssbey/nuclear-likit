'use client';

// Panel iade uçları için istemci sarmalayıcısı.

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

export interface AdminReturnRow {
  id: string; orderId: string; orderNumber: string; orderStatus: string; status: string;
  reason: string; reasonLabel: string; description: string; itemCount: number;
  customerName: string; requestedAt: string; resolvedAt: string | null;
}
export interface AdminReturnDetail extends AdminReturnRow {
  items: { orderItemId: string; quantity: number; name: string; sku: string }[];
  returnCode: string | null;
  resolutionNote: string | null;
}
export interface ReturnListResult {
  items: AdminReturnRow[]; total: number; page: number; pageSize: number; pageCount: number; counts: Record<string, number>;
}
export interface ReturnListParams {
  status?: string; q?: string; page?: number; pageSize?: number;
}

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

export const returnsApi = {
  list: (p: ReturnListParams) => request<ReturnListResult>(`/api/admin/returns?${qs(p)}`, { cache: 'no-store' }),
  get: (id: string) => request<{ item: AdminReturnDetail }>(`/api/admin/returns/${encodeURIComponent(id)}`, { cache: 'no-store' }),
  approve: (id: string, note: string, returnCode: string) =>
    request<{ item: AdminReturnDetail }>(`/api/admin/returns/${encodeURIComponent(id)}/onayla`, { method: 'POST', body: JSON.stringify({ note, returnCode }) }),
  reject: (id: string, note: string) =>
    request<{ item: AdminReturnDetail }>(`/api/admin/returns/${encodeURIComponent(id)}/reddet`, { method: 'POST', body: JSON.stringify({ note }) }),
  markReceived: (id: string) =>
    request<{ item: AdminReturnDetail }>(`/api/admin/returns/${encodeURIComponent(id)}/urun-alindi`, { method: 'POST' }),
  complete: (id: string, body: { restock: boolean; includeShipping: boolean; amountMinor?: number }) =>
    request<{ item: AdminReturnDetail }>(`/api/admin/returns/${encodeURIComponent(id)}/tamamla`, { method: 'POST', body: JSON.stringify(body) }),
};
