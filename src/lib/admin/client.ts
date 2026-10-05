'use client';

// Admin arayüzü → Route Handler istemci sarmalayıcısı.

import type {
  AdminCategory,
  AdminCollection,
  AdminProduct,
  CatalogFile,
} from '@/types/admin';
import type { Permission, Role } from '@/server/auth/rbac';
import type { BulkAction } from './mutations';
import type { PriceAdjustInput } from './pricing';
import type { FlavorProfileDef } from '@/lib/flavor-profiles';
import type { TrashItemView as TrashItem } from '@/server/catalog/trash';
import type { StoreId } from '@/lib/stores';

export type { TrashItem };

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      (payload && typeof payload.message === 'string' && payload.message) ||
      `İstek başarısız (${res.status})`;
    throw new ApiError(message, res.status, payload?.issues ?? {});
  }
  return payload as T;
}

export interface CatalogResponse {
  catalog: CatalogFile;
  meta: { user: AdminSessionUser; permissions: Permission[]; store: StoreId; storeUrl: string };
}

export const adminApi = {
  loadCatalog: () => request<CatalogResponse>('/api/admin/catalog', { cache: 'no-store' }),

  /** Panelde yönetilen mağazayı değiştirir (çerez). */
  setStore: (store: StoreId) =>
    request<{ store: StoreId }>('/api/admin/magaza', { method: 'POST', body: JSON.stringify({ store }) }),

  createProduct: (product: AdminProduct) =>
    request<{ product: AdminProduct }>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(product),
    }),

  updateProduct: (id: string, patch: Partial<AdminProduct>) =>
    request<{ product: AdminProduct }>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  /** WordPress'teki "Çoğalt": taslak bir kopya üretir. */
  duplicateProduct: (id: string) =>
    request<{ product: AdminProduct }>(
      `/api/admin/products/${encodeURIComponent(id)}/cogalt`,
      { method: 'POST' },
    ),

  deleteProduct: (id: string) =>
    request<{ ok: true }>(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listTrash: () => request<{ items: TrashItem[] }>('/api/admin/cop-kutusu', { cache: 'no-store' }),

  restoreFromTrash: (id: string) =>
    request<{ product: AdminProduct }>(`/api/admin/cop-kutusu/${encodeURIComponent(id)}`, { method: 'POST' }),

  purgeFromTrash: (id: string) =>
    request<{ ok: true }>(`/api/admin/cop-kutusu/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  emptyTrash: () => request<{ ok: true; count: number }>('/api/admin/cop-kutusu', { method: 'DELETE' }),

  adjustPrices: (input: PriceAdjustInput) =>
    request<{
      ok: true;
      products: number;
      variants: number;
      skipped: number;
      sample: { before: number; after: number } | null;
    }>('/api/admin/products/fiyat', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  bulkProducts: (op: BulkAction) =>
    request<{ ok: true }>('/api/admin/products/bulk', {
      method: 'POST',
      body: JSON.stringify(op),
    }),

  saveCategory: (category: AdminCategory) =>
    request<{ category: AdminCategory }>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    }),

  updateCategory: (id: string, patch: Partial<AdminCategory>) =>
    request<{ category: AdminCategory }>(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteCategory: (id: string) =>
    request<{ ok: true }>(`/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  reorderCategories: (orderedIds: string[]) =>
    request<{ categories: AdminCategory[] }>('/api/admin/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds }),
    }),

  saveCollection: (collection: AdminCollection) =>
    request<{ collection: AdminCollection }>('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify(collection),
    }),

  updateCollection: (id: string, patch: Partial<AdminCollection>) =>
    request<{ collection: AdminCollection }>(`/api/admin/collections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteCollection: (id: string) =>
    request<{ ok: true }>(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  reorderCollections: (orderedIds: string[]) =>
    request<{ collections: AdminCollection[] }>('/api/admin/collections/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds }),
    }),

  importCatalog: (format: 'json' | 'csv', data: string) =>
    request<Record<string, unknown>>('/api/admin/settings/import', {
      method: 'POST',
      body: JSON.stringify({ format, data }),
    }),

  resetCatalog: () =>
    request<{ ok: true; products: number }>('/api/admin/settings/reset', { method: 'POST' }),

  login: (email: string, password: string, remember = false) =>
    request<{ ok: true; user: AdminSessionUser & { permissions: Permission[] } }>(
      '/api/admin/auth',
      { method: 'POST', body: JSON.stringify({ email, password, remember }) },
    ),

  loadFlavorProfiles: () =>
    request<{ profiles: FlavorProfileDef[] }>('/api/admin/flavor-profiles', { cache: 'no-store' }),

  saveFlavorProfiles: (profiles: FlavorProfileDef[]) =>
    request<{ profiles: FlavorProfileDef[] }>('/api/admin/flavor-profiles', {
      method: 'PUT',
      body: JSON.stringify({ profiles }),
    }),

  logout: () => request<{ ok: true }>('/api/admin/auth', { method: 'DELETE' }),

  session: () =>
    request<{ user: AdminSessionUser & { permissions: Permission[] } }>('/api/admin/auth', {
      cache: 'no-store',
    }),
};
