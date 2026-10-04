'use client';

// Panel ödeme uçları için istemci sarmalayıcısı.

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

export type PaymentsView = 'tumu' | 'basarisiz' | 'mutabakat' | 'iadeler' | 'webhooks';

export interface PaymentsListParams {
  view?: PaymentsView;
  provider?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PaymentRow {
  id: string; orderId: string; orderNumber: string; orderStatus: string; provider: string; providerPaymentId: string | null;
  status: string; amountMinor: number; installment: number; cardBrand: string | null; cardLast4: string | null; threeDS: boolean;
  errorMessage: string | null; createdAt: string; capturedAt: string | null;
}
export interface RefundRow {
  id: string; orderId: string; orderNumber: string; amountMinor: number; type: string; status: string; reason: string | null;
  providerRefundId: string | null; by: string; createdAt: string; completedAt: string | null;
}
export interface WebhookRow { id: string; provider: string; externalId: string; processedAt: string | null; error: string | null; createdAt: string; payload: unknown }
export interface ReconRow {
  id: string; orderNumber: string; placedAt: string; status: string; paymentStatus: string; paymentMethod: string;
  grandTotalMinor: number; paidMinor: number; refundedTotalMinor: number; diffMinor: number;
}

export interface PaymentsListResult<T> {
  view: PaymentsView; total: number; page: number; pageSize: number; pageCount: number; items: T[];
  summary?: { status: string; count: number; amountMinor: number }[];
}

function qs(p: PaymentsListParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

export interface PaymentSettingsView {
  cardProvider: 'mock' | 'iyzico' | 'paytr' | 'stripe';
  methods: { id: 'kart' | 'havale' | 'kapida'; enabled: boolean }[];
  limits: Record<'kart' | 'havale' | 'kapida', { minMinor: number | null; maxMinor: number | null }>;
  require3DS: boolean;
  installments: unknown[];
  iyzico: { enabled: boolean; mode: 'test' | 'live'; apiKey: string; apiKeySet?: boolean; secretKey: string; secretKeySet?: boolean };
  paytr: { enabled: boolean; mode: 'test' | 'live'; merchantId: string; merchantKey: string; merchantKeySet?: boolean; merchantSalt: string; merchantSaltSet?: boolean };
  stripe: { enabled: boolean; mode: 'test' | 'live'; publishableKey: string; secretKey: string; secretKeySet?: boolean; webhookSecret: string; webhookSecretSet?: boolean };
  havale: { enabled: boolean; bankName: string; accountHolder: string; iban: string; instructions: string };
}
export interface PaymentSettingsResponse { settings: PaymentSettingsView; demoMode: boolean; encryptionConfigured: boolean }

export const paymentsApi = {
  list: <T,>(p: PaymentsListParams) => request<PaymentsListResult<T>>(`/api/admin/payments?${qs(p)}`, { cache: 'no-store' }),
  getSettings: () => request<PaymentSettingsResponse>('/api/admin/settings/odeme', { cache: 'no-store' }),
  saveSettings: (s: PaymentSettingsView) => request<PaymentSettingsResponse>('/api/admin/settings/odeme', { method: 'PUT', body: JSON.stringify(s) }),
};
