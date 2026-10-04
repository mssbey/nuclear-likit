import { requireCustomer } from '@/server/customers/auth';
import { deleteAddress, setDefaultAddress, updateAddress } from '@/server/customers/addresses';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const me = await requireCustomer();
    const { id } = await params;
    const body = await readJsonBody<{ setDefault?: boolean } & Record<string, unknown>>(request);

    // Yalnız varsayılan yapma isteği: formun tamamı gönderilmez.
    if (body.setDefault === true && Object.keys(body).length === 1) {
      await setDefaultAddress(me.id, id);
      return Response.json({ ok: true });
    }

    const address = await updateAddress(me.id, id, body);
    return Response.json({ ok: true, address });
  } catch (err) {
    return storefrontError(err);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const me = await requireCustomer();
    const { id } = await params;
    await deleteAddress(me.id, id);
    return Response.json({ ok: true });
  } catch (err) {
    return storefrontError(err);
  }
}
