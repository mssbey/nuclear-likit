'use client';

// Panel müşteri uçları için istemci sarmalayıcısı.

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

export interface AdminCustomerRow {
  id: string; email: string; name: string; phone: string | null; isGuest: boolean; marketingOptIn: boolean;
  tags: string[]; orderCount: number; totalSpentMinor: number; lastOrderAt: string | null; createdAt: string; anonymizedAt: string | null;
}
export interface AdminCustomerDetail extends AdminCustomerRow {
  note: string;
  addresses: { id: string; type: string; title: string; firstName: string; lastName: string; phone: string; city: string; district: string; addressLine: string; isDefault: boolean; isCorporate: boolean }[];
  orders: { id: string; orderNumber: string; status: string; grandTotalMinor: number; placedAt: string }[];
  returns: { id: string; status: string; requestedAt: string }[];
}
export interface CustomerListResult { items: AdminCustomerRow[]; total: number; page: number; pageSize: number; pageCount: number }
export interface CustomerListParams { q?: string; tag?: string; sort?: 'yeni' | 'harcama' | 'siparis'; page?: number; pageSize?: number }

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

export const customersApi = {
  list: (p: CustomerListParams) => request<CustomerListResult>(`/api/admin/customers?${qs(p)}`, { cache: 'no-store' }),
  get: (id: string) => request<{ item: AdminCustomerDetail }>(`/api/admin/customers/${encodeURIComponent(id)}`, { cache: 'no-store' }),
  updateMeta: (id: string, body: { note: string; tags: string[] }) =>
    request<{ item: AdminCustomerDetail }>(`/api/admin/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  anonymize: (id: string) => request<{ ok: true }>(`/api/admin/customers/${encodeURIComponent(id)}/anonimlestir`, { method: 'POST' }),
};
