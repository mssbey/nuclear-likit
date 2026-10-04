// TC Kimlik Numarası doğrulaması — resmi algoritma.
//
//  - 11 hane, ilk hane 0 olamaz
//  - 10. hane = ((1,3,5,7,9. hanelerin toplamı × 7) − (2,4,6,8. hanelerin toplamı)) mod 10
//  - 11. hane = ilk 10 hanenin toplamı mod 10
//
// Bu yalnız BİÇİM doğrulamasıdır; kimliğin gerçekten var olduğunu doğrulamaz
// (bunun için NVİ servisi gerekir). Saf modül, istemci ve sunucuda kullanılır.

export function isValidTckn(raw: string): boolean {
  const s = raw.replace(/\s/g, '');
  if (!/^[1-9]\d{10}$/.test(s)) return false;

  const d = s.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];

  const tenth = ((odd * 7 - even) % 10 + 10) % 10;
  if (d[9] !== tenth) return false;

  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[10] === eleventh;
}

/** Panelde gösterim: 12345678901 → 123*****01 */
export function maskTckn(raw: string): string {
  const s = raw.replace(/\s/g, '');
  if (s.length !== 11) return '***********';
  return `${s.slice(0, 3)}*****${s.slice(-2)}`;
}
