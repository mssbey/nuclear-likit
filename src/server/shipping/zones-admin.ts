// Kargo bölgesi / yöntem CRUD (panel yazma tarafı). Okuma tarafı `zones.ts`
// (checkout tarafından kullanılan, önbelleklenmiş saf sorgu) ile ayrı tutulur.

import 'server-only';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { ensureDefaultShipping } from './zones';
import { invalidateShippingPolicy } from './policy';

export class ShippingAdminError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = 'ShippingAdminError';
  }
}

const tierSchema = z.object({ upTo: z.number().int().min(0).nullable(), priceMinor: z.number().int().min(0) });

export const zoneInputSchema = z.object({
  name: z.string().trim().min(1, 'Bölge adı gerekli').max(80),
  countries: z.array(z.string().trim().toUpperCase()).default(['TR']),
  cities: z.array(z.string().trim()).default([]),
});
export type ZoneInput = z.infer<typeof zoneInputSchema>;

export const methodInputSchema = z.object({
  name: z.string().trim().min(1, 'Yöntem adı gerekli').max(80),
  type: z.enum(['sabit', 'desi', 'tutara-göre', 'ücretsiz', 'kapıda']),
  priceMinor: z.number().int().min(0).default(0),
  freeOverMinor: z.number().int().min(0).nullable().default(null),
  tiers: z.array(tierSchema).nullable().default(null),
  estimatedDays: z.string().trim().max(40).default(''),
  carrier: z.string().trim().max(30).nullable().default(null),
  isActive: z.boolean().default(true),
});
export type MethodInput = z.infer<typeof methodInputSchema>;

/**
 * Eşik kuralı motorla aynı: kapıda ve ücretsiz tiplerde eşik yoktur, 0 "eşik
 * yok" demektir. Kayıt da buna göre tutulur ki panel yanıltıcı değer göstermesin.
 */
function normalizeThreshold<T extends Partial<MethodInput>>(input: T, type: MethodInput['type'] | undefined): T {
  if (input.freeOverMinor === undefined && type === undefined) return input;
  const noThreshold = type === 'kapıda' || type === 'ücretsiz' || input.freeOverMinor === 0;
  return noThreshold ? { ...input, freeOverMinor: null } : input;
}

export async function listZonesAdmin() {
  const store = currentStore();
  await ensureDefaultShipping(store);
  return db.shippingZone.findMany({ where: { store }, orderBy: { sortOrder: 'asc' }, include: { methods: { orderBy: { sortOrder: 'asc' } } } });
}

/** Yazma tamamlanınca vitrin kargo metinlerinin önbelleğini düşürür. */
async function changed<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  invalidateShippingPolicy();
  return result;
}

export async function createZone(raw: unknown) {
  const input = zoneInputSchema.parse(raw);
  const store = currentStore();
  const max = await db.shippingZone.aggregate({ where: { store }, _max: { sortOrder: true } });
  return changed(db.shippingZone.create({
    data: { ...input, store, countries: input.countries as Prisma.InputJsonValue, cities: input.cities as Prisma.InputJsonValue, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    include: { methods: true },
  }));
}

export async function updateZone(id: string, raw: unknown) {
  const input = zoneInputSchema.partial().parse(raw);
  const zone = await db.shippingZone.findFirst({ where: { id, store: currentStore() } });
  if (!zone) throw new ShippingAdminError('Bölge bulunamadı.', 404);
  return changed(db.shippingZone.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.countries !== undefined ? { countries: input.countries as Prisma.InputJsonValue } : {}),
      ...(input.cities !== undefined ? { cities: input.cities as Prisma.InputJsonValue } : {}),
    },
    include: { methods: true },
  }));
}

export async function deleteZone(id: string) {
  const zone = await db.shippingZone.findFirst({ where: { id, store: currentStore() } });
  if (!zone) throw new ShippingAdminError('Bölge bulunamadı.', 404);
  await changed(db.shippingZone.delete({ where: { id } })); // Prisma cascade: methods de silinir.
}

export async function reorderZones(orderedIds: string[]) {
  await changed(db.$transaction(orderedIds.map((id, i) => db.shippingZone.update({ where: { id, store: currentStore() }, data: { sortOrder: i } }))));
}

export async function createMethod(zoneId: string, raw: unknown) {
  const zone = await db.shippingZone.findFirst({ where: { id: zoneId, store: currentStore() } });
  if (!zone) throw new ShippingAdminError('Bölge bulunamadı.', 404);
  const parsed = methodInputSchema.parse(raw);
  const input = normalizeThreshold(parsed, parsed.type);
  const max = await db.shippingMethod.aggregate({ where: { zoneId }, _max: { sortOrder: true } });
  return changed(db.shippingMethod.create({
    data: { ...input, zoneId, tiers: input.tiers === null ? undefined : (input.tiers as unknown as Prisma.InputJsonValue), sortOrder: (max._max.sortOrder ?? -1) + 1 },
  }));
}

export async function updateMethod(id: string, raw: unknown) {
  const parsed = methodInputSchema.partial().parse(raw);
  const method = await db.shippingMethod.findFirst({ where: { id, zone: { store: currentStore() } } });
  if (!method) throw new ShippingAdminError('Yöntem bulunamadı.', 404);
  const input = normalizeThreshold(parsed, parsed.type ?? (method.type as MethodInput['type']));
  return changed(db.shippingMethod.update({
    where: { id },
    data: {
      ...input,
      tiers: input.tiers === undefined ? undefined : input.tiers === null ? Prisma.JsonNull : (input.tiers as unknown as Prisma.InputJsonValue),
    },
  }));
}

export async function deleteMethod(id: string) {
  const method = await db.shippingMethod.findFirst({ where: { id, zone: { store: currentStore() } } });
  if (!method) throw new ShippingAdminError('Yöntem bulunamadı.', 404);
  await changed(db.shippingMethod.delete({ where: { id } }));
}

export async function reorderMethods(zoneId: string, orderedIds: string[]) {
  const zone = await db.shippingZone.findFirst({ where: { id: zoneId, store: currentStore() } });
  if (!zone) throw new ShippingAdminError('Bölge bulunamadı.', 404);
  await changed(db.$transaction(orderedIds.map((id, i) => db.shippingMethod.update({ where: { id, zoneId }, data: { sortOrder: i } }))));
}
