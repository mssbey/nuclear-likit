// Türkiye adres verisi — il ve ilçe listeleri (istemciye gömülebilir, ~25 KB).
//
// Mahalleler ~50k kayıttır; gömülmez, `/api/adres/mahalleler` üzerinden
// ilçe seçilince yüklenir. Kaynak: `turkey-neighbourhoods` (MIT).
// JSON'ları yenilemek için: node -e "…" (bkz. scripts/README veya git geçmişi).

import illerJson from './iller.json';
import ilcelerJson from './ilceler.json';

export interface Il {
  code: string;
  name: string;
}

export const iller: Il[] = illerJson as Il[];
const ilcelerByCode = ilcelerJson as Record<string, string[]>;

export function ilByName(name: string): Il | undefined {
  const n = name.trim().toLocaleLowerCase('tr');
  return iller.find((i) => i.name.toLocaleLowerCase('tr') === n);
}

export function ilceler(ilCode: string): string[] {
  return ilcelerByCode[ilCode] ?? [];
}

export function isIlce(ilCode: string, ilce: string): boolean {
  const n = ilce.trim().toLocaleLowerCase('tr');
  return ilceler(ilCode).some((d) => d.toLocaleLowerCase('tr') === n);
}
