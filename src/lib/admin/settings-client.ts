'use client';

// Panel mağaza/e-posta/kullanıcı ayarları için istemci sarmalayıcısı.

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

export interface StoreInfo {
  legalName: string; tradeName: string; address: string; city: string; phone: string; email: string;
  taxOffice: string; taxNumber: string; mersisNo: string; notifyEmail: string;
  /** Vitrin adresi; e-posta bağlantıları bununla kurulur. */
  siteUrl: string;
}
export interface StoreSettingsView {
  pricesIncludeTax: boolean; defaultTaxRateBps: number; shippingTaxRateBps: number;
  codSurchargeMinor: number; codMaxTotalMinor: number | null; reservationMinutes: number;
  lowStockThreshold: number; withdrawalDays: number; currency: 'TRY';
}
export interface StorePayload { info: StoreInfo; settings: StoreSettingsView }

export interface EmailSettingsView {
  provider: 'yok' | 'smtp' | 'resend';
  fromName: string; fromEmail: string; replyTo: string;
  smtp: { host: string; port: number; secure: boolean; user: string; password: string; passwordSet?: boolean };
  resend: { apiKey: string; apiKeySet?: boolean };
}
export interface EmailSettingsResponse { settings: EmailSettingsView; demoMode: boolean; encryptionConfigured: boolean }

export interface AdminUserRow { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt: string | null; createdAt: string }

export const storeSettingsApi = {
  get: () => request<StorePayload>('/api/admin/settings/magaza', { cache: 'no-store' }),
  save: (body: StorePayload) => request<StorePayload>('/api/admin/settings/magaza', { method: 'PUT', body: JSON.stringify(body) }),
};

export const emailSettingsApi = {
  get: () => request<EmailSettingsResponse>('/api/admin/settings/eposta', { cache: 'no-store' }),
  save: (settings: EmailSettingsView) => request<EmailSettingsResponse>('/api/admin/settings/eposta', { method: 'PUT', body: JSON.stringify(settings) }),
  test: (to: string) => request<{ ok: true }>('/api/admin/settings/eposta/test', { method: 'POST', body: JSON.stringify({ to }) }),
};

export const usersApi = {
  list: () => request<{ items: AdminUserRow[] }>('/api/admin/users', { cache: 'no-store' }),
  create: (body: { email: string; name: string; role: string; password: string }) =>
    request<{ user: AdminUserRow }>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; role?: string; isActive?: boolean; password?: string }) =>
    request<{ user: AdminUserRow }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
