// Müşteri sosyal girişi — Google ve Apple (OpenID Connect, yetki kodu akışı).
//
// Harici kimlik kütüphanesi kullanılmaz: akış kısa ve mevcut müşteri oturumu
// (`issueSession`) ile birebir aynı çerezi üretmesi gerekiyor. `id_token`
// sağlayıcının JWKS anahtarlarıyla `jose` ile doğrulanır; `state` CSRF'i,
// `nonce` jeton tekrarını, PKCE (yalnız Google destekler) kod sızmasını engeller.
//
// Akış:
//   1. /api/hesap/oauth/<p>         → durum çerezi + sağlayıcıya yönlendirme
//   2. /api/hesap/oauth/<p>/donus   → kod → id_token → müşteri eşleştirme
//      a. sağlayıcı kimliği kayıtlıysa             → oturum açılır
//      b. doğrulanmış e-posta kayıtlı bir hesaptaysa → hesaba bağlanır, oturum
//      c. hesap yoksa (veya misafir kaydıysa)       → "kayıt tamamla" çerezi,
//         müşteri /kayit/tamamla'da sözleşmeleri onaylayınca hesap açılır.
//
// Ortam değişkenleri (her vitrin dağıtımının kendi değerleri):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8 içeriği)
// Dönüş adresi: <site>/api/hesap/oauth/<google|apple>/donus — sağlayıcı
// konsolunda birebir tanımlanmalıdır.

import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';
import { site } from '@/lib/site';
import { db } from '../db';
import { currentStore } from '../store-context';
import { CustomerAuthError, issueSession } from './auth';

export const OAUTH_PROVIDERS = ['google', 'apple'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const oauthProviderLabels: Record<OAuthProvider, string> = { google: 'Google', apple: 'Apple' };

export function isOAuthProvider(v: unknown): v is OAuthProvider {
  return typeof v === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(v);
}

const env = (k: string) => process.env[k]?.trim() || '';

/** Yapılandırılmış sağlayıcılar — düğmeler yalnız bunlar için gösterilir. */
export function enabledOAuthProviders(): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  if (env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')) out.push('google');
  if (env('APPLE_CLIENT_ID') && env('APPLE_TEAM_ID') && env('APPLE_KEY_ID') && env('APPLE_PRIVATE_KEY')) out.push('apple');
  return out;
}

function baseUrl(): string {
  return (env('OAUTH_BASE_URL') || site.domain).replace(/\/$/, '');
}

export function redirectUri(p: OAuthProvider): string {
  return `${baseUrl()}/api/hesap/oauth/${p}/donus`;
}

/** `next` yalnız site içi yol olabilir; açık yönlendirme engellenir. */
export function safeNextPath(next: string | null | undefined, fallback = '/hesabim'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}

// ------------------------------------------------------------ imzalı çerezler

const STATE_COOKIE = 'na_oauth';
const PENDING_COOKIE = 'na_oauth_kayit';
const STATE_SECONDS = 10 * 60;
const PENDING_SECONDS = 30 * 60;
const secure = process.env.NODE_ENV === 'production';

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET tanımlı değil veya çok kısa.');
  return new TextEncoder().encode(secret);
}

async function sign(payload: Record<string, unknown>, audience: string, seconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + seconds)
    .setIssuer('nefis-aroma')
    .setAudience(audience)
    .sign(secretKey());
}

async function verify<T>(token: string | undefined, audience: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'nefis-aroma', audience });
    return payload as T;
  } catch {
    return null;
  }
}

interface StatePayload {
  p: OAuthProvider;
  state: string;
  nonce: string;
  verifier?: string;
  next: string;
  store: string;
}

/** Sağlayıcıdan dönen, henüz hesaba dönüşmemiş kimlik. */
export interface PendingSignup {
  p: OAuthProvider;
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  next: string;
  store: string;
}

export async function readPendingSignup(): Promise<PendingSignup | null> {
  const jar = await cookies();
  const data = await verify<PendingSignup>(jar.get(PENDING_COOKIE)?.value, 'oauth-kayit');
  return data && data.store === currentStore() ? data : null;
}

export async function clearPendingSignup(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

// ------------------------------------------------------------ 1. başlat

const b64url = (buf: Buffer) => buf.toString('base64url');

export async function buildAuthorizeUrl(p: OAuthProvider, next: string | null): Promise<string> {
  if (!enabledOAuthProviders().includes(p)) {
    throw new CustomerAuthError(`${oauthProviderLabels[p]} ile giriş şu an kullanılamıyor.`, 400);
  }
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = p === 'google' ? b64url(randomBytes(32)) : undefined;

  const jar = await cookies();
  jar.set(STATE_COOKIE, await sign({ p, state, nonce, verifier, next: safeNextPath(next), store: currentStore() }, 'oauth-state', STATE_SECONDS), {
    httpOnly: true,
    secure,
    // Apple dönüşü siteler arası POST'tur (form_post); Lax çerez o istekte gönderilmez.
    sameSite: secure ? 'none' : 'lax',
    path: '/api/hesap/oauth',
    maxAge: STATE_SECONDS,
  });

  if (p === 'google') {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri(p),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: b64url(createHash('sha256').update(verifier!).digest()),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return u.toString();
  }

  const u = new URL('https://appleid.apple.com/auth/authorize');
  u.search = new URLSearchParams({
    client_id: env('APPLE_CLIENT_ID'),
    redirect_uri: redirectUri(p),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce,
  }).toString();
  return u.toString();
}

// ------------------------------------------------------------ 2. dönüş

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/** Apple istemci sırrı: .p8 anahtarıyla imzalı kısa ömürlü ES256 JWT. */
async function appleClientSecret(): Promise<string> {
  const pem = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const key = await importPKCS8(pem, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env('APPLE_KEY_ID') })
    .setIssuer(env('APPLE_TEAM_ID'))
    .setSubject(env('APPLE_CLIENT_ID'))
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

interface ProviderIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

async function exchangeCode(p: OAuthProvider, code: string, st: StatePayload): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(p) });
  if (p === 'google') {
    body.set('client_id', env('GOOGLE_CLIENT_ID'));
    body.set('client_secret', env('GOOGLE_CLIENT_SECRET'));
    body.set('code_verifier', st.verifier ?? '');
  } else {
    body.set('client_id', env('APPLE_CLIENT_ID'));
    body.set('client_secret', await appleClientSecret());
  }
  const res = await fetch(p === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !json.id_token) {
    console.error(`[oauth:${p}] kod değişimi başarısız`, res.status, json.error);
    throw new OAuthFlowError('saglayici');
  }
  return json.id_token;
}

async function verifyIdToken(p: OAuthProvider, idToken: string, nonce: string): Promise<ProviderIdentity> {
  const { payload } = await jwtVerify(idToken, p === 'google' ? GOOGLE_JWKS : APPLE_JWKS, {
    issuer: p === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : 'https://appleid.apple.com',
    audience: p === 'google' ? env('GOOGLE_CLIENT_ID') : env('APPLE_CLIENT_ID'),
  }).catch((e) => {
    console.error(`[oauth:${p}] id_token doğrulanamadı`, e);
    throw new OAuthFlowError('saglayici');
  });
  if (payload.nonce !== nonce) throw new OAuthFlowError('oturum');

  const claims = payload as Record<string, unknown>;
  const email = typeof claims.email === 'string' ? claims.email.trim().toLocaleLowerCase('tr') : '';
  // Apple bu alanı "true" dizesi olarak da gönderebilir.
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!payload.sub) throw new OAuthFlowError('saglayici');
  return {
    sub: payload.sub,
    email,
    emailVerified,
    firstName: typeof claims.given_name === 'string' ? claims.given_name : '',
    lastName: typeof claims.family_name === 'string' ? claims.family_name : '',
  };
}

/** Kullanıcıya `/giris?hata=<kod>` ile gösterilen akış hatası. */
export class OAuthFlowError extends Error {
  constructor(public readonly code: 'iptal' | 'oturum' | 'saglayici' | 'eposta' | 'hesap') {
    super(code);
    this.name = 'OAuthFlowError';
  }
}

export const oauthErrorMessages: Record<OAuthFlowError['code'], string> = {
  iptal: 'Giriş işlemi iptal edildi.',
  oturum: 'Giriş oturumunun süresi doldu. Lütfen tekrar deneyin.',
  saglayici: 'Giriş sağlayıcısıyla bağlantı kurulamadı. Lütfen tekrar deneyin.',
  eposta: 'Hesabınızın e-posta adresi alınamadı veya doğrulanmamış. Lütfen e-posta ile kayıt olun.',
  hesap: 'Bu hesapla giriş yapılamıyor. Destek için bizimle iletişime geçin.',
};

export interface CallbackInput {
  code: string | null;
  state: string | null;
  error: string | null;
  /** Apple yalnız İLK yetkilendirmede gönderir: {"name":{"firstName","lastName"}}. */
  appleUser?: string | null;
}

/** Dönüşü işler; gidilecek site içi yolu döndürür. */
export async function handleOAuthCallback(p: OAuthProvider, input: CallbackInput): Promise<string> {
  const jar = await cookies();
  const st = await verify<StatePayload>(jar.get(STATE_COOKIE)?.value, 'oauth-state');
  jar.set(STATE_COOKIE, '', { path: '/api/hesap/oauth', maxAge: 0, secure, sameSite: secure ? 'none' : 'lax', httpOnly: true });

  if (input.error) throw new OAuthFlowError(input.error === 'access_denied' || input.error === 'user_cancelled_authorize' ? 'iptal' : 'saglayici');
  if (!st || st.p !== p || st.store !== currentStore() || !input.state || input.state !== st.state || !input.code) {
    throw new OAuthFlowError('oturum');
  }

  const identity = await verifyIdToken(p, await exchangeCode(p, input.code, st), st.nonce);
  if (p === 'apple' && input.appleUser) {
    try {
      const u = JSON.parse(input.appleUser) as { name?: { firstName?: string; lastName?: string } };
      identity.firstName ||= u.name?.firstName ?? '';
      identity.lastName ||= u.name?.lastName ?? '';
    } catch {
      /* ad isteğe bağlı */
    }
  }

  const store = currentStore();
  const subField = p === 'google' ? 'googleSub' : 'appleSub';

  // a. Bu sağlayıcı kimliği zaten bir hesaba bağlı.
  const linked = await db.customer.findFirst({ where: { store, [subField]: identity.sub } });
  if (linked) {
    if (linked.anonymizedAt) throw new OAuthFlowError('hesap');
    await issueSession(linked.id);
    return st.next;
  }

  if (!identity.email || !identity.emailVerified) throw new OAuthFlowError('eposta');

  // b. Aynı (doğrulanmış) e-postayla açılmış üyelik → sağlayıcıyı bağla.
  const byEmail = await db.customer.findUnique({ where: { store_email: { store, email: identity.email } } });
  if (byEmail && !byEmail.isGuest) {
    if (byEmail.anonymizedAt) throw new OAuthFlowError('hesap');
    await db.customer.update({
      where: { id: byEmail.id },
      data: { [subField]: identity.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
    });
    await issueSession(byEmail.id);
    return st.next;
  }

  // c. Yeni üye (veya misafir siparişi olan e-posta): sözleşme onayı gerekli.
  const pending: PendingSignup = {
    p,
    sub: identity.sub,
    email: identity.email,
    firstName: identity.firstName.slice(0, 60),
    lastName: identity.lastName.slice(0, 60),
    next: st.next,
    store,
  };
  jar.set(PENDING_COOKIE, await sign({ ...pending }, 'oauth-kayit', PENDING_SECONDS), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_SECONDS,
  });
  return '/kayit/tamamla';
}
