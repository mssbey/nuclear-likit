// Yapılandırılmış günlükleme — hassas alanları maskeler.
//
// KURAL: Loglara PAN, CVV, tam TCKN, parola, API anahtarı ASLA düşmez.
// `maskSensitive` derinlemesine anahtar adına bakar; ek olarak 13-19 haneli
// sayı dizileri (olası kart numarası) ve 11 haneli TCKN kalıpları maskelenir.
// Hata izleme kancası (Sentry) env ile açılır; kapalıyken sadece console.

import 'server-only';

const SENSITIVE_KEY = /pan|card_?number|cardnumber|cvv|cvc|cvv2|expire|expiry|identity|tckn|password|passwd|secret|token|authorization|api_?key|merchant_?key|salt/i;

function maskString(s: string): string {
  return s
    // 13-19 haneli (boşluk/tire ile ayrılmış olabilir) → kart numarası olabilir
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => `****${m.replace(/\D/g, '').slice(-4)}`)
    // 11 haneli TCKN
    .replace(/\b[1-9]\d{10}\b/g, (m) => `${m.slice(0, 3)}*****${m.slice(-2)}`);
}

export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[derin]';
  if (typeof value === 'string') return maskString(value);
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return { name: value.name, message: maskString(value.message) };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '***' : maskSensitive(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, message: string, data?: unknown) {
  const entry = {
    t: new Date().toISOString(),
    level,
    scope,
    message,
    ...(data !== undefined ? { data: maskSensitive(data) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.NODE_ENV !== 'production' || level === 'info') console.log(line);

  // Hata izleme kancası: SENTRY_DSN tanımlıysa ileride buraya bağlanır (F7).
}

export const log = {
  debug: (scope: string, message: string, data?: unknown) => emit('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => emit('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => emit('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => emit('error', scope, message, data),
};
