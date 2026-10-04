// Sunucu yapılandırması ve ortam değişkeni doğrulaması.
//
// `ADMIN_WRITE_ENABLED` KALDIRILDI: artık gerçek bir veritabanı var, "salt
// okunur mod" diye bir şey yok. Yerine `DEMO_MODE` geldi:
//   - ödeme sağlayıcıları test moduna zorlanır,
//   - e-postalar gerçekten gönderilmez; `EmailLog` kaydına yazılıp panelde
//     gösterilir.

import 'server-only';

function flag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Demo modu. Varsayılan AÇIK: bir yapılandırma unutulduğunda gerçek para
 * çekilmesi veya müşteriye e-posta gitmesi yerine güvenli tarafta kalınır.
 * Canlıya alırken `DEMO_MODE=false` yapılmalıdır.
 */
export const DEMO_MODE = flag('DEMO_MODE', true);

export const isProduction = process.env.NODE_ENV === 'production';

/** Uygulamanın çalışması için zorunlu değişkenler. */
const REQUIRED = ['DATABASE_URL', 'SESSION_SECRET'] as const;

/** Yalnızca gerçek ödeme/şifreleme kullanılırken zorunlu olanlar. */
const REQUIRED_FOR_LIVE = ['ENCRYPTION_KEY'] as const;

export interface ConfigProblem {
  variable: string;
  message: string;
}

/**
 * Eksik/zayıf yapılandırmayı listeler. Panelde uyarı olarak gösterilir;
 * üretimde eksik zorunlu değişken uygulamayı başlatmamalıdır.
 */
export function configProblems(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  for (const name of REQUIRED) {
    if (!process.env[name]) {
      problems.push({ variable: name, message: `${name} tanımlı değil.` });
    }
  }

  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length < 32) {
    problems.push({
      variable: 'SESSION_SECRET',
      message: 'SESSION_SECRET en az 32 karakter olmalı.',
    });
  }

  if (!DEMO_MODE) {
    for (const name of REQUIRED_FOR_LIVE) {
      if (!process.env[name]) {
        problems.push({
          variable: name,
          message: `DEMO_MODE kapalıyken ${name} zorunludur (hassas ayarlar şifrelenemez).`,
        });
      }
    }
  }

  return problems;
}

/** Üretimde eksik yapılandırmayla sessizce çalışmayı engeller. */
export function assertConfig(): void {
  const problems = configProblems();
  if (problems.length === 0) return;

  const summary = problems.map((p) => `  - ${p.message}`).join('\n');
  if (isProduction) {
    throw new Error(`Ortam yapılandırması eksik:\n${summary}`);
  }
  console.warn(`[yapılandırma] eksik ayarlar:\n${summary}`);
}
