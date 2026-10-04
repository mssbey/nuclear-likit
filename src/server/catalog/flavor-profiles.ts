// Tat profili listesi — `Setting` tablosunda `tat-profilleri` anahtarı.
// Önbellek deseni `server/content/settings.ts` ile aynı (unstable_cache + etiket).

import 'server-only';
import { cache } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';
import type { StoreId } from '@/lib/stores';
import { readSettingValue, writeSetting } from '../settings';
import { currentStore } from '../store-context';
import { notifyStorefronts } from '../storefront-sync';
import {
  DEFAULT_FLAVOR_PROFILES,
  flavorProfileListSchema,
  type FlavorProfileDef,
} from '@/lib/flavor-profiles';

const KEY = 'tat-profilleri';
const TAG = 'tat-profilleri';

async function readFromDb(store: StoreId): Promise<FlavorProfileDef[]> {
  const parsed = flavorProfileListSchema.safeParse(await readSettingValue(KEY, store));
  return parsed.success ? parsed.data : DEFAULT_FLAVOR_PROFILES;
}

// Mağaza argümanı önbellek anahtarına girer; her mağazanın listesi ayrıdır.
const loadFlavorProfiles = unstable_cache(readFromDb, ['tat-profilleri-liste'], { tags: [TAG] });
const flavorProfilesFor = cache(loadFlavorProfiles);

/** Vitrin okuması — önbellekli. */
export const getFlavorProfiles = (): Promise<FlavorProfileDef[]> => flavorProfilesFor(currentStore());

/** Panel okuması — önbelleksiz, kayıttan hemen sonra tazedir. */
export const getFlavorProfilesFresh = (): Promise<FlavorProfileDef[]> => readFromDb(currentStore());

export async function saveFlavorProfiles(
  raw: unknown,
  updatedByUserId: string,
): Promise<FlavorProfileDef[]> {
  const list = flavorProfileListSchema.parse(raw);
  await writeSetting(KEY, list, updatedByUserId);
  revalidateTag(TAG, 'max');
  notifyStorefronts();
  return list;
}
