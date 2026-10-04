// Sipariş numarası — NA-2026-000123 (Mixle), NL-2026-000123 (Nuclear Likit).
//
// Atomik sayaç: `Counter` satırı transaction içinde artırılır. İki eşzamanlı
// sipariş aynı numarayı alamaz çünkü `update` satır kilidi alır; SQLite'ta
// yazma zaten tek, Postgres'te satır bazında kilitlenir. Her mağazanın sayacı
// ve öneki ayrıdır (bkz. `src/lib/stores.ts`).

import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_STORE, STORE_META, type StoreId } from '@/lib/stores';

export const ORDER_NUMBER_KEY = 'siparis-no';

function counterKey(store: StoreId): string {
  return store === DEFAULT_STORE ? ORDER_NUMBER_KEY : `${store}:${ORDER_NUMBER_KEY}`;
}

export function formatOrderNumber(
  sequence: number,
  year = new Date().getUTCFullYear(),
  store: StoreId = DEFAULT_STORE,
): string {
  return `${STORE_META[store].orderPrefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

export const ORDER_NUMBER_PATTERN = /^[A-Z]{2}-\d{4}-\d{6}$/;

/** Transaction içinde çağrılır; sayaç yoksa oluşturur. */
export async function nextOrderNumber(tx: Prisma.TransactionClient, store: StoreId = DEFAULT_STORE): Promise<string> {
  const key = counterKey(store);
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatOrderNumber(row.value, undefined, store);
}
