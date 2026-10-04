// Müşterinin kendi siparişleri — liste.

import { db } from '@/server/db';
import { requireCustomer } from '@/server/customers/auth';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const me = await requireCustomer();
    const rows = await db.order.findMany({
      where: { customerId: me.id, status: { not: 'taslak' } },
      orderBy: { placedAt: 'desc' },
      include: publicOrderInclude,
      take: 100,
    });
    return Response.json({ orders: rows.map(publicOrderView) });
  } catch (err) {
    return storefrontError(err);
  }
}
