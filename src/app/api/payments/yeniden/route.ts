// Ödemeyi yeniden başlat — teşekkür/hesap sayfasındaki "Ödemeyi tamamla".
// Yetki: siparişin sahibi müşteri VEYA imzalı erişim jetonu.

import { z } from 'zod';
import { db } from '@/server/db';
import { getCurrentCustomer } from '@/server/customers/auth';
import { verifyOrderAccessToken } from '@/server/orders/access';
import { startCardPayment } from '@/server/payments/start';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  orderId: z.string().min(1),
  token: z.string().optional(),
  installment: z.number().int().min(1).max(12).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await readJsonBody(request));
    const me = await getCurrentCustomer();
    const order = await db.order.findUnique({ where: { id: input.orderId }, select: { id: true, customerId: true } });
    if (!order) return Response.json({ error: 'not-found', message: 'Sipariş bulunamadı.' }, { status: 404 });

    const allowed = (me && order.customerId === me.id) || verifyOrderAccessToken(order.id, input.token);
    if (!allowed) return Response.json({ error: 'forbidden', message: 'Bu sipariş için yetkiniz yok.' }, { status: 403 });

    const r = await startCardPayment(order.id, { installment: input.installment });
    return Response.json({ ok: true, url: r.url, provider: r.provider });
  } catch (err) {
    return storefrontError(err);
  }
}
