// Sipariş numarası — 1001, 1002… (Mixle), NL-2026-000123 (Nuclear Likit), KV-… (KanziVape).
// Eski Mixle siparişleri NA-2026-000123 / ORD-… biçiminde kalır.
//
// Atomik sayaç: `Counter` satırı transaction içinde artırılır. İki eşzamanlı
// sipariş aynı numarayı alamaz çünkü `update` satır kilidi alır; SQLite'ta
// yazma zaten tek, Postgres'te satır bazında kilitlenir. Her mağazanın sayacı
// ve öneki ayrıdır (bkz. `src/lib/stores.ts`).

import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_STORE, STORE_META, type StoreId } from '@/lib/stores';

export const ORDER_NUMBER_KEY = 'siparis-no';

function counterKey(store: StoreId): string {
  const base = store === DEFAULT_STORE ? ORDER_NUMBER_KEY : `${store}:${ORDER_NUMBER_KEY}`;
  // Düz numara ayrı sayaçla başlar; önekli eski sayaç olduğu yerde kalır.
  return STORE_META[store].plainOrderStart != null ? `${base}:duz` : base;
}

export function formatOrderNumber(
  sequence: number,
  year = new Date().getUTCFullYear(),
  store: StoreId = DEFAULT_STORE,
): string {
  if (STORE_META[store].plainOrderStart != null) return String(sequence);
  return `${STORE_META[store].orderPrefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

export const ORDER_NUMBER_PATTERN = /^(?:[A-Z]{2}-\d{4}-\d{6}|\d{4,9})$/;

/** Transaction içinde çağrılır; sayaç yoksa oluşturur. */
export async function nextOrderNumber(tx: Prisma.TransactionClient, store: StoreId = DEFAULT_STORE): Promise<string> {
  const key = counterKey(store);
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: STORE_META[store].plainOrderStart ?? 1 },
    update: { value: { increment: 1 } },
  });
  return formatOrderNumber(row.value, undefined, store);
}
