// Müşteri (vitrin) kimlik doğrulaması — admin oturumundan AYRI.
//
// Neden ayrı: müşteri ve panel kullanıcısı farklı tablolarda, farklı
// çerezlerde ve farklı yetki dünyalarında yaşar. Bir müşteri oturumu asla
// /admin'e, bir admin oturumu asla /hesabim'a erişim vermez.
//
// Oturum: jose imzalı JWT (`na_musteri` çerezi) + `CustomerSession` kaydı
// (iptal edilebilir). Parola: crypto.scrypt (admin ile aynı modül).
// Misafir müşteri kaydı (isGuest=true) sipariş verince oluşur; sonradan parola
// belirleyerek hesaba dönüşür — sipariş geçmişi korunur.

import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { db } from '../db';
import { currentStore } from '../store-context';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/password';
import { checkLock, recordAttempt } from '../auth/rate-limit';
import { queueEmail } from '../notifications/email';

export const CUSTOMER_COOKIE = 'na_musteri';
const SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 gün — vitrin oturumu uzun ömürlü

export interface CustomerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  marketingOptIn: boolean;
  sessionId: string;
}

export class CustomerAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 409 | 422 | 429 = 401,
    public readonly issues: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'CustomerAuthError';
  }
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET tanımlı değil veya çok kısa.');
  return new TextEncoder().encode(secret);
}

async function issueSession(customerId: string) {
  const session = await db.customerSession.create({
    data: { customerId, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) },
  });
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ cid: customerId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.id)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_SECONDS)
    .setIssuer('nefis-aroma')
    .setAudience('musteri')
    .sign(secretKey());

  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

/** Geçerli müşteri; oturum yoksa veya iptal edildiyse null. İstek başına teklenir. */
export const getCurrentCustomer = cache(async (): Promise<CustomerUser | null> => {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  let sid: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'nefis-aroma',
      audience: 'musteri',
    });
    sid = payload.sub;
  } catch {
    return null;
  }
  if (!sid) return null;

  const session = await db.customerSession.findUnique({
    where: { id: sid },
    include: { customer: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (session.customer.anonymizedAt) return null;
  // Başka mağazanın hesabı bu vitrinde oturum açmış sayılmaz.
  if (session.customer.store !== currentStore()) return null;

  const c = session.customer;
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    marketingOptIn: c.marketingOptIn,
    sessionId: session.id,
  };
});

export async function requireCustomer(): Promise<CustomerUser> {
  const c = await getCurrentCustomer();
  if (!c) throw new CustomerAuthError('Bu işlem için giriş yapmalısınız.', 401);
  return c;
}

// ------------------------------------------------------------------ kayıt ---

export const registerSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta girin').max(200),
  password: z.string().max(200),
  firstName: z.string().trim().min(2, 'Ad en az 2 karakter').max(60),
  lastName: z.string().trim().min(2, 'Soyad en az 2 karakter').max(60),
  phone: z.string().trim().max(20).optional(),
  /** KVKK açık rıza — ayrı ve isteğe bağlı. */
  marketingOptIn: z.boolean().default(false),
  /** Aydınlatma metnini okuduğunu onaylamak zorunlu. */
  kvkkAccepted: z.literal(true, { errorMap: () => ({ message: 'KVKK aydınlatma metnini onaylamalısınız' }) }),
});

export async function registerCustomer(raw: unknown): Promise<CustomerUser> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: Record<string, string> = {};
    for (const i of parsed.error.issues) issues[i.path.join('.')] ||= i.message;
    throw new CustomerAuthError('Formda hatalı alanlar var.', 422, issues);
  }
  const input = parsed.data;
  const problem = passwordProblem(input.password);
  if (problem) throw new CustomerAuthError(problem, 422, { password: problem });

  const email = input.email.toLocaleLowerCase('tr');
  const existing = await db.customer.findUnique({ where: { store_email: { store: currentStore(), email } } });

  if (existing && !existing.isGuest) {
    throw new CustomerAuthError('Bu e-posta ile zaten bir hesap var. Giriş yapın.', 409, {
      email: 'Bu e-posta kayıtlı',
    });
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  // Misafir kaydı varsa hesaba dönüştür — sipariş geçmişi korunur.
  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          isGuest: false,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone || existing.phone,
          ...(input.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: now } : {}),
        },
      })
    : await db.customer.create({
        data: {
          store: currentStore(),
          email,
          passwordHash,
          isGuest: false,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone || null,
          tags: [],
          marketingOptIn: input.marketingOptIn,
          marketingOptInAt: input.marketingOptIn ? now : null,
        },
      });

  await issueSession(customer.id);
  await queueEmail({
    to: email,
    template: 'hesap-olusturuldu',
    vars: {
      musteriAdi: `${customer.firstName} ${customer.lastName}`.trim(),
      hesapLinki: '{{siteUrl}}/hesabim',
    },
  });

  return (await getCurrentCustomer())!;
}

// ------------------------------------------------------------------ giriş ---

const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function loginCustomer(
  rawEmail: string,
  password: string,
  ip: string,
): Promise<CustomerUser> {
  const email = rawEmail.trim().toLocaleLowerCase('tr');
  if (!email || !password) throw new CustomerAuthError('E-posta ve parola gerekli.', 400);

  const lock = await checkLock(`musteri:${email}`, ip);
  if (lock.locked) {
    throw new CustomerAuthError(
      `Çok fazla hatalı deneme. ${lock.minutesLeft} dakika sonra tekrar deneyin.`,
      429,
    );
  }

  const customer = await db.customer.findUnique({ where: { store_email: { store: currentStore(), email } } });
  const ok = await verifyPassword(password, customer?.passwordHash ?? DUMMY_HASH);

  if (!customer || !customer.passwordHash || !ok || customer.anonymizedAt) {
    await recordAttempt(`musteri:${email}`, ip, false);
    throw new CustomerAuthError('E-posta veya parola hatalı.', 401);
  }

  await recordAttempt(`musteri:${email}`, ip, true);
  await issueSession(customer.id);
  return (await getCurrentCustomer())!;
}

export async function logoutCustomer(): Promise<void> {
  const current = await getCurrentCustomer();
  if (current) {
    await db.customerSession
      .update({ where: { id: current.sessionId }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

/** Parola değişince diğer tüm oturumlar kapanır. */
export async function changeCustomerPassword(
  customerId: string,
  currentPassword: string,
  nextPassword: string,
  keepSessionId: string,
): Promise<void> {
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c?.passwordHash || !(await verifyPassword(currentPassword, c.passwordHash))) {
    throw new CustomerAuthError('Mevcut parola hatalı.', 422, { currentPassword: 'Mevcut parola hatalı' });
  }
  const problem = passwordProblem(nextPassword);
  if (problem) throw new CustomerAuthError(problem, 422, { password: problem });

  await db.customer.update({
    where: { id: customerId },
    data: { passwordHash: await hashPassword(nextPassword) },
  });
  await db.customerSession.updateMany({
    where: { customerId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  });
}
