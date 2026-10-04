// Panel > Görseller — medya kütüphanesi. Dosyalar `data/uploads/YYYY/MM/`
// altına yazılır (SQLite ile aynı dizin — bkz. `server/db.ts`) ve
// `/api/medya/[...path]/route.ts` üzerinden servis edilir.
//
// NEDEN `public/` DEĞİL: Next'in `next start` (üretim) sunucusu `public/`
// klasörünü derleme (`next build`) anında çıkardığı bir dosya listesiyle
// sunar — ÇALIŞMA ZAMANINDA eklenen dosyalar `public/` altına yazılsa bile
// 404 döner (yeniden derleme gerekir). Bu yüzden gerçek dosya çalışma zamanı
// diskten okuyan bir Route Handler'dan servis edilir; bu her modda çalışır.
//
// DAĞITIM: Vercel gibi sunucusuz ortamlarda dosya sistemi kalıcı DEĞİLDİR.
// Blob deposu bağlıysa (`BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN`) dosyalar Vercel Blob'a yazılır ve
// `path` alanı mutlak (https://…public.blob.vercel-storage.com/…) URL olur;
// tanımlı değilse (yerel geliştirme) yukarıdaki disk yolu kullanılır.

import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del as blobDelete, put as blobPut } from '@vercel/blob';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { auditChange } from '../audit';
import type { AdminUser } from '../auth/current-user';
import { jsonArray } from '../catalog/mapping';

export class MediaAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 413 | 415 | 422 = 422,
  ) {
    super(message);
    this.name = 'MediaAdminError';
  }
}

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Vercel Blob yapılandırılmış mı — yoksa yerel diske yazılır.
 * Depo projeye bağlanınca Vercel `BLOB_STORE_ID` verir; SDK kimliği çalışma
 * zamanındaki OIDC token'ından alır. Klasik `BLOB_READ_WRITE_TOKEN` da geçerli.
 */
function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** `data/uploads` — SQLite ile aynı dizin; `.gitignore`'da `/data/` altında. */
export function uploadsRoot(): string {
  return path.join(process.cwd(), 'data', 'uploads');
}

/**
 * `/api/medya/<...>` altındaki path parçalarını diskteki dosyaya çevirir.
 * `..`/mutlak yol içeren parçaları reddeder (dizin dışına çıkışı engeller).
 */
export function resolveUploadDiskPath(segments: string[]): string | null {
  if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))) return null;
  return path.join(uploadsRoot(), ...segments);
}

export interface AdminMediaAsset {
  id: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  tags: string[];
  createdAt: string;
}

function toView(row: {
  id: string; path: string; fileName: string; mimeType: string; sizeBytes: number;
  width: number | null; height: number | null; alt: string; tags: unknown; createdAt: Date;
}): AdminMediaAsset {
  return {
    id: row.id, path: row.path, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes,
    width: row.width, height: row.height, alt: row.alt, tags: jsonArray<string>(row.tags), createdAt: row.createdAt.toISOString(),
  };
}

function slugifyBase(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const TR: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u' };
  const ascii = base.replace(/[ıİşŞğĞçÇöÖüÜ]/g, (ch) => TR[ch] ?? ch);
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'dosya';
}

export interface MediaListParams {
  q?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export async function listMediaAssets(params: MediaListParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 40));
  const where: Prisma.MediaAssetWhereInput = {};
  if (params.q) where.OR = [{ fileName: { contains: params.q } }, { alt: { contains: params.q } }];

  const [total, rows] = await Promise.all([
    db.mediaAsset.count({ where }),
    db.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const filtered = params.tag ? rows.filter((r) => jsonArray<string>(r.tags).includes(params.tag!)) : rows;
  return { items: filtered.map(toView), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function uploadMediaAsset(file: File, actor: AdminUser, ip: string | null): Promise<AdminMediaAsset> {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) throw new MediaAdminError(`Desteklenmeyen dosya türü: ${file.type || 'bilinmiyor'}. İzin verilenler: JPG, PNG, WEBP, AVIF, SVG.`, 415);
  if (file.size > MAX_BYTES) throw new MediaAdminError(`Dosya çok büyük (en fazla ${MAX_BYTES / 1024 / 1024} MB).`, 413);
  if (file.size === 0) throw new MediaAdminError('Boş dosya yüklenemez.');

  const buffer = Buffer.from(await file.arrayBuffer());
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = randomBytes(4).toString('hex');
  const fileName = `${slugifyBase(file.name)}-${rand}.${ext}`;
  const relPath = path.posix.join(yyyy, mm, fileName);

  let storedPath: string;
  if (blobEnabled()) {
    // Dosya adı zaten rastgele son ek taşıyor; Blob'un kendi son ekine gerek yok.
    const blob = await blobPut(`uploads/${relPath}`, buffer, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });
    storedPath = blob.url;
  } else {
    const absDir = path.join(uploadsRoot(), yyyy, mm);
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, fileName), buffer);
    storedPath = `/api/medya/${relPath}`;
  }

  let width: number | null = null;
  let height: number | null = null;
  if (ext !== 'svg') {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // Boyut okunamazsa sorun değil — yalnız görüntüleme bilgisi.
    }
  }

  const row = await db.mediaAsset.create({
    data: {
      path: storedPath,
      fileName: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      width,
      height,
      alt: '',
      tags: [] as unknown as Prisma.InputJsonValue,
      createdByUserId: actor.id,
    },
  });

  await auditChange({ user: actor, action: 'olustur', entityType: 'MediaAsset', entityId: row.id, after: { path: row.path, fileName: row.fileName }, ip });
  return toView(row);
}

export const mediaMetaSchema = z.object({
  alt: z.string().trim().max(200).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
});

export async function updateMediaAsset(id: string, raw: unknown, actor: AdminUser, ip: string | null): Promise<AdminMediaAsset> {
  const input = mediaMetaSchema.parse(raw);
  const current = await db.mediaAsset.findUnique({ where: { id } });
  if (!current) throw new MediaAdminError('Görsel bulunamadı.', 404);

  const row = await db.mediaAsset.update({ where: { id }, data: { alt: input.alt, tags: input.tags as unknown as Prisma.InputJsonValue } });
  await auditChange({ user: actor, action: 'guncelle', entityType: 'MediaAsset', entityId: id, before: { alt: current.alt }, after: { alt: input.alt, tags: input.tags }, ip });
  return toView(row);
}

export async function deleteMediaAsset(id: string, actor: AdminUser, ip: string | null): Promise<void> {
  const current = await db.mediaAsset.findUnique({ where: { id } });
  if (!current) throw new MediaAdminError('Görsel bulunamadı.', 404);

  await db.mediaAsset.delete({ where: { id } });
  try {
    if (/^https?:\/\//.test(current.path)) {
      if (blobEnabled()) await blobDelete(current.path);
    } else {
      const segments = current.path.replace(/^\/api\/medya\//, '').split('/');
      const abs = resolveUploadDiskPath(segments);
      if (abs) await unlink(abs);
    }
  } catch {
    // Dosya zaten yoksa sorun değil — kayıt yine de silindi.
  }
  await auditChange({ user: actor, action: 'sil', entityType: 'MediaAsset', entityId: id, before: { path: current.path }, ip });
}
