'use client';

// Panel stok uçları için istemci sarmalayıcısı.

import { ApiError } from './client';
import type { CsvRow, ManagerData, ManagerSaveInput, ManagerSaveResult } from './stock-manager';

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

export interface AdminStockMovementRow {
  id: string; variantId: string; productName: string; sku: string; delta: number; reason: string;
  stockAfter: number; note: string; orderId: string | null; orderNumber: string | null;
  createdByName: string | null; createdAt: string;
}
export interface StockMovementListResult { items: AdminStockMovementRow[]; total: number; page: number; pageSize: number; pageCount: number }
export interface StockMovementListParams { q?: string; reason?: string; from?: string; to?: string; page?: number; pageSize?: number }

export interface LowStockRow { variantId: string; productId: string; productSlug: string; productName: string; sku: string; stock: number }
export interface LowStockReport { threshold: number; items: LowStockRow[] }

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

export const stockApi = {
  movements: (p: StockMovementListParams) => request<StockMovementListResult>(`/api/admin/stock/hareketler?${qs(p)}`, { cache: 'no-store' }),
  lowStock: () => request<LowStockReport>('/api/admin/stock/dusuk', { cache: 'no-store' }),
  adjust: (variantId: string, body: { delta: number; reason: string; note?: string }) =>
    request<{ movement: AdminStockMovementRow }>(`/api/admin/stock/duzelt/${encodeURIComponent(variantId)}`, { method: 'POST', body: JSON.stringify(body) }),
};

// ------------------------------------------------------- Stok Yönetimi ----


export interface VariantHistoryItem {
  id: string; delta: number; stockBefore: number; stockAfter: number; reason: string; note: string;
  orderId: string | null; orderNumber: string | null; byName: string | null; createdAt: string;
}
export interface VariantHistoryResult {
  variant: { id: string; sku: string; stock: number; trackStock: boolean; product: { name: string } };
  items: VariantHistoryItem[];
}

export const stockManagerApi = {
  load: () => request<ManagerData>('/api/admin/stock/yonetim', { cache: 'no-store' }),
  save: (input: ManagerSaveInput) =>
    request<ManagerSaveResult>('/api/admin/stock/yonetim', { method: 'POST', body: JSON.stringify(input) }),
  importCsv: (rows: CsvRow[], dryRun: boolean) =>
    request<ManagerSaveResult>('/api/admin/stock/yonetim/csv', { method: 'POST', body: JSON.stringify({ rows, dryRun }) }),
  history: (variantId: string) =>
    request<VariantHistoryResult>(`/api/admin/stock/yonetim/gecmis/${encodeURIComponent(variantId)}`, { cache: 'no-store' }),
};
