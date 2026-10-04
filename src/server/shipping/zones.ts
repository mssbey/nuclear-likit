// Kargo bölgeleri ve yöntemleri — veritabanından tarife motoruna.
//
// `ShippingZone` / `ShippingMethod` tablolarını `shipping-rates.ts`'in saf
// kural tipine çevirir. Tablo boşsa varsayılan bir Türkiye bölgesi tohumlanır
// ki checkout ilk günden çalışsın; panel (F4) bunları düzenler.

import 'server-only';
import { cache } from 'react';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { DEFAULT_STORE, type StoreId } from '@/lib/stores';
import { currentStore } from '../store-context';
import { jsonArray } from '../catalog/mapping';
import type { RateTier, ShippingMethodRule, ShippingZoneRule } from '../pricing/shipping-rates';

const DEFAULT_ZONE = {
  id: 'zone-turkiye',
  name: 'Türkiye',
  countries: ['TR'],
  cities: [] as string[],
  sortOrder: 0,
};

const DEFAULT_METHODS = [
  {
    id: 'method-standart',
    name: 'Standart kargo',
    type: 'sabit',
    priceMinor: 5490,
    freeOverMinor: 75_000,
    tiers: null,
    estimatedDays: '1-3 iş günü',
    carrier: 'yurtici',
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'method-kapida',
    name: 'Kapıda ödeme ile kargo',
    type: 'kapıda',
    priceMinor: 5490,
    freeOverMinor: null,
    tiers: null,
    estimatedDays: '1-3 iş günü',
    carrier: 'yurtici',
    isActive: true,
    sortOrder: 1,
  },
];

/** Varsayılan kayıt kimliği: Mixle'ınkiler öneksiz (mevcut kayıtlar), diğerleri `<mağaza>-` önekli. */
function defaultId(store: StoreId, id: string): string {
  return store === DEFAULT_STORE ? id : `${store}-${id}`;
}

/** Mağazanın bölge tablosu boşsa varsayılan bölge + yöntemleri yazar. Idempotent. */
export async function ensureDefaultShipping(store: StoreId = currentStore()): Promise<void> {
  const count = await db.shippingZone.count({ where: { store } });
  if (count > 0) return;

  // Eşzamanlı ilk istekler aynı varsayılanı yazmaya çalışabilir; çakışan
  // (P2002) yazma, kaydı başka isteğin zaten oluşturduğu anlamına gelir.
  try {
    await db.shippingZone.create({
      data: {
        ...DEFAULT_ZONE,
        id: defaultId(store, DEFAULT_ZONE.id),
        store,
        countries: DEFAULT_ZONE.countries,
        cities: DEFAULT_ZONE.cities,
        methods: {
          create: DEFAULT_METHODS.map((m) => ({
            ...m,
            id: defaultId(store, m.id),
            tiers: m.tiers === null ? undefined : (m.tiers as Prisma.InputJsonValue),
          })),
        },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
}

function toMethodRule(row: {
  id: string;
  zoneId: string;
  name: string;
  type: string;
  priceMinor: number;
  freeOverMinor: number | null;
  tiers: unknown;
  estimatedDays: string;
  carrier: string | null;
  isActive: boolean;
  sortOrder: number;
}): ShippingMethodRule {
  return {
    id: row.id,
    zoneId: row.zoneId,
    name: row.name,
    type: row.type as ShippingMethodRule['type'],
    priceMinor: row.priceMinor,
    freeOverMinor: row.freeOverMinor,
    tiers: row.tiers == null ? null : jsonArray<RateTier>(row.tiers),
    estimatedDays: row.estimatedDays,
    carrier: row.carrier,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

const shippingZonesFor = cache(async (store: StoreId): Promise<ShippingZoneRule[]> => {
  await ensureDefaultShipping(store);
  const zones = await db.shippingZone.findMany({
    where: { store },
    orderBy: { sortOrder: 'asc' },
    include: { methods: { orderBy: { sortOrder: 'asc' } } },
  });
  return zones.map((z) => ({
    id: z.id,
    name: z.name,
    countries: jsonArray<string>(z.countries),
    cities: jsonArray<string>(z.cities),
    sortOrder: z.sortOrder,
    methods: z.methods.map(toMethodRule),
  }));
});

/** Geçerli mağazanın bölgeleri (istek başına teklenir). */
export const getShippingZones = (): Promise<ShippingZoneRule[]> => shippingZonesFor(currentStore());
