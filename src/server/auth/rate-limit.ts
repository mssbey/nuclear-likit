// Giriş denemesi oran sınırı — kaba kuvvet saldırılarına karşı.
//
// Sayaç veritabanında (`LoginAttempt`) tutulur; bellekte tutulsaydı sunucu
// yeniden başladığında veya birden çok örnek çalıştığında sıfırlanırdı.
//
// Kural: aynı e-posta VEYA aynı IP için son 15 dakikada 5 başarısız deneme →
// 15 dakika kilit. Başarılı giriş o e-postanın sayacını sıfırlar.

import 'server-only';
import { db } from '../db';

export const MAX_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;

export interface LockState {
  locked: boolean;
  /** Kalan kilit süresi (dakika) — kullanıcıya gösterilir. */
  minutesLeft: number;
  remainingAttempts: number;
}

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
}

export async function checkLock(email: string, ip: string): Promise<LockState> {
  const since = windowStart();
  const normalized = email.trim().toLocaleLowerCase('tr');

  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.findMany({
      where: { email: normalized, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.loginAttempt.findMany({
      where: { ip, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const worst = byEmail.length >= byIp.length ? byEmail : byIp;
  if (worst.length < MAX_ATTEMPTS) {
    return {
      locked: false,
      minutesLeft: 0,
      remainingAttempts: MAX_ATTEMPTS - worst.length,
    };
  }

  // Kilit, sınırı aşan denemeden itibaren pencere süresi kadar sürer.
  const oldestCounted = worst[MAX_ATTEMPTS - 1].createdAt.getTime();
  const unlockAt = oldestCounted + WINDOW_MINUTES * 60 * 1000;
  const minutesLeft = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));

  return { locked: true, minutesLeft, remainingAttempts: 0 };
}

export async function recordAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  const normalized = email.trim().toLocaleLowerCase('tr');
  await db.loginAttempt.create({ data: { email: normalized, ip, success } });

  if (success) {
    // Başarılı girişte o e-postanın başarısız geçmişi temizlenir.
    await db.loginAttempt.deleteMany({ where: { email: normalized, success: false } });
  }
}

/** Eski kayıtları temizler — bakım betiği veya giriş ucundan seyrek çağrılır. */
export async function pruneAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await db.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

/** İstekten istemci IP'sini çıkarır. Ters vekil arkasında `x-forwarded-for` kullanılır. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'bilinmiyor';
}
