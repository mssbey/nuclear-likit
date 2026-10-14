// E-postadaki bağlantıyla yeni parola belirler ve oturum açar.

import { resetPasswordWithToken } from '@/server/customers/auth';
import { publicCustomer } from '@/server/customers/public';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { token, password } = await readJsonBody<{ token?: string; password?: string }>(request);
    const customer = await resetPasswordWithToken(token ?? '', password ?? '');
    return Response.json({ ok: true, customer: publicCustomer(customer) });
  } catch (err) {
    return storefrontError(err);
  }
}
