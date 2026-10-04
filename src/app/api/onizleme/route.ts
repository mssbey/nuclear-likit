// Panelden ürün önizlemesi (taslak dahil). Panel (Mixle dağıtımı) imzalı,
// 10 dakikalık bağlantı üretir; imza doğrulanınca Draft Mode açılır ve ürün
// sayfası önbelleği atlayıp ürünün güncel halini gösterir.
//
//   GET /api/onizleme?slug=…&exp=…&sig=…   → aç, /urun/<slug>'a git
//   GET /api/onizleme?cikis=1&slug=…        → kapat

import { draftMode } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyPreviewQuery } from '@/server/storefront-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') ?? '').trim();
  const draft = await draftMode();
  const target = new URL(slug && /^[a-z0-9-]+$/i.test(slug) ? `/urun/${slug}` : '/', url.origin);

  if (url.searchParams.get('cikis') === '1') {
    draft.disable();
    return NextResponse.redirect(target, { status: 303 });
  }
  if (!slug || !verifyPreviewQuery(slug, url.searchParams.get('exp'), url.searchParams.get('sig'))) {
    return Response.json({ error: 'unauthorized', message: 'Önizleme bağlantısı geçersiz veya süresi dolmuş.' }, { status: 401 });
  }
  draft.enable();
  return NextResponse.redirect(target, { status: 303 });
}
