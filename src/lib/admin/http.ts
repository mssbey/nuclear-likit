// Route Handler ortak yardımcıları.
//
// Her admin ucu `handle()` ile sarılır: izin kontrolü + hata dönüşümü tek
// yerden yapılır. İzin kontrolü BURADA (işlem bazlı) asıl kontroldür;
// `src/proxy.ts` yalnızca rota bazlı kaba filtredir.

import { ZodError } from 'zod';
import { AuthError, requirePermission, type AdminUser } from '@/server/auth/current-user';
import type { Permission } from '@/server/auth/rbac';
import { readAdminStore, runWithStore } from '@/server/store-context';
import { AdminError } from './mutations';
import { fieldErrors } from './schema';

export class CatalogValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: Record<string, string>,
  ) {
    super(message);
    this.name = 'CatalogValidationError';
  }
}

export function jsonError(
  message: string,
  status = 400,
  issues?: Record<string, string>,
): Response {
  return Response.json({ error: 'invalid', message, issues: issues ?? {} }, { status });
}

/**
 * Bir admin ucunu yetki kontrolü ve hata dönüşümüyle sarar.
 *
 * @param permission Bu ucun gerektirdiği izin (bkz. `src/server/auth/rbac.ts`).
 */
export async function handle(
  permission: Permission,
  handler: (user: AdminUser) => Promise<Response>,
): Promise<Response> {
  try {
    const user = await requirePermission(permission);
    // Mağazaya bağlı tüm okuma/yazmalar panelde seçili mağazaya göre yapılır.
    const store = await readAdminStore();
    return await runWithStore(store, () => handler(user));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json(
      { error: err.status === 401 ? 'unauthorized' : 'forbidden', message: err.message },
      { status: err.status },
    );
  }
  if (err instanceof AdminError) {
    return Response.json(
      { error: 'invalid', message: err.message, issues: err.issues },
      { status: err.status },
    );
  }
  if (err instanceof CatalogValidationError) {
    return Response.json(
      { error: 'schema', message: err.message, issues: err.issues },
      { status: 422 },
    );
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: 'invalid', message: 'Doğrulama başarısız', issues: fieldErrors(err) },
      { status: 422 },
    );
  }
  // Servis hataları (InvalidTransitionError, RefundError, ShipmentError, …):
  // hepsi 4xx `status` taşır ve mesajı Türkçedir.
  const e = err as { status?: unknown; message?: unknown; issues?: unknown };
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && typeof e.message === 'string') {
    return Response.json(
      { error: e.status === 409 ? 'conflict' : e.status === 404 ? 'not-found' : 'invalid', message: e.message, issues: (e.issues as Record<string, string>) ?? {} },
      { status: e.status },
    );
  }
  console.error('[admin api]', err);
  const db = dbErrorResponse(err);
  if (db) return db;
  const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
  return Response.json({ error: 'server', message }, { status: 500 });
}

/**
 * Prisma/Postgres hatalarını anlaşılır Türkçe mesaja çevirir; ham
 * "Invalid `prisma.x.findMany()` invocation…" metni panelde görünmesin.
 */
function dbErrorResponse(err: unknown): Response | null {
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e?.code === 'string' ? e.code : '';
  const text = typeof e?.message === 'string' ? e.message : '';
  const busy = (message: string) =>
    Response.json({ error: 'busy', message }, { status: 503 });

  if (/too many (database )?connections|connection slots|P2037|P1001|P1017|ECONNRESET|ETIMEDOUT|Connection terminated|upstream database/i.test(`${code} ${text}`)) {
    return busy('Veritabanına şu an bağlanılamadı. Birkaç saniye sonra tekrar deneyin.');
  }
  if (code === 'P2028' || /Transaction (already closed|API error)|expired transaction/i.test(text)) {
    return busy('İşlem zaman aşımına uğradı, kaydedilmedi. Tekrar deneyin.');
  }
  if (code === 'P2002') {
    return Response.json({ error: 'conflict', message: 'Bu değer (ör. adres/slug, kod) zaten kullanılıyor.' }, { status: 409 });
  }
  if (code === 'P2025') {
    return Response.json({ error: 'not-found', message: 'Kayıt bulunamadı; başka biri silmiş olabilir. Sayfayı yenileyin.' }, { status: 404 });
  }
  if (code === 'P2003') {
    return Response.json({ error: 'conflict', message: 'Bu kayıt başka kayıtlarda kullanıldığı için işlem yapılamadı.' }, { status: 409 });
  }
  return null;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AdminError('Geçersiz JSON gövdesi', 400);
  }
}
