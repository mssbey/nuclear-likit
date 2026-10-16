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
// Google/Apple girişi: bkz. ./oauth.ts. Her iki kayıt yolu da Üyelik Sözleşmesi
// ve KVKK onayını zorunlu tutar; onaylanan sürümler `consents`e yazılır.

import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { db } from '../db';
import { currentStore } from '../store-context';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/password';
import { checkLock, recordAttempt } from '../auth/rate-limit';
import { queueEmail } from '../notifications/email';
import { buildSignupConsents, type SignupChannel } from './signup-legal';

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
  /** Yalnız Google/Apple ile üye olanlarda false — parola sıfırlama ile belirlenir. */
  hasPassword: boolean;
  linkedProviders: ('google' | 'apple')[];
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

export async function issueSession(customerId: string) {
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
    hasPassword: Boolean(c.passwordHash),
    linkedProviders: [...(c.googleSub ? (['google'] as const) : []), ...(c.appleSub ? (['apple'] as const) : [])],
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
  kvkkAccepted: z.literal(true, { errorMap: () => ({ message: "KVKK Aydınlatma Metni'ni onaylamalısınız" }) }),
  /** Üyelik sözleşmesi (18 yaş beyanı dahil) kabulü zorunlu. */
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "Üyelik Sözleşmesi'ni kabul etmelisiniz" }) }),
});

function formIssues(error: z.ZodError): CustomerAuthError {
  const issues: Record<string, string> = {};
  for (const i of error.issues) issues[i.path.join('.')] ||= i.message;
  return new CustomerAuthError('Formda hatalı alanlar var.', 422, issues);
}

/** Kayıtlı hesabın hangi yolla giriş yaptığını söyleyen mesaj. */
function existingAccountMessage(c: { passwordHash: string | null; googleSub: string | null; appleSub: string | null }): string {
  if (!c.passwordHash && c.googleSub) return 'Bu e-posta Google hesabıyla kayıtlı. "Google ile devam et" ile giriş yapın.';
  if (!c.passwordHash && c.appleSub) return 'Bu e-posta Apple hesabıyla kayıtlı. "Apple ile devam et" ile giriş yapın.';
  return 'Bu e-posta ile zaten bir hesap var. Giriş yapın veya parolanızı sıfırlayın.';
}

interface NewMember {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  marketingOptIn: boolean;
  channel: SignupChannel;
  ip: string;
  passwordHash?: string;
  googleSub?: string;
  appleSub?: string;
  emailVerified?: boolean;
}

/** Yeni üyelik açar veya misafir kaydını üyeliğe dönüştürür; oturum açar. */
async function createMember(m: NewMember): Promise<CustomerUser> {
  const store = currentStore();
  const existing = await db.customer.findUnique({ where: { store_email: { store, email: m.email } } });
  if (existing && !existing.isGuest) {
    throw new CustomerAuthError(existingAccountMessage(existing), 409, { email: 'Bu e-posta kayıtlı' });
  }

  const now = new Date();
  const common = {
    isGuest: false,
    firstName: m.firstName,
    lastName: m.lastName,
    consents: await buildSignupConsents(m.channel, m.marketingOptIn, m.ip),
    ...(m.passwordHash ? { passwordHash: m.passwordHash } : {}),
    ...(m.googleSub ? { googleSub: m.googleSub } : {}),
    ...(m.appleSub ? { appleSub: m.appleSub } : {}),
    ...(m.emailVerified ? { emailVerifiedAt: now } : {}),
  };
  // Misafir kaydı varsa hesaba dönüştür — sipariş geçmişi korunur.
  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        data: {
          ...common,
          phone: m.phone || existing.phone,
          ...(m.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: now } : {}),
        },
      })
    : await db.customer.create({
        data: {
          ...common,
          store,
          email: m.email,
          phone: m.phone || null,
          tags: [],
          marketingOptIn: m.marketingOptIn,
          marketingOptInAt: m.marketingOptIn ? now : null,
        },
      });

  await issueSession(customer.id);
  await queueEmail({
    to: m.email,
    template: 'hesap-olusturuldu',
    vars: {
      musteriAdi: `${customer.firstName} ${customer.lastName}`.trim(),
      hesapLinki: '{{siteUrl}}/hesabim',
    },
  });

  return (await getCurrentCustomer())!;
}

export async function registerCustomer(raw: unknown, ip: string): Promise<CustomerUser> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) throw formIssues(parsed.error);
  const input = parsed.data;
  const problem = passwordProblem(input.password);
  if (problem) throw new CustomerAuthError(problem, 422, { password: problem });

  return createMember({
    email: input.email.toLocaleLowerCase('tr'),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    marketingOptIn: input.marketingOptIn,
    channel: 'eposta',
    ip,
    passwordHash: await hashPassword(input.password),
  });
}

/** Google/Apple ile gelen kimlik: sözleşmeler onaylanınca üyelik açılır. */
export const socialSignupSchema = registerSchema.pick({
  firstName: true,
  lastName: true,
  marketingOptIn: true,
  kvkkAccepted: true,
  termsAccepted: true,
});

export async function completeSocialSignup(
  identity: { p: 'google' | 'apple'; sub: string; email: string },
  raw: unknown,
  ip: string,
): Promise<CustomerUser> {
  const parsed = socialSignupSchema.safeParse(raw);
  if (!parsed.success) throw formIssues(parsed.error);
  const input = parsed.data;
  return createMember({
    email: identity.email,
    firstName: input.firstName,
    lastName: input.lastName,
    marketingOptIn: input.marketingOptIn,
    channel: identity.p,
    ip,
    emailVerified: true,
    ...(identity.p === 'google' ? { googleSub: identity.sub } : { appleSub: identity.sub }),
  });
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

  // Parolası olmayan sosyal hesap: doğru giriş yolunu göster (kayıt formu da
  // aynı bilgiyi verir, yeni bir sızıntı değildir).
  if (customer && !customer.isGuest && !customer.passwordHash && !customer.anonymizedAt && (customer.googleSub || customer.appleSub)) {
    throw new CustomerAuthError(
      `${existingAccountMessage(customer)} Parolayla girmek isterseniz "Parolamı unuttum" ile parola belirleyebilirsiniz.`,
      401,
    );
  }

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

// -------------------------------------------------------- parola sıfırlama ---

const RESET_MINUTES = 60;
const RESET_PER_HOUR = 3;
const tokenHashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Sıfırlama bağlantısı gönderir. Hesabın var olup olmadığı yanıttan anlaşılmaz:
 * çağıran her durumda aynı mesajı gösterir. Yalnız sosyal girişli hesap da bu
 * yolla parola belirleyebilir; misafir kaydına parola yerine üye olma bağlantısı gider.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = z.string().trim().email().max(200).safeParse(rawEmail);
  if (!email.success) throw new CustomerAuthError('Geçerli bir e-posta girin.', 422, { email: 'Geçerli bir e-posta girin' });

  const customer = await db.customer.findUnique({
    where: { store_email: { store: currentStore(), email: email.data.toLocaleLowerCase('tr') } },
  });
  if (!customer || customer.anonymizedAt) return;

  const recent = await db.passwordResetToken.count({
    where: { customerId: customer.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= RESET_PER_HOUR) return;

  // Misafir kaydında parola yok: üye olma bağlantısı gönderilir. Sayaç için
  // kullanılmış (geçersiz) bir kayıt yazılır ki bu yol da saatte 3'le sınırlı kalsın.
  if (customer.isGuest) {
    const now = new Date();
    await db.passwordResetToken.create({
      data: { tokenHash: tokenHashOf(randomBytes(32).toString('base64url')), customerId: customer.id, expiresAt: now, usedAt: now },
    });
    const kayitLinki = `{{siteUrl}}/kayit?eposta=${encodeURIComponent(customer.email)}`;
    await queueEmail({ to: customer.email, template: 'parola-uyelik-yok', vars: { kayitLinki, butonLinki: kayitLinki } });
    return;
  }

  const token = randomBytes(32).toString('base64url');
  await db.passwordResetToken.create({
    data: {
      tokenHash: tokenHashOf(token),
      customerId: customer.id,
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
    },
  });
  await queueEmail({
    to: customer.email,
    template: 'parola-sifirla',
    vars: { sifirlamaLinki: `{{siteUrl}}/sifre-sifirla?t=${token}`, butonLinki: `{{siteUrl}}/sifre-sifirla?t=${token}` },
  });
}

async function findResetToken(token: string) {
  if (!token || token.length > 100) return null;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: tokenHashOf(token) },
    include: { customer: true },
  });
  if (!row?.customer || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  if (row.customer.store !== currentStore() || row.customer.anonymizedAt) return null;
  return row as typeof row & { customer: NonNullable<typeof row.customer> };
}

/** Sıfırlama sayfası açılırken: bağlantı hâlâ geçerli mi? */
export async function isResetTokenValid(token: string): Promise<boolean> {
  return Boolean(await findResetToken(token));
}

/** Yeni parolayı yazar, tüm oturumları kapatır ve bu cihazda oturum açar. */
export async function resetPasswordWithToken(token: string, nextPassword: string): Promise<CustomerUser> {
  const row = await findResetToken(token);
  if (!row) throw new CustomerAuthError('Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bağlantı isteyin.', 400);
  const problem = passwordProblem(nextPassword);
  if (problem) throw new CustomerAuthError(problem, 422, { password: problem });

  const now = new Date();
  await db.$transaction([
    db.customer.update({
      where: { id: row.customer.id },
      // Bağlantı e-postaya gittiği için adres de doğrulanmış olur.
      data: { passwordHash: await hashPassword(nextPassword), emailVerifiedAt: row.customer.emailVerifiedAt ?? now },
    }),
    db.passwordResetToken.updateMany({ where: { customerId: row.customer.id, usedAt: null }, data: { usedAt: now } }),
    db.customerSession.updateMany({ where: { customerId: row.customer.id, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await issueSession(row.customer.id);
  return (await getCurrentCustomer())!;
}
