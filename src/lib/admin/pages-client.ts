'use client';

// Panel içerik sayfaları (SSS, kampanya bandı, üst menü, mega menü) uçları için istemci sarmalayıcısı.

import { ApiError, fetchWithRetry } from './client';
import type { MegaMenuContent } from '@/lib/mega-menu';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
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

export interface FaqItem { q: string; a: string }
export interface FaqGroup { heading: string; items: FaqItem[] }
export interface FaqContent { groups: FaqGroup[] }

export interface CampaignContent {
  eyebrow: string; title: string; description: string; code: string; codeNote: string;
  cta: { label: string; href: string }; image: string;
}

export interface NavMenuLink { label: string; href: string; emphasis: boolean }
export interface NavMenuContent { links: NavMenuLink[] }

export const pagesApi = {
  getFaq: () => request<FaqContent>('/api/admin/pages/sss', { cache: 'no-store' }),
  saveFaq: (body: FaqContent) => request<FaqContent>('/api/admin/pages/sss', { method: 'PUT', body: JSON.stringify(body) }),
  getCampaign: () => request<CampaignContent>('/api/admin/pages/kampanya', { cache: 'no-store' }),
  saveCampaign: (body: CampaignContent) => request<CampaignContent>('/api/admin/pages/kampanya', { method: 'PUT', body: JSON.stringify(body) }),
  getNavMenu: () => request<NavMenuContent>('/api/admin/pages/menu', { cache: 'no-store' }),
  saveNavMenu: (body: NavMenuContent) => request<NavMenuContent>('/api/admin/pages/menu', { method: 'PUT', body: JSON.stringify(body) }),
  /** Kayıt yoksa null — editör kategori ağacından varsayılanı kurar. */
  getMegaMenu: () => request<MegaMenuContent | null>('/api/admin/pages/mega-menu', { cache: 'no-store' }),
  saveMegaMenu: (body: MegaMenuContent) => request<MegaMenuContent>('/api/admin/pages/mega-menu', { method: 'PUT', body: JSON.stringify(body) }),
};
