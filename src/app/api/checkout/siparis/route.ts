// Sipariş oluşturma.
//
// `Idempotency-Key` başlığı: istemci her checkout oturumu için bir kez üretir
// (crypto.randomUUID). Ağ hatası sonrası yeniden gönderim aynı siparişi döndürür.

import { getCurrentCustomer } from '@/server/customers/auth';
import { createOrder } from '@/server/orders/create';
import { InsufficientStockError } from '@/server/inventory/reserve';
import { assertSameOrigin, clientIpOf, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const me = await getCurrentCustomer();
    const body = await readJsonBody(request);

    const rawKey = request.headers.get('idempotency-key')?.trim() ?? '';
    const idempotencyKey = /^[A-Za-z0-9_-]{8,128}$/.test(rawKey) ? rawKey : null;

    const result = await createOrder(body, {
      customerId: me?.id ?? null,
      ip: clientIpOf(request),
      userAgent: request.headers.get('user-agent'),
      idempotencyKey,
    });

    return Response.json(result, { status: result.reused ? 200 : 201 });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return Response.json(
        { error: 'stock', message: err.message, issues: { lines: err.message } },
        { status: 409 },
      );
    }
    return storefrontError(err);
  }
}
