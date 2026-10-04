// Geçerli müşteri: profil okuma ve güncelleme.

import { z } from 'zod';
import { db } from '@/server/db';
import { changeCustomerPassword, getCurrentCustomer, requireCustomer } from '@/server/customers/auth';
import { normalizePhoneTR } from '@/lib/validators/phone';
import { assertSameOrigin, readJsonBody, storefrontError } from '@/lib/storefront-http';
import { publicCustomer } from '@/server/customers/public';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await getCurrentCustomer();
  if (!c) return Response.json({ customer: null });
  return Response.json({ customer: publicCustomer(c) });
}

const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'Ad en az 2 karakter').max(60).optional(),
  lastName: z.string().trim().min(2, 'Soyad en az 2 karakter').max(60).optional(),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhoneTR(v) !== null, 'Geçerli bir cep telefonu girin')
    .optional(),
  marketingOptIn: z.boolean().optional(),
  currentPassword: z.string().optional(),
  password: z.string().optional(),
});

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const me = await requireCustomer();
    const input = profileSchema.parse(await readJsonBody(request));

    if (input.password) {
      await changeCustomerPassword(me.id, input.currentPassword ?? '', input.password, me.sessionId);
    }

    const data: Record<string, unknown> = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.phone !== undefined) data.phone = input.phone ? normalizePhoneTR(input.phone) : null;
    if (input.marketingOptIn !== undefined) {
      data.marketingOptIn = input.marketingOptIn;
      // Rıza verildiğinde damgalanır; geri çekildiğinde damga da silinir (KVKK kanıtı).
      data.marketingOptInAt = input.marketingOptIn ? new Date() : null;
    }
    if (Object.keys(data).length) {
      await db.customer.update({ where: { id: me.id }, data });
    }

    const updated = await db.customer.findUniqueOrThrow({ where: { id: me.id } });
    return Response.json({ ok: true, customer: publicCustomer(updated) });
  } catch (err) {
    return storefrontError(err);
  }
}
