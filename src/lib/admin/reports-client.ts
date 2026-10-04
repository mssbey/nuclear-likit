'use client';

// Panel rapor uçları için istemci sarmalayıcısı.

import { ApiError } from './client';

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
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

export interface SalesSummary {
  revenueMinor: number; netRevenueMinor: number; refundedMinor: number; orderCount: number;
  avgOrderValueMinor: number; returnRequestCount: number; returnRate: number;
}
export interface SalesPoint { date: string; revenueMinor: number; orderCount: number }
export interface TopProductRow { productId: string; name: string; slug: string; quantity: number; revenueMinor: number }
export interface CategoryBreakdownRow { categoryId: string; name: string; revenueMinor: number }
export interface PaymentMethodRow { method: string; label: string; count: number; revenueMinor: number }
export interface ReturnReasonRow { reason: string; reasonLabel: string; count: number }
export interface ReportsOverview {
  range: { from: string; to: string };
  summary: SalesSummary;
  series: SalesPoint[];
  topProducts: TopProductRow[];
  categories: CategoryBreakdownRow[];
  paymentMethods: PaymentMethodRow[];
  returnReasons: ReturnReasonRow[];
}

export const reportsApi = {
  overview: (from: string, to: string) => request<ReportsOverview>(`/api/admin/reports?from=${from}&to=${to}`),
  csvUrl: (from: string, to: string) => `/api/admin/reports?from=${from}&to=${to}&format=csv`,
};
