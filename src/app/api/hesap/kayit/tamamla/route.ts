// Google/Apple ile gelen yeni müşteri sözleşmeleri onaylayınca hesabı açar.

import { completeSocialSignup, CustomerAuthError } from '@/server/customers/auth';
import { clearPendingSignup, readPendingSignup } from '@/server/customers/oauth';
import { publicCustomer } from '@/server/customers/public';
import { assertSameOrigin, clientIpOf, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const pending = await readPendingSignup();
    if (!pending) throw new CustomerAuthError('Oturumun süresi doldu. Lütfen Google/Apple ile tekrar devam edin.', 401);
    const body = await readJsonBody(request);
    const customer = await completeSocialSignup(pending, body, clientIpOf(request));
    await clearPendingSignup();
    return Response.json({ ok: true, customer: publicCustomer(customer), next: pending.next }, { status: 201 });
  } catch (err) {
    return storefrontError(err);
  }
}
