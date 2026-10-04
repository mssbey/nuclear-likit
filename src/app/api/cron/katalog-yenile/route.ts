// Günlük katalog önbelleği yenileme — Vercel Cron her gece TR 00:01'de vurur.
// Vitrin sayfaları önbellekli olduğu için tarih aralıklı "Yeni" damgası gün
// dönümünde ancak önbellek düşürülünce açılır/kapanır. `CRON_SECRET` ile korunur.

import { revalidateCatalog } from '@/server/catalog/queries';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const query = new URL(request.url).searchParams.get('secret');
  return bearer === secret || query === secret;
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized', message: 'Geçersiz veya eksik CRON_SECRET.' }, { status: 401 });
  }
  revalidateCatalog();
  return Response.json({ ok: true });
}

export const GET = run;
export const POST = run;
