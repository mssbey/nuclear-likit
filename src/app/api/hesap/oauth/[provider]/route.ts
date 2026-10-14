// Google/Apple girişini başlatır: durum çerezi yazılır, sağlayıcıya yönlendirilir.

import { buildAuthorizeUrl, isOAuthProvider, OAuthFlowError } from '@/server/customers/oauth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ provider: string }> };

const redirect = (location: string) => new Response(null, { status: 303, headers: { Location: location } });

export async function GET(request: Request, { params }: Ctx) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) return new Response('Bulunamadı', { status: 404 });
  try {
    return redirect(await buildAuthorizeUrl(provider, new URL(request.url).searchParams.get('next')));
  } catch (err) {
    console.error('[oauth] başlatılamadı', err);
    return redirect(`/giris?hata=${err instanceof OAuthFlowError ? err.code : 'saglayici'}`);
  }
}
