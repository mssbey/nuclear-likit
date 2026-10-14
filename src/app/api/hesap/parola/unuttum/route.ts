// Parola sıfırlama bağlantısı ister. Hesap olsun olmasın aynı yanıt döner.

import { requestPasswordReset } from '@/server/customers/auth';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email } = await readJsonBody<{ email?: string }>(request);
    await requestPasswordReset(email ?? '');
    return Response.json({ ok: true });
  } catch (err) {
    return storefrontError(err);
  }
}
