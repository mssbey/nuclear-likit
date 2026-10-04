// Müşterinin kendi siparişini iptal etmesi.
//
// Yalnız kargolanmamış siparişlerde: ödeme-bekliyor, başarısız, ödendi,
// hazırlanıyor. Kargolanmış sipariş için iade talebi açılır (F5). Durum
// makinesi zaten kargolanmıştan iptali reddeder; buradaki liste kullanıcıya
// net bir mesaj vermek içindir.

import { db } from '@/server/db';
import { requireCustomer } from '@/server/customers/auth';
import { transitionOrder } from '@/server/orders/transitions';
import { publicOrderInclude, publicOrderView } from '@/server/orders/view';
import { assertSameOrigin, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ no: string }> };

const CANCELLABLE = new Set(['ödeme-bekliyor', 'başarısız', 'ödendi', 'hazırlanıyor']);

export async function POST(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const me = await requireCustomer();
    const { no } = await params;

    const order = await db.order.findFirst({
      where: { customerId: me.id, orderNumber: no.toUpperCase() },
      select: { id: true, status: true },
    });
    if (!order) {
      return Response.json({ error: 'not-found', message: 'Sipariş bulunamadı.' }, { status: 404 });
    }
    if (!CANCELLABLE.has(order.status)) {
      return Response.json(
        {
          error: 'invalid',
          message: 'Kargoya verilmiş sipariş iptal edilemez. Teslim aldıktan sonra iade talebi açabilirsiniz.',
        },
        { status: 409 },
      );
    }

    await transitionOrder(order.id, 'iptal', { customerId: me.id }, {
      note: 'Müşteri tarafından iptal edildi',
      visibleToCustomer: true,
    });

    const updated = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: publicOrderInclude,
    });
    return Response.json({ ok: true, order: publicOrderView(updated) });
  } catch (err) {
    return storefrontError(err);
  }
}
