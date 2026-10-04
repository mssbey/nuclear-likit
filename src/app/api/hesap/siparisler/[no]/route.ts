// Müşterinin kendi siparişi — detay. Başkasının siparişi 404 döner (varlığı sızmaz).

import { db } from '@/server/db';
import { requireCustomer } from '@/server/customers/auth';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ no: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const me = await requireCustomer();
    const { no } = await params;
    const row = await db.order.findFirst({
      where: { customerId: me.id, orderNumber: no.toUpperCase() },
      include: publicOrderInclude,
    });
    if (!row) {
      return Response.json({ error: 'not-found', message: 'Sipariş bulunamadı.' }, { status: 404 });
    }
    return Response.json({ order: publicOrderView(row) });
  } catch (err) {
    return storefrontError(err);
  }
}
