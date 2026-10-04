'use client';

// Panel kupon uçları için istemci sarmalayıcısı.

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

export interface AdminCoupon {
  id: string; code: string; type: 'yüzde' | 'tutar' | 'ücretsiz-kargo'; value: number;
  minCartTotalMinor: number | null; maxDiscountMinor: number | null;
  startsAt: string | null; endsAt: string | null;
  usageLimit: number | null; usageLimitPerCustomer: number | null; usedCount: number;
  includeProductIds: string[]; excludeProductIds: string[]; includeCategoryIds: string[];
  firstOrderOnly: boolean; isActive: boolean; stackable: boolean; createdAt: string;
}
export type CouponInput = Omit<AdminCoupon, 'id' | 'usedCount' | 'createdAt'>;

export interface CouponListParams { q?: string; active?: 'aktif' | 'pasif'; page?: number; pageSize?: number }
export interface CouponListResult { items: AdminCoupon[]; total: number; page: number; pageSize: number; pageCount: number }

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

export const couponsApi = {
  list: (p: CouponListParams) => request<CouponListResult>(`/api/admin/coupons?${qs(p)}`, { cache: 'no-store' }),
  create: (data: CouponInput) => request<{ coupon: AdminCoupon }>('/api/admin/coupons', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: CouponInput) => request<{ coupon: AdminCoupon }>(`/api/admin/coupons/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/admin/coupons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
