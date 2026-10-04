// Müşterinin kendi siparişi için iade talebi açması (F5).

import { db } from '@/server/db';
import { requireCustomer } from '@/server/customers/auth';
import { createReturnRequest } from '@/server/returns/requests';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ no: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const me = await requireCustomer();
    const { no } = await params;

    const order = await db.order.findFirst({ where: { customerId: me.id, orderNumber: no.toUpperCase() }, select: { id: true } });
    if (!order) {
      return Response.json({ error: 'not-found', message: 'Sipariş bulunamadı.' }, { status: 404 });
    }

    await createReturnRequest(order.id, me.id, await readJsonBody(request));

    const updated = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: publicOrderInclude });
    return Response.json({ ok: true, order: publicOrderView(updated) }, { status: 201 });
  } catch (err) {
    return storefrontError(err);
  }
}
