import { registerCustomer } from '@/server/customers/auth';
import { publicCustomer } from '@/server/customers/public';
import { assertSameOrigin, clientIpOf, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const customer = await registerCustomer(body, clientIpOf(request));
    return Response.json({ ok: true, customer: publicCustomer(customer) }, { status: 201 });
  } catch (err) {
    return storefrontError(err);
  }
}
