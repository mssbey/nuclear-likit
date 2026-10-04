import { logoutCustomer } from '@/server/customers/auth';
import { assertSameOrigin, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await logoutCustomer();
    return Response.json({ ok: true });
  } catch (err) {
    return storefrontError(err);
  }
}
