// Vitrin önizleme bağlantıları — panel (client) ve Route Handler ortak kullanır.
//
// Kural: yayındaki ürün doğrudan vitrin adresine gider; taslak/arşiv ürün ise
// `/api/admin/preview` üzerinden Draft Mode çerezi alıp vitrine yönlendirilir.
// Vitrin bu çerezi görünce yayında olmayan ürünü de render eder (bkz.
// src/app/urun/[slug]/page.tsx).

import type { ProductStatus } from '@/types/admin';

export const PREVIEW_ENDPOINT = '/api/admin/preview';

/** Ürünün vitrin yolu (origin'siz). */
export function storefrontPath(slug: string): string {
  return `/urun/${encodeURIComponent(slug)}`;
}

/** Ürünün panel düzenleme yolu. */
export function editorPath(slug: string): string {
  return `/admin/urunler/${encodeURIComponent(slug)}`;
}

/** Draft Mode'u açıp vitrine yönlendiren uç. */
export function previewPath(slug: string): string {
  return `${PREVIEW_ENDPOINT}?slug=${encodeURIComponent(slug)}`;
}

/** Draft Mode'u kapatıp `geri` yoluna dönen uç. */
export function previewExitPath(back: string): string {
  return `${PREVIEW_ENDPOINT}?cikis=1&geri=${encodeURIComponent(back)}`;
}

/**
 * Panelde "vitrinde aç" düğmesinin hedefi. Yayındaki ürün için Draft Mode
 * gereksizdir; doğrudan gerçek adres açılır ki müşterinin gördüğü sayfa görülsün.
 */
export function openInStorefrontPath(slug: string, status: ProductStatus): string {
  return status === 'yayında' ? storefrontPath(slug) : previewPath(slug);
}

/** Yalnızca site içi, tek eğik çizgiyle başlayan yollara izin ver (açık yönlendirme koruması). */
export function safeInternalPath(candidate: string | null, fallback: string): string {
  if (!candidate) return fallback;
  // "//host" ve "/\host" biçimleri tarayıcıda protokol-göreli adrese dönüşür.
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return fallback;
  }
  return candidate;
}
