// "Yeni" damgasının tarih aralığı.
//
// Panel tarihleri Türkiye takvim günü olarak ('YYYY-MM-DD') tutar; veritabanına
// başlangıç günün ilk anı, bitiş günün son anı (TR saati, UTC+3 — Türkiye 2016'dan
// beri yaz saati uygulamıyor) olarak yazılır. Böylece "1–7 Ekim" aralığı 7 Ekim
// gece yarısına kadar geçerlidir.

const TR_OFFSET = '+03:00';
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' → başlangıç anı (TR 00:00). */
export function trDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000${TR_OFFSET}`);
}

/** 'YYYY-MM-DD' → bitiş anı (TR 23:59:59.999). */
export function trDayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999${TR_OFFSET}`);
}

/** Veritabanı anı → TR takvim günü ('YYYY-MM-DD'). */
export function toTrDay(date: Date): string {
  return new Date(date.getTime() + TR_OFFSET_MS).toISOString().slice(0, 10);
}

export interface NewWindow {
  newFrom: string | null;
  newUntil: string | null;
}

export function hasNewWindow(p: NewWindow): boolean {
  return Boolean(p.newFrom || p.newUntil);
}

/** Tarih aralığı verilmişse ürün `now` anında "yeni" sayılır mı? */
export function isInNewWindow(p: NewWindow, now: Date = new Date()): boolean {
  const t = now.getTime();
  if (p.newFrom && t < trDayStart(p.newFrom).getTime()) return false;
  if (p.newUntil && t > trDayEnd(p.newUntil).getTime()) return false;
  return true;
}

/** Panelde gösterilen durum etiketi. */
export function newWindowState(p: NewWindow, now: Date = new Date()): 'yok' | 'bekliyor' | 'aktif' | 'bitti' {
  if (!hasNewWindow(p)) return 'yok';
  if (p.newFrom && now.getTime() < trDayStart(p.newFrom).getTime()) return 'bekliyor';
  if (p.newUntil && now.getTime() > trDayEnd(p.newUntil).getTime()) return 'bitti';
  return 'aktif';
}
