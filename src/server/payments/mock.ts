// Mock 3DS sayfası bağlamı — DEMO_MODE.
// Sonuç işleme artık adaptör + webhook yolundan geçer (adapters/mock.ts,
// webhooks.ts); bu dosya yalnız sayfa verisini sağlar.

import 'server-only';
import { db } from '../db';
import { DEMO_MODE } from '../config';
import { mockToken } from './adapters/mock';

export { mockToken, verifyMockToken } from './adapters/mock';

export class MockPaymentError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'MockPaymentError';
  }
}

export async function mockPaymentContext(orderId: string) {
  if (!DEMO_MODE) throw new MockPaymentError('Test ödemesi yalnız demo modunda kullanılabilir.', 403);
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      grandTotalMinor: true,
      paymentMethod: true,
      guestEmail: true,
      customer: { select: { email: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { installment: true, status: true } },
    },
  });
  if (!order) throw new MockPaymentError('Sipariş bulunamadı.', 404);
  if (order.paymentMethod !== 'kart') throw new MockPaymentError('Bu sipariş kart ile ödenmiyor.', 409);
  return {
    ...order,
    installment: order.payments[0]?.installment ?? 1,
    // Başarısız sonrası yeniden denemede olay kimliği farklı olsun diye deneme sayacı.
    attempt: String(await db.payment.count({ where: { orderId: order.id, status: 'başarısız' } }) + 1),
    token: mockToken(order.id),
  };
}
