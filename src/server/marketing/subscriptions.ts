// Bülten (e-posta) ve SMS abonelik kayıtları — footer formları ve panel
// "Bülten / SMS Kayıtları" ekranları bu modülü kullanır.

import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import { currentStore } from '../store-context';

export const newsletterInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta adresi girin.'),
  source: z.enum(['footer', 'checkout', 'popup', 'panel']).default('footer'),
});

const PHONE_RE = /^(\+90|0)?5\d{9}$/;

export const smsInputSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ''))
    .refine((v) => PHONE_RE.test(v), 'Geçerli bir cep telefonu numarası girin (5xx xxx xx xx).')
    .transform((v) => normalizePhone(v)),
  source: z.enum(['footer', 'checkout', 'popup', 'panel']).default('footer'),
});

function normalizePhone(v: string): string {
  const digits = v.replace(/\D/g, '');
  const local = digits.startsWith('90') ? digits.slice(2) : digits.replace(/^0/, '');
  return `+90${local}`;
}

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

/** E-posta bültenine kaydeder; zaten varsa aktife çeker. Idempotent. */
export async function subscribeNewsletter(
  input: z.infer<typeof newsletterInputSchema>,
  meta: Meta = {},
): Promise<{ created: boolean }> {
  const store = currentStore();
  const existing = await db.newsletterSubscriber.findUnique({ where: { store_email: { store, email: input.email } } });
  if (existing) {
    if (existing.status !== 'aktif') {
      await db.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { status: 'aktif', unsubscribedAt: null },
      });
    }
    return { created: false };
  }
  await db.newsletterSubscriber.create({
    data: {
      store,
      email: input.email,
      source: input.source,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return { created: true };
}

/** SMS bilgilendirmeye kaydeder; zaten varsa aktife çeker. Idempotent. */
export async function subscribeSms(
  input: z.infer<typeof smsInputSchema>,
  meta: Meta = {},
): Promise<{ created: boolean }> {
  const store = currentStore();
  const existing = await db.smsSubscriber.findUnique({ where: { store_phone: { store, phone: input.phone } } });
  if (existing) {
    if (existing.status !== 'aktif') {
      await db.smsSubscriber.update({
        where: { id: existing.id },
        data: { status: 'aktif', unsubscribedAt: null },
      });
    }
    return { created: false };
  }
  await db.smsSubscriber.create({
    data: {
      store,
      phone: input.phone,
      source: input.source,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return { created: true };
}
