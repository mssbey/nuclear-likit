// Panelden gelen "önbelleği yenile" bildirimi (Mixle `server/storefront-sync.ts`).
// Panel ayrı dağıtımda çalıştığı için katalog/içerik yazıldığında bu vitrinin
// önbelleği buradan düşürülür. `REVALIDATE_SECRET` ile korunur.

import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

// Ortak koddaki önbellek etiketleri (catalog/queries, content/settings, catalog/flavor-profiles).
const TAGS = ['katalog', 'sayfa-sss', 'sayfa-kampanya', 'menu-ust', 'tat-profilleri'];

function authorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  // `{ expire: 0 }`: bir sonraki istek eski içeriği GÖRMEZ, doğrudan yeniden üretilir.
  // ('max' bayat içeriği bir kez daha sunup arkada yenilerdi; panelden ürün
  // kaydedip siteye bakan yönetici eski sayfayı görüyordu.)
  for (const tag of TAGS) revalidateTag(tag, { expire: 0 });
  return Response.json({ ok: true, tags: TAGS });
}
