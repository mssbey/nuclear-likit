// Misafir sipariş sorgulama: sipariş no + e-posta.
//
// Oran sınırı: aynı IP'den dakikada 10 deneme. Sipariş no + e-posta ikilisi
// bilinmeden hiçbir bilgi sızmaz; hata mesajı iki durumda da aynıdır.

import { db } from '@/server/db';
import { currentStore } from '@/server/store-context';
import { ORDER_NUMBER_PATTERN } from '@/server/orders/numbering';
import { clientIpOf, readJsonBody, storefrontError } from '@/lib/storefront-http';
import { publicOrderView } from '@/server/orders/view';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

export async function POST(request: Request) {
  try {
    if (rateLimited(clientIpOf(request))) {
      return Response.json(
        { error: 'rate', message: 'Çok fazla deneme. Bir dakika sonra tekrar deneyin.' },
        { status: 429 },
      );
    }
    const { no, email } = await readJsonBody<{ no?: string; email?: string }>(request);
    const orderNumber = (no ?? '').trim().toUpperCase();
    const mail = (email ?? '').trim().toLocaleLowerCase('tr');

    if (!ORDER_NUMBER_PATTERN.test(orderNumber) || !mail) {
      return Response.json(
        { error: 'invalid', message: 'Sipariş numarası (NA-YYYY-000000) ve e-posta gerekli.' },
        { status: 422 },
      );
    }

    const order = await db.order.findFirst({
      where: {
        store: currentStore(),
        orderNumber,
        OR: [{ guestEmail: mail }, { customer: { email: mail } }],
      },
      include: {
        items: true,
        shipments: { orderBy: { createdAt: 'desc' } },
        events: { where: { visibleToCustomer: true }, orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        returns: { orderBy: { requestedAt: 'desc' }, take: 1 },
      },
    });

    if (!order) {
      return Response.json(
        { error: 'not-found', message: 'Bu bilgilerle eşleşen sipariş bulunamadı.' },
        { status: 404 },
      );
    }

    return Response.json({ order: publicOrderView(order) });
  } catch (err) {
    return storefrontError(err);
  }
}
