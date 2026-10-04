// İstek başına "geçerli mağaza".
//
// Mağazaya bağlı her okuma/yazma `currentStore()` ile filtrelenir:
//   - Vitrin: `STORE_ID` ortam değişkeni (yoksa `mixle`). mixle.net bunu hiç
//     tanımlamaz; Nuclear Likit dağıtımı `STORE_ID=nuclear` ile çalışır.
//   - Panel: `handle()` (admin Route Handler'ları) ve panelin sunucu
//     bileşenleri, seçili mağaza çerezini okuyup işlemi `runWithStore()` içinde
//     çalıştırır.
//
// AsyncLocalStorage kullanılır ki mağaza her fonksiyona parametre olarak
// taşınmasın; vitrin çağrı yerleri bu modülden habersiz kalır.

import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cookies } from 'next/headers';
import { ADMIN_STORE_COOKIE, DEFAULT_STORE, isStoreId, type StoreId } from '@/lib/stores';

const storage = new AsyncLocalStorage<StoreId>();

/** Bu dağıtımın vitrin mağazası. */
export function deploymentStore(): StoreId {
  const fromEnv = process.env.STORE_ID;
  return isStoreId(fromEnv) ? fromEnv : DEFAULT_STORE;
}

/** Geçerli mağaza: panel bağlamı varsa o, yoksa dağıtımın mağazası. */
export function currentStore(): StoreId {
  return storage.getStore() ?? deploymentStore();
}

export function runWithStore<T>(store: StoreId, fn: () => T): T {
  return storage.run(store, fn);
}

/** Panelde seçili mağaza (çerez); geçersiz/eksikse dağıtımın mağazası. */
export async function readAdminStore(): Promise<StoreId> {
  const jar = await cookies();
  const value = jar.get(ADMIN_STORE_COOKIE)?.value;
  return isStoreId(value) ? value : deploymentStore();
}

/** Panel sunucu bileşenleri için: seçili mağaza bağlamında çalıştırır. */
export async function withAdminStore<T>(fn: () => Promise<T>): Promise<T> {
  const store = await readAdminStore();
  return runWithStore(store, fn);
}
