// AES-256-GCM sarmalayıcı — hassas alanlar için (TCKN, ödeme sağlayıcı anahtarları).
//
// Anahtar `ENCRYPTION_KEY` ortam değişkeninden gelir: 32 baytlık base64.
// Biçim: v1.<iv-base64>.<tag-base64>.<şifreli-base64>
//   - iv 12 bayt, her şifrelemede rastgele
//   - tag 16 bayt (GCM doğrulama etiketi)
//   - "v1" öneki ileride anahtar rotasyonu / algoritma değişimi için
//
// ANAHTAR KAYBEDİLİRSE şifreli veriler okunamaz — yedekleyin.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY tanımlı değil. .env dosyasına 32 baytlık base64 anahtar ekleyin: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY 32 bayt olmalı, ${buf.length} bayt bulundu.`);
  }
  cachedKey = buf;
  return buf;
}

export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(
    '.',
  );
}

export function open(sealed: string): string {
  const [version, ivB64, tagB64, dataB64] = sealed.split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Şifreli veri biçimi tanınmadı.');
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Şifre çözümü başarısız olursa (anahtar değişmiş vb.) null döner, fırlatmaz. */
export function tryOpen(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    return open(sealed);
  } catch {
    return null;
  }
}
