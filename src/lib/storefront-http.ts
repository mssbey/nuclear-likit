// Vitrin (müşteri) Route Handler'ları için ortak yardımcılar.
// Admin tarafındaki `src/lib/admin/http.ts`'in müşteri karşılığı.

import { ZodError } from 'zod';

interface HttpLikeError {
  status?: number;
  message: string;
  issues?: Record<string, string>;
}

export function storefrontError(err: unknown): Response {
  if (err instanceof ZodError) {
    const issues: Record<string, string> = {};
    for (const i of err.issues) issues[i.path.join('.')] ||= i.message;
    return Response.json({ error: 'invalid', message: 'Doğrulama başarısız', issues }, { status: 422 });
  }
  const e = err as HttpLikeError;
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600) {
    return Response.json(
      { error: e.status === 401 ? 'unauthorized' : 'invalid', message: e.message, issues: e.issues ?? {} },
      { status: e.status },
    );
  }
  console.error('[vitrin api]', err);
  return Response.json({ error: 'server', message: 'Beklenmeyen bir hata oluştu.' }, { status: 500 });
}

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw Object.assign(new Error('Geçersiz istek gövdesi'), { status: 400 });
  }
}

export function clientIpOf(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'bilinmiyor';
}

/**
 * CSRF: yazma uçlarında Origin/Referer istek kaynağı site ile eşleşmeli.
 * `sameSite=lax` çerezle birlikte çift katman.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return; // fetch olmayan (curl) istekler oturum çerezi taşımaz zaten
  const host = request.headers.get('host');
  try {
    const u = new URL(origin);
    if (host && u.host !== host) {
      throw Object.assign(new Error('İstek kaynağı doğrulanamadı.'), { status: 403 });
    }
  } catch (e) {
    if ((e as { status?: number }).status === 403) throw e;
  }
}
