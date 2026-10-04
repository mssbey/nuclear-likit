// Türkiye cep telefonu — normalizasyon ve maske.
//
// Kabul edilen girişler: "05xx xxx xx xx", "5xxxxxxxxx", "+90 5xx …", "90 5xx …".
// Saklanan biçim: E.164 → "+905xxxxxxxxx".
// Gösterim: "+90 (5XX) XXX XX XX".

export function normalizePhoneTR(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{9}$/.test(digits)) return null;
  return `+90${digits}`;
}

export function isValidPhoneTR(raw: string): boolean {
  return normalizePhoneTR(raw) !== null;
}

/** "+905321234567" → "+90 (532) 123 45 67" */
export function formatPhoneTR(e164: string): string {
  const n = normalizePhoneTR(e164);
  if (!n) return e164;
  const d = n.slice(3);
  return `+90 (${d.slice(0, 3)}) ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

/**
 * Kullanıcı yazarken uygulanan maske: rakamları "(5XX) XXX XX XX" kalıbına
 * oturtur; ülke kodu alanın dışında sabit gösterilir.
 */
export function maskPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('90')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 10);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  let out = '';
  if (parts[0]) out += `(${parts[0]}${parts[0].length === 3 ? ')' : ''}`;
  if (parts[1]) out += ` ${parts[1]}`;
  if (parts[2]) out += ` ${parts[2]}`;
  if (parts[3]) out += ` ${parts[3]}`;
  return out;
}
