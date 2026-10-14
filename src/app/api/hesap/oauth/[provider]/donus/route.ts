// Sağlayıcı dönüşü. Google GET (sorgu dizesi), Apple POST (form_post) ile döner.
// Kaynak doğrulaması `state` çerezi ile yapılır; `assertSameOrigin` burada
// kullanılmaz çünkü istek sağlayıcının alan adından gelir.

import { handleOAuthCallback, isOAuthProvider, OAuthFlowError, type CallbackInput } from '@/server/customers/oauth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ provider: string }> };

const redirect = (location: string) => new Response(null, { status: 303, headers: { Location: location } });

async function finish(provider: string, input: CallbackInput) {
  if (!isOAuthProvider(provider)) return new Response('Bulunamadı', { status: 404 });
  try {
    return redirect(await handleOAuthCallback(provider, input));
  } catch (err) {
    if (!(err instanceof OAuthFlowError)) console.error(`[oauth:${provider}] dönüş hatası`, err);
    return redirect(`/giris?hata=${err instanceof OAuthFlowError ? err.code : 'saglayici'}`);
  }
}

export async function GET(request: Request, { params }: Ctx) {
  const q = new URL(request.url).searchParams;
  return finish((await params).provider, { code: q.get('code'), state: q.get('state'), error: q.get('error') });
}

export async function POST(request: Request, { params }: Ctx) {
  const form = await request.formData().catch(() => null);
  const field = (k: string) => {
    const v = form?.get(k);
    return typeof v === 'string' ? v : null;
  };
  return finish((await params).provider, {
    code: field('code'),
    state: field('state'),
    error: field('error'),
    appleUser: field('user'),
  });
}
