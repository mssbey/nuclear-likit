'use client';

// Panel indirim kuralı uçları için istemci sarmalayıcısı.

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
      (payload && typeof payload.message === 'string' && payload.message) ||
        `İstek başarısız (${res.status})`,
      res.status,
      payload?.issues ?? {},
    );
  }
  return payload as T;
}

export type DiscountRuleType = 'sepet-yuzde' | 'x-al-y-ode';

export interface AdminDiscountRule {
  id: string;
  name: string;
  type: DiscountRuleType;
  isActive: boolean;
  priority: number;
  stackable: boolean;
  includeCategoryIds: string[];
  includeProductIds: string[];
  percentBps: number;
  minCartTotalMinor: number | null;
  buyQuantity: number | null;
  payQuantity: number | null;
  minQuantity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export type DiscountRuleInput = Omit<AdminDiscountRule, 'id' | 'createdAt'>;

export interface DiscountRuleListParams {
  q?: string;
  type?: DiscountRuleType;
  active?: 'aktif' | 'pasif';
  page?: number;
  pageSize?: number;
}
export interface DiscountRuleListResult {
  items: AdminDiscountRule[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  }
  return sp.toString();
}

export const discountRulesApi = {
  list: (p: DiscountRuleListParams) =>
    request<DiscountRuleListResult>(`/api/admin/discount-rules?${qs(p)}`, { cache: 'no-store' }),
  create: (data: DiscountRuleInput) =>
    request<{ rule: AdminDiscountRule }>('/api/admin/discount-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: DiscountRuleInput) =>
    request<{ rule: AdminDiscountRule }>(`/api/admin/discount-rules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ ok: true }>(`/api/admin/discount-rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
