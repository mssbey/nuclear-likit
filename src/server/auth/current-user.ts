// Geçerli admin kullanıcısı — Route Handler'lar ve sunucu bileşenleri için.
//
// Buradaki kontrol ASIL kontroldür: `src/proxy.ts` yalnızca jetonun imzasına
// bakan kaba bir filtredir; oturumun iptal edilip edilmediğini, kullanıcının
// hâlâ aktif olup olmadığını ve işlem bazlı izni burada doğrularız.

import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db } from '../db';
import { can, type Permission, type Role } from './rbac';
import { ADMIN_COOKIE, verifySessionToken } from './session';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
}

/** Yetki hatası — Route Handler'lar bunu HTTP yanıtına çevirir. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Oturumu çözer; geçersizse `null` döner. İstek başına teklenir.
 */
export const getCurrentUser = cache(async (): Promise<AdminUser | null> => {
  const store = await cookies();
  const claims = await verifySessionToken(store.get(ADMIN_COOKIE)?.value);
  if (!claims) return null;

  // Jeton imzası geçerli olsa bile oturum iptal edilmiş olabilir.
  const session = await db.session.findUnique({
    where: { id: claims.sid },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    // Rol jetondan değil VERİTABANINDAN okunur: rol değişikliği anında geçerli olur.
    role: session.user.role as Role,
    sessionId: session.id,
  };
});

/** Oturum yoksa 401 fırlatır. */
export async function requireUser(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Bu işlem için giriş yapmalısınız.', 401);
  return user;
}

/** Oturum yoksa 401, izin yoksa 403 fırlatır. */
export async function requirePermission(permission: Permission): Promise<AdminUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthError(
      `Bu işlem için yetkiniz yok (${permission}). Rolünüz: ${user.role}.`,
      403,
    );
  }
  return user;
}
