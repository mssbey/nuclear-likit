// Tat profilleri (Meyveli, Ferah, Tatlı…) — panelden eklenip çıkarılabilir.
//
// Liste `Setting` tablosunda (`tat-profilleri`) tutulur; kayıt yoksa aşağıdaki
// varsayılan sekiz profil döner. Ürünler profili `id` (slug) ile saklar; bu
// yüzden etiket değiştirmek ürünleri etkilemez. Silinen bir profilin id'si
// ürünlerde kalsa da vitrin/panel yalnız tanımlı profilleri gösterir.

import { z } from 'zod';

export interface FlavorProfileDef {
  id: string;
  label: string;
}

export const DEFAULT_FLAVOR_PROFILES: FlavorProfileDef[] = [
  { id: 'meyveli', label: 'Meyveli' },
  { id: 'ferah', label: 'Ferah' },
  { id: 'tatli', label: 'Tatlı' },
  { id: 'eksi', label: 'Ekşi' },
  { id: 'kremsi', label: 'Kremsi' },
  { id: 'tutun', label: 'Tütün' },
  { id: 'icecek', label: 'İçecek' },
  { id: 'mentollu', label: 'Mentollü' },
];

export const flavorProfileIdSchema = z
  .string()
  .trim()
  .min(1, 'Profil kimliği zorunlu')
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Geçersiz profil kimliği');

export const flavorProfileListSchema = z
  .array(
    z.object({
      id: flavorProfileIdSchema,
      label: z.string().trim().min(1, 'Profil adı zorunlu').max(40, 'Profil adı en fazla 40 karakter'),
    }),
  )
  .max(40, 'En fazla 40 profil tanımlanabilir')
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, 'Aynı profil iki kez tanımlanamaz');

export function flavorProfileLabel(list: FlavorProfileDef[], id: string): string {
  return list.find((p) => p.id === id)?.label ?? id;
}
