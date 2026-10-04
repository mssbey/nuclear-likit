// Vergi Kimlik Numarası doğrulaması — GİB algoritması.
//
//  - 10 hane
//  - i = 1..9 için: t = (d[i] + (10 − i)) mod 10;  v = (t × 2^(10−i)) mod 9;
//    t ≠ 0 ve v = 0 ise v = 9
//  - kontrol = (10 − (Σv mod 10)) mod 10, son haneye eşit olmalı
//
// Yalnız biçim doğrulaması; mükellefin gerçekliğini doğrulamaz.

export function isValidVkn(raw: string): boolean {
  const s = raw.replace(/\s/g, '');
  if (!/^\d{10}$/.test(s)) return false;

  const d = s.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const t = (d[i] + (9 - i)) % 10;
    let v = (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  }
  const check = (10 - (sum % 10)) % 10;
  return d[9] === check;
}

export function maskVkn(raw: string): string {
  const s = raw.replace(/\s/g, '');
  if (s.length !== 10) return '**********';
  return `${s.slice(0, 2)}******${s.slice(-2)}`;
}
