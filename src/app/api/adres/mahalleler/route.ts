// İlçeye göre mahalle listesi — kademeli adres seçici için.
//
// Mahalle verisi (~50k kayıt) istemciye gömülmez; ilçe seçilince buradan
// çekilir. Herkese açık, salt okunur, uzun süre önbelleklenebilir.

import { getNeighbourhoodsByCityCodeAndDistrict } from 'turkey-neighbourhoods';
import { ilByName, isIlce } from '@/data/tr-address';

// `force-static` KULLANILMAZ: o modda istek URL'sinin sorgu parametreleri
// boşaltılır ve uç her il/ilçe için boş liste döner. Önbellek aşağıdaki
// Cache-Control başlığıyla (tarayıcı + CDN) sağlanır.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const il = searchParams.get('il')?.trim() ?? '';
  const ilce = searchParams.get('ilce')?.trim() ?? '';

  const city = /^\d{2}$/.test(il) ? { code: il } : ilByName(il);
  if (!city || !ilce || !isIlce(city.code, ilce)) {
    return Response.json({ mahalleler: [] }, { status: 200 });
  }

  let list: string[] = [];
  try {
    list = getNeighbourhoodsByCityCodeAndDistrict(city.code, ilce) ?? [];
  } catch {
    list = [];
  }

  // "Caferağa Mah" → "Caferağa" — form alanında son ek gereksiz.
  const mahalleler = [...new Set(list.map((m) => m.replace(/\s+Mah\.?$/i, '').trim()))].sort(
    (a, b) => a.localeCompare(b, 'tr'),
  );

  return Response.json(
    { mahalleler },
    { headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
