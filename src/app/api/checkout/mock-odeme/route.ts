// Mock 3DS sonucu — YALNIZ DEMO_MODE.
// Sonucu doğrudan işlemek yerine mock sağlayıcının "webhook"u olarak
// handlePaymentWebhook'a verir: imza (HMAC), WebhookEvent idempotency ve durum
// geçişi üretimdeki gerçek sağlayıcılarla aynı koddan geçer.

import { DEMO_MODE } from '@/server/config';
import { handlePaymentWebhook } from '@/server/payments/webhooks';
import { db } from '@/server/db';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!DEMO_MODE) {
      return Response.json({ error: 'forbidden', message: 'Test ödemesi yalnız demo modunda kullanılabilir.' }, { status: 403 });
    }
    const body = await readJsonBody<{ orderId?: string; token?: string; outcome?: string; attempt?: string }>(request);
    if (!body.orderId || !body.token || (body.outcome !== 'basarili' && body.outcome !== 'basarisiz')) {
      return Response.json({ error: 'invalid', message: 'Eksik parametre.' }, { status: 400 });
    }

    // Webhook işleyiciye ham gövdeyle sahte istek: aynı doğrulama yolu.
    const fake = new Request(new URL('/api/webhooks/payments/mock', request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await handlePaymentWebhook('mock', fake);
    if (out.status === 400) {
      return Response.json({ error: 'forbidden', message: 'Geçersiz ödeme jetonu.' }, { status: 403 });
    }
    if (out.status !== 200) {
      return Response.json({ error: 'server', message: 'Ödeme sonucu işlenemedi.' }, { status: 500 });
    }

    const order = await db.order.findUnique({ where: { id: body.orderId }, select: { status: true, orderNumber: true } });
    return Response.json({ ok: true, duplicate: out.duplicate ?? false, status: order?.status, orderNumber: order?.orderNumber });
  } catch (err) {
    return storefrontError(err);
  }
}
