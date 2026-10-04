// Kupon panel giriş şeması — SAF modül (birim testleri doğrudan çalıştırır).

import { z } from 'zod';

export const couponInputSchema = z
  .object({
    code: z.string().trim().min(2, 'Kod en az 2 karakter olmalı').max(40),
    type: z.enum(['yüzde', 'tutar', 'ücretsiz-kargo']),
    /** yüzde: on binde (2000 = %20) · tutar: kuruş · ücretsiz-kargo: yoksayılır. */
    value: z.number().int().min(0).default(0),
    minCartTotalMinor: z.number().int().min(0).nullable().default(null),
    maxDiscountMinor: z.number().int().min(0).nullable().default(null),
    startsAt: z.string().datetime().nullable().default(null),
    endsAt: z.string().datetime().nullable().default(null),
    usageLimit: z.number().int().min(1).nullable().default(null),
    usageLimitPerCustomer: z.number().int().min(1).nullable().default(null),
    includeProductIds: z.array(z.string()).default([]),
    excludeProductIds: z.array(z.string()).default([]),
    includeCategoryIds: z.array(z.string()).default([]),
    firstOrderOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
    stackable: z.boolean().default(false),
  })
  .refine((v) => v.type !== 'yüzde' || (v.value > 0 && v.value <= 10_000), {
    message: 'Yüzde 1-10000 arası olmalı (2000 = %20)',
    path: ['value'],
  })
  .refine((v) => v.type !== 'tutar' || v.value > 0, { message: 'Tutar sıfırdan büyük olmalı', path: ['value'] });
export type CouponInput = z.infer<typeof couponInputSchema>;
