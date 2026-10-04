// Adres doğrulama şeması — hem checkout formu (istemci) hem Route Handler kullanır.
// Saf modül; `server-only` import etmez.

import { z } from 'zod';
import { isValidTckn } from '@/lib/validators/tckn';
import { isValidVkn } from '@/lib/validators/vkn';
import { normalizePhoneTR } from '@/lib/validators/phone';

const name = z.string().trim().min(2, 'En az 2 karakter').max(60);

export const addressInputSchema = z
  .object({
    title: z.string().trim().max(40).default(''),
    firstName: name,
    lastName: name,
    phone: z
      .string()
      .trim()
      .refine((v) => normalizePhoneTR(v) !== null, 'Geçerli bir cep telefonu girin (5xx…)')
      .transform((v) => normalizePhoneTR(v) as string),
    country: z.literal('TR').default('TR'),
    city: z.string().trim().min(1, 'İl seçin').max(40),
    district: z.string().trim().min(1, 'İlçe seçin').max(60),
    neighborhood: z.string().trim().max(80).default(''),
    addressLine: z.string().trim().min(10, 'Sokak, bina ve daire bilgisini yazın').max(300),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'Posta kodu 5 haneli olmalı')
      .or(z.literal(''))
      .default(''),
    isCorporate: z.boolean().default(false),
    companyName: z.string().trim().max(120).default(''),
    taxOffice: z.string().trim().max(60).default(''),
    taxNumber: z.string().trim().max(10).default(''),
    /** TCKN — yalnız bireysel faturada, isteğe bağlı; girildiyse doğrulanır. */
    identityNumber: z.string().trim().max(11).default(''),
  })
  .superRefine((a, ctx) => {
    if (a.isCorporate) {
      if (!a.companyName) {
        ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Firma unvanı zorunlu' });
      }
      if (!a.taxOffice) {
        ctx.addIssue({ code: 'custom', path: ['taxOffice'], message: 'Vergi dairesi zorunlu' });
      }
      if (!isValidVkn(a.taxNumber)) {
        ctx.addIssue({ code: 'custom', path: ['taxNumber'], message: 'Geçerli bir VKN girin (10 hane)' });
      }
    } else if (a.identityNumber && !isValidTckn(a.identityNumber)) {
      ctx.addIssue({ code: 'custom', path: ['identityNumber'], message: 'Geçerli bir TCKN girin (11 hane)' });
    }
  });

export type AddressInput = z.infer<typeof addressInputSchema>;

/**
 * Siparişe yazılan adres anlık görüntüsü. TCKN BURAYA YAZILMAZ — sipariş
 * kaydında düz metin kişisel kimlik saklanmaz; şifreli hali Address tablosunda
 * kalır ve fatura kesilirken oradan okunur.
 */
export type AddressSnapshot = Omit<AddressInput, 'identityNumber'> & {
  /** Panelde göstermek için maskeli TCKN (123*****01) veya boş. */
  identityNumberMasked: string;
};
