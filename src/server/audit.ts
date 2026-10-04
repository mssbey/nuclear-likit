// Denetim kaydı (AuditLog).
//
// Sipariş, ödeme, iade, stok ve ayar değişikliklerinde ZORUNLUDUR: kim, ne
// zaman, hangi kaydın hangi alanlarını değiştirdi (öncesi/sonrası).
//
// Denetim kaydı yazımı asıl işlemi ASLA düşürmez: log yazılamazsa hata
// yutulur ve sunucu günlüğüne düşer — aksi halde bir denetim arızası
// siparişin kaydedilmesini engellerdi.

import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import type { AdminUser } from './auth/current-user';

export type AuditAction =
  | 'olustur'
  | 'guncelle'
  | 'sil'
  | 'durum-degistir'
  | 'giris'
  | 'cikis'
  | 'iade'
  | 'odeme'
  | 'stok'
  | 'ayar'
  | 'ice-aktar';

/** `{ alan: { before, after } }` — yalnızca DEĞİŞEN alanlar. */
export type FieldDiff = Record<string, { before: unknown; after: unknown }>;

/**
 * İki nesnenin sığ farkını çıkarır. Diziler ve iç içe nesneler JSON olarak
 * karşılaştırılır (sipariş adresi gibi anlık görüntü alanları için yeterli).
 */
export function diffOf(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  options: { ignore?: string[] } = {},
): FieldDiff {
  const ignore = new Set(options.ignore ?? ['updatedAt', 'version']);
  const diff: FieldDiff = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    if (ignore.has(key)) continue;
    const a = before?.[key];
    const b = after?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diff[key] = { before: a ?? null, after: b ?? null };
    }
  }
  return diff;
}

export interface AuditInput {
  user: Pick<AdminUser, 'id' | 'email'> | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  diff?: FieldDiff;
  ip?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        // Kullanıcı sonradan silinse bile kimin yaptığı kaybolmasın.
        userEmail: input.user?.email ?? '',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        diff: (input.diff ?? {}) as Prisma.InputJsonValue,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error('[denetim] kayıt yazılamadı:', err);
  }
}

/** Kısayol: öncesi/sonrası nesnelerden farkı çıkarıp yazar. */
export async function auditChange(
  input: Omit<AuditInput, 'diff'> & {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    ignore?: string[];
  },
): Promise<void> {
  const { before, after, ignore, ...rest } = input;
  await writeAudit({ ...rest, diff: diffOf(before, after, { ignore }) });
}
