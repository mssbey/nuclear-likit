// Admin oturumu — `jose` ile imzalı JWT, httpOnly çerezde.
//
// İKİ KATMANLI DOĞRULAMA:
//   1. İmza (bu dosya, Edge'de de çalışır) → `src/proxy.ts` rota bazlı filtre
//      için bunu kullanır; veritabanına erişemez.
//   2. Veritabanı oturum kaydı (`Session`) → Route Handler'lar ve sunucu
//      bileşenleri `requireUser()` ile bunu doğrular. Böylece bir oturum
//      iptal edildiğinde (çıkış, parola değişimi, kullanıcı pasifleştirme)
//      jetonun süresi dolmamış olsa bile erişim anında kesilir.
//
// Bu dosyanın `db.ts` import ETMEYEN kısmı (`verifySessionToken`) bilinçli
// olarak ayrıdır; proxy yalnızca onu kullanır.

import { SignJWT, jwtVerify } from 'jose';
import { isRole, type Role } from './rbac';

export const ADMIN_COOKIE = 'na_oturum';

/** Oturum süresi: normal 8 saat, "beni hatırla" 30 gün. */
export const SESSION_SECONDS = 8 * 60 * 60;
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

export interface SessionClaims {
  /** Session tablosundaki kayıt kimliği. */
  sid: string;
  /** Kullanıcı kimliği. */
  uid: string;
  role: Role;
  email: string;
}

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET tanımlı değil veya çok kısa (en az 32 karakter). ' +
        '.env dosyasına ekleyin: openssl rand -base64 32',
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function createSessionToken(
  claims: SessionClaims,
  maxAgeSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: claims.role, email: claims.email, uid: claims.uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sid)
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .setIssuer('nefis-aroma')
    .setAudience('admin')
    .sign(secretKey());
}

/**
 * Jetonun imzasını ve süresini doğrular. Veritabanına BAKMAZ — Edge çalışma
 * zamanında (proxy) kullanılabilir olması için. Oturumun hâlâ geçerli olduğunu
 * `requireUser()` doğrular.
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'nefis-aroma',
      audience: 'admin',
    });
    const { sub, role, email, uid } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof uid !== 'string' || typeof email !== 'string') {
      return null;
    }
    if (!isRole(role)) return null;
    return { sid: sub, uid, role, email };
  } catch {
    // Süresi dolmuş, imzası bozuk veya biçimi geçersiz.
    return null;
  }
}

/** Çerez seçenekleri — tek yerden yönetilir ki üretimde `secure` unutulmasın. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
