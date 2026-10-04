// İndirim kuralı panel giriş şeması — SAF modül (birim testleri doğrudan çalıştırır).

import { z } from 'zod';

export const DISCOUNT_RULE_TYPES = ['sepet-yuzde', 'x-al-y-ode'] as const;

export const discountRuleInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(80),
    type: z.enum(DISCOUNT_RULE_TYPES),
    isActive: z.boolean().default(true),
    priority: z.number().int().min(0).max(9999).default(0),
    stackable: z.boolean().default(true),
    includeCategoryIds: z.array(z.string()).default([]),
    includeProductIds: z.array(z.string()).default([]),
    /** sepet-yuzde: on binde (3000 = %30). */
    percentBps: z.number().int().min(0).max(10_000).default(0),
    /** sepet-yuzde: uygun satır toplamı için alt eşik, kuruş. */
    minCartTotalMinor: z.number().int().min(0).nullable().default(null),
    /** x-al-y-ode: X. */
    buyQuantity: z.number().int().min(1).max(999).nullable().default(null),
    /** x-al-y-ode: Y (bedava adet = X - Y). */
    payQuantity: z.number().int().min(0).max(999).nullable().default(null),
    /** x-al-y-ode: kuralın tetiklenmesi için min uygun ürün adedi. */
    minQuantity: z.number().int().min(1).max(999).nullable().default(null),
    startsAt: z.string().datetime().nullable().default(null),
    endsAt: z.string().datetime().nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'sepet-yuzde' && (v.percentBps <= 0 || v.percentBps > 10_000)) {
      ctx.addIssue({
        code: 'custom',
        path: ['percentBps'],
        message: 'Yüzde 1-100 arası olmalı',
      });
    }
    if (v.type === 'x-al-y-ode') {
      if (v.buyQuantity == null) {
        ctx.addIssue({ code: 'custom', path: ['buyQuantity'], message: 'Alınan adet gerekli' });
      }
      if (v.payQuantity == null) {
        ctx.addIssue({ code: 'custom', path: ['payQuantity'], message: 'Ödenen adet gerekli' });
      }
      if (v.buyQuantity != null && v.payQuantity != null && v.payQuantity >= v.buyQuantity) {
        ctx.addIssue({
          code: 'custom',
          path: ['payQuantity'],
          message: 'Ödenen adet, alınan adetten küçük olmalı',
        });
      }
    }
  });

export type DiscountRuleInput = z.infer<typeof discountRuleInputSchema>;
