'use client';

// Panel medya kütüphanesi uçları için istemci sarmalayıcısı.

import { ApiError } from './client';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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

export interface AdminMediaAsset {
  id: string; path: string; fileName: string; mimeType: string; sizeBytes: number;
  width: number | null; height: number | null; alt: string; tags: string[]; createdAt: string;
}
export interface MediaListResult { items: AdminMediaAsset[]; total: number; page: number; pageSize: number; pageCount: number }
export interface MediaListParams { q?: string; tag?: string; page?: number; pageSize?: number }

function qs<T extends object>(p: T): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return sp.toString();
}

// Vercel sunucusuz fonksiyonları 4,5 MB'tan büyük istek gövdesini platform
// katmanında 413 ile reddeder (uç hiç çalışmaz). Bu yüzden büyük ya da çok
// yüksek çözünürlüklü görseller yüklemeden ÖNCE tarayıcıda küçültülüp WebP'ye
// çevrilir — vitrin için de 2400 px fazlasıyla yeterli.
const SAFE_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE = 2400;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Gerekirse görseli küçültür; küçük dosyalar ve SVG olduğu gibi döner. */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // Tarayıcı çözemezse sunucu doğrulasın.
  }
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (file.size <= SAFE_BYTES && longEdge <= MAX_EDGE) {
    bitmap.close();
    return file;
  }

  let edge = Math.min(longEdge, MAX_EDGE);
  let quality = 0.86;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = edge / longEdge;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (blob && blob.size <= SAFE_BYTES) break;
    quality = Math.max(0.6, quality - 0.1);
    edge = Math.round(edge * 0.8);
  }
  bitmap.close();
  if (!blob || blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, '') || 'gorsel';
  return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
}

export const mediaApi = {
  list: (p: MediaListParams) => request<MediaListResult>(`/api/admin/media?${qs(p)}`, { cache: 'no-store' }),
  upload: async (file: File) => {
    const prepared = await prepareImageForUpload(file);
    if (prepared.size > 4.4 * 1024 * 1024) {
      throw new ApiError(`Dosya çok büyük (${(prepared.size / 1024 / 1024).toFixed(1)} MB). En fazla 4 MB yüklenebilir.`, 413);
    }
    const form = new FormData();
    form.set('file', prepared);
    try {
      return await request<{ asset: AdminMediaAsset }>('/api/admin/media', { method: 'POST', body: form });
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) {
        throw new ApiError('Dosya sunucu sınırını aşıyor. Görseli küçültüp tekrar deneyin.', 413);
      }
      throw err;
    }
  },
  update: (id: string, body: { alt: string; tags: string[] }) =>
    request<{ asset: AdminMediaAsset }>(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  remove: (id: string) => request<{ ok: true }>(`/api/admin/media/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
