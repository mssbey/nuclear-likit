// Ödeme sağlayıcı webhook'ları — OTURUM YOK, imza ile doğrulanır.
// `src/proxy.ts` matcher'ı /api/webhooks'u bilinçli olarak kapsamaz.
// Oran sınırı: IP başına dakikada 120 (sağlayıcılar toplu tekrar deneyebilir).

import { handlePaymentWebhook } from '@/server/payments/webhooks';
import { acceptsWebhooks } from '@/server/payments/registry';
import { clientIpOf } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const LIMIT = 120;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

type Ctx = { params: Promise<{ provider: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { provider } = await params;
  if (!acceptsWebhooks(provider)) return new Response('unknown provider', { status: 404 });
  if (limited(clientIpOf(request))) return new Response('rate limited', { status: 429 });

  const out = await handlePaymentWebhook(provider, request);
  return new Response(out.body, { status: out.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/** Bazı sağlayıcılar (Stripe test) GET ile canlılık kontrolü yapar. */
export async function GET(_req: Request, { params }: Ctx) {
  const { provider } = await params;
  return Response.json({ ok: acceptsWebhooks(provider), provider });
}
