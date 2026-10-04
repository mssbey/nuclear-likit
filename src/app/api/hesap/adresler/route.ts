import { requireCustomer } from '@/server/customers/auth';
import { createAddress, listAddresses } from '@/server/customers/addresses';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const me = await requireCustomer();
    return Response.json({ addresses: await listAddresses(me.id) });
  } catch (err) {
    return storefrontError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const me = await requireCustomer();
    const body = await readJsonBody<{ type?: string } & Record<string, unknown>>(request);
    const type = body.type === 'fatura' ? 'fatura' : 'teslimat';
    const address = await createAddress(me.id, body, type);
    return Response.json({ ok: true, address }, { status: 201 });
  } catch (err) {
    return storefrontError(err);
  }
}
