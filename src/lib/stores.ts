// Mağazalar — aynı panel ve veritabanı üzerinden yönetilen vitrinler.
//
// Katalog, sipariş, müşteri, kupon, indirim kuralı, kargo bölgesi, bülten ve
// yasal metin kayıtları `store` sütunuyla bir mağazaya bağlıdır. Ayarlar
// (`Setting`) anahtar önekiyle ayrılır (bkz. `storeSettingKey`). Panel
// kullanıcıları, vergi oranları ve medya kütüphanesi ortaktır.
//
// İstemci tarafında da import edilir; sunucuya özgü kod içermez.

export const STORES = ['mixle', 'nuclear'] as const;

export type StoreId = (typeof STORES)[number];

export const DEFAULT_STORE: StoreId = 'mixle';

export interface StoreMeta {
  id: StoreId;
  /** Panelde gösterilen ad. */
  label: string;
  /** Sipariş numarası öneki: NA-2026-000123. */
  orderPrefix: string;
}

export const STORE_META: Record<StoreId, StoreMeta> = {
  mixle: { id: 'mixle', label: 'Mixle', orderPrefix: 'NA' },
  nuclear: { id: 'nuclear', label: 'Nuclear Likit', orderPrefix: 'NL' },
};

export function isStoreId(value: unknown): value is StoreId {
  return typeof value === 'string' && (STORES as readonly string[]).includes(value);
}

/** Panelde seçili mağazayı taşıyan çerez. */
export const ADMIN_STORE_COOKIE = 'admin_magaza';

/**
 * `Setting` anahtarı. Mixle'ın anahtarları öneksizdir (mağaza ayrımından
 * önceki kayıtlar aynen geçerli kalsın diye); diğer mağazalar `<id>:` öneki alır.
 */
export function storeSettingKey(store: StoreId, key: string): string {
  return store === DEFAULT_STORE ? key : `${store}:${key}`;
}
