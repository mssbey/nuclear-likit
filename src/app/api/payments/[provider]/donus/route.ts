// 3DS / hosted sayfa dönüşü — müşterinin tarayıcısı gelir (POST veya GET).
//
// Gövde webhook ile aynı doğrulamadan geçer (idempotent), sonra müşteri
// teşekkür sayfasına yönlendirilir. Webhook daha önce işlediyse burada
// "duplicate" döner ve yine yönlendirilir — iki yol da aynı sonuca çıkar.

import { handlePaymentWebhook } from '@/server/payments/webhooks';
import { acceptsWebhooks } from '@/server/payments/registry';
import { db } from '@/server/db';
import { thankYouUrl } from '@/server/orders/access';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ provider: string }> };

async function finish(request: Request, providerId: string) {
  const url = new URL(request.url);
  const siparis = url.searchParams.get('siparis');

  let orderId: string | null = siparis;
  if (acceptsWebhooks(providerId) && request.method === 'POST') {
    const out = await handlePaymentWebhook(providerId, request);
    orderId = out.orderId ?? orderId;
  }

  const order = orderId ? await db.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, status: true } }) : null;
  const target = order
    ? `${thankYouUrl(order.orderNumber, order.id)}${order.status === 'başarısız' ? '&odeme=basarisiz' : ''}`
    : '/siparis-takibi';

  // 303: POST'tan GET'e güvenli yönlendirme.
  return Response.redirect(new URL(target, url.origin), 303);
}

export async function POST(request: Request, { params }: Ctx) {
  const { provider } = await params;
  return finish(request, provider);
}

export async function GET(request: Request, { params }: Ctx) {
  const { provider } = await params;
  return finish(request, provider);
}
