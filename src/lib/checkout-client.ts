'use client';

// Checkout ve hesap uçları için istemci sarmalayıcısı.
// Sunucu yanıt tiplerinin istemci tarafındaki karşılıkları burada tanımlıdır;
// sunucu `src/server/orders/quote.ts` ve `create.ts` ile hizalı tutulur.

import type { AddressInput } from '@/server/customers/address-schema';
import type { PublicCustomer } from '@/server/customers/public';
import type { PublicOrder } from '@/server/orders/view';
import type { AddressView } from '@/server/customers/addresses';

export class CheckoutApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: Record<string, string> = {},
    public readonly code = 'invalid',
  ) {
    super(message);
    this.name = 'CheckoutApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await res.json().catch(() => null)) as
    | { message?: string; issues?: Record<string, string>; error?: string }
    | null;
  if (!res.ok) {
    throw new CheckoutApiError(
      payload?.message ?? `İstek başarısız (${res.status})`,
      res.status,
      payload?.issues ?? {},
      payload?.error ?? 'invalid',
    );
  }
  return payload as T;
}

export interface QuoteLine {
  productId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  sku: string;
  imageUrl: string;
  unitPriceMinor: number;
  quantity: number;
  taxRateBps: number;
  lineTotalMinor: number;
  discountMinor: number;
  netLineMinor: number;
  taxMinor: number;
}

export interface QuoteResponse {
  lines: QuoteLine[];
  totals: {
    itemsSubtotalMinor: number;
    discountTotalMinor: number;
    shippingTotalMinor: number;
    surchargeMinor: number;
    taxTotalMinor: number;
    grandTotalMinor: number;
    taxBreakdown: { rateBps: number; netMinor: number; taxMinor: number }[];
    freeShipping: boolean;
  };
  shippingOptions: {
    methodId: string;
    name: string;
    type: string;
    carrier: string | null;
    estimatedDays: string;
    priceMinor: number;
    freeReason: 'eşik' | 'kupon' | 'yöntem' | null;
  }[];
  selectedShippingId: string | null;
  coupon:
    | { ok: true; code: string; type: string; discountMinor: number; freeShipping: boolean }
    | { ok: false; reason: string }
    | null;
  /** Kod gerektirmeden otomatik uygulanan indirim kuralları. */
  appliedDiscounts: {
    id: string;
    name: string;
    type: 'sepet-yuzde' | 'x-al-y-ode';
    discountMinor: number;
  }[];
  paymentOptions: {
    id: 'kart' | 'havale' | 'kapida';
    label: string;
    description: string;
    surchargeMinor: number;
    available: boolean;
    reason: string | null;
    testMode: boolean;
    installments?: { count: number; rateBps: number; totalMinor: number; perMonthMinor: number; interestMinor: number }[];
  }[];
  selectedPayment: 'kart' | 'havale' | 'kapida' | null;
  problems: string[];
  pricesIncludeTax: boolean;
  availability: { variantId: string; requested: number; available: number }[];
}

export interface QuoteRequest {
  lines: { variantId: string; quantity: number }[];
  city?: string;
  country?: string;
  shippingMethodId?: string;
  paymentMethod?: 'kart' | 'havale' | 'kapida';
  couponCode?: string;
  email?: string;
}

export interface CreateOrderRequest {
  lines: { variantId: string; quantity: number }[];
  email: string;
  shippingAddressId?: string;
  billingAddressId?: string;
  shippingAddress?: AddressInput;
  billingSameAsShipping: boolean;
  billingAddress?: AddressInput;
  shippingMethodId: string;
  paymentMethod: 'kart' | 'havale' | 'kapida';
  couponCode?: string;
  customerNote?: string;
  installment?: number;
  consents: { distanceSales: boolean; preInfo: boolean; kvkk: boolean; marketing: boolean };
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  grandTotalMinor: number;
  reused: boolean;
  nextUrl: string | null;
  thankYouUrl: string;
}

export const checkoutApi = {
  quote: (body: QuoteRequest) =>
    request<QuoteResponse>('/api/checkout/quote', { method: 'POST', body: JSON.stringify(body) }),

  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    request<CreateOrderResponse>('/api/checkout/siparis', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(body),
    }),

  neighbourhoods: (il: string, ilce: string) =>
    request<{ mahalleler: string[] }>(
      `/api/adres/mahalleler?il=${encodeURIComponent(il)}&ilce=${encodeURIComponent(ilce)}`,
    ),

  trackOrder: (no: string, email: string) =>
    request<{ order: PublicOrder }>('/api/siparis-takibi', {
      method: 'POST',
      body: JSON.stringify({ no, email }),
    }),
};

export const accountApi = {
  me: () => request<{ customer: PublicCustomer | null }>('/api/hesap/ben', { cache: 'no-store' }),

  register: (body: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    marketingOptIn: boolean;
    kvkkAccepted: boolean;
  }) => request<{ ok: true; customer: PublicCustomer }>('/api/hesap/kayit', { method: 'POST', body: JSON.stringify(body) }),

  login: (email: string, password: string) =>
    request<{ ok: true; customer: PublicCustomer }>('/api/hesap/giris', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>('/api/hesap/cikis', { method: 'POST' }),

  updateProfile: (body: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    marketingOptIn?: boolean;
    currentPassword?: string;
    password?: string;
  }) => request<{ ok: true; customer: PublicCustomer }>('/api/hesap/ben', { method: 'PATCH', body: JSON.stringify(body) }),

  addresses: () => request<{ addresses: AddressView[] }>('/api/hesap/adresler', { cache: 'no-store' }),

  createAddress: (body: AddressInput & { type: 'teslimat' | 'fatura' }) =>
    request<{ ok: true; address: AddressView }>('/api/hesap/adresler', { method: 'POST', body: JSON.stringify(body) }),

  updateAddress: (id: string, body: AddressInput) =>
    request<{ ok: true; address: AddressView }>(`/api/hesap/adresler/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  setDefaultAddress: (id: string) =>
    request<{ ok: true }>(`/api/hesap/adresler/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ setDefault: true }),
    }),

  deleteAddress: (id: string) =>
    request<{ ok: true }>(`/api/hesap/adresler/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  orders: () => request<{ orders: PublicOrder[] }>('/api/hesap/siparisler', { cache: 'no-store' }),

  order: (no: string) =>
    request<{ order: PublicOrder }>(`/api/hesap/siparisler/${encodeURIComponent(no)}`, { cache: 'no-store' }),

  cancelOrder: (no: string) =>
    request<{ ok: true; order: PublicOrder }>(`/api/hesap/siparisler/${encodeURIComponent(no)}/iptal`, {
      method: 'POST',
    }),

  requestReturn: (no: string, body: { items: { orderItemId: string; quantity: number }[]; reason: string; description?: string }) =>
    request<{ ok: true; order: PublicOrder }>(`/api/hesap/siparisler/${encodeURIComponent(no)}/iade`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
