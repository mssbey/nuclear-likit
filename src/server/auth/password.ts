// Parola özetleme — Node yerleşik `crypto.scrypt`.
//
// NEDEN argon2/bcrypt DEĞİL: ikisi de native derleme ister (Windows'ta sık
// sorun çıkarır ve dağıtım ortamına bağımlılık ekler). `scrypt` Node'un
// içindedir, bellek-zor (memory-hard) bir KDF'dir ve parola özetleme için
// OWASP'ın kabul ettiği seçeneklerden biridir.
//
// Biçim: scrypt$N$r$p$<tuz-base64>$<özet-base64>
// Parametreler özetin içinde saklanır; ileride maliyet artırılırsa eski
// özetler doğrulanmaya devam eder.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 15; // CPU/bellek maliyeti (32768)
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
// scrypt varsayılan maxmem 32 MB; N=32768 için ~64 MB gerekir.
const MAX_MEM = 128 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, keyB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(keyB64, 'base64');
    actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
  } catch {
    return false;
  }

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Parola politikası — giriş formu ve kullanıcı oluşturma betiği aynı kuralı uygular. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Parola en az 10 karakter olmalı';
  if (password.length > 200) return 'Parola en fazla 200 karakter olabilir';
  if (!/[a-zçğıöşü]/i.test(password)) return 'Parola en az bir harf içermeli';
  if (!/\d/.test(password)) return 'Parola en az bir rakam içermeli';
  return null;
}
