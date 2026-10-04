import { loginCustomer } from '@/server/customers/auth';
import { assertSameOrigin, clientIpOf, readJsonBody, storefrontError } from '@/lib/storefront-http';
import { publicCustomer } from '@/server/customers/public';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, password } = await readJsonBody<{ email?: string; password?: string }>(request);
    const customer = await loginCustomer(email ?? '', password ?? '', clientIpOf(request));
    return Response.json({ ok: true, customer: publicCustomer(customer) });
  } catch (err) {
    return storefrontError(err);
  }
}
