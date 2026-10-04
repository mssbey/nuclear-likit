// İade talebi sabitleri ve doğrulama şeması — SAF modül (client de okur).

import { z } from 'zod';

export const RETURN_STATUSES = ['talep', 'onaylandı', 'reddedildi', 'ürün-alındı', 'tamamlandı'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const returnStatusLabels: Record<ReturnStatus, string> = {
  talep: 'Yeni talep',
  onaylandı: 'Onaylandı (kargo bekleniyor)',
  'ürün-alındı': 'Ürün alındı (iade bekliyor)',
  tamamlandı: 'Tamamlandı',
  reddedildi: 'Reddedildi',
};

/** Sonuçlanmamış (açık) talep durumları — bir siparişte aynı anda yalnız biri olabilir. */
export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = ['talep', 'onaylandı', 'ürün-alındı'];

export const RETURN_REASONS = [
  'hasarlı-geldi',
  'yanlış-ürün',
  'beklediğim-gibi-değil',
  'kullanmadım-vazgeçtim',
  'diğer',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const returnReasonLabels: Record<ReturnReason, string> = {
  'hasarlı-geldi': 'Hasarlı / kusurlu geldi',
  'yanlış-ürün': 'Yanlış ürün gönderildi',
  'beklediğim-gibi-değil': 'Beklediğim gibi değil',
  'kullanmadım-vazgeçtim': 'Kullanmadım, vazgeçtim',
  diğer: 'Diğer',
};

export const returnRequestSchema = z.object({
  items: z
    .array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) }))
    .min(1, 'En az bir ürün seçin'),
  reason: z.enum(RETURN_REASONS),
  description: z.string().trim().max(500).default(''),
});
export type ReturnRequestInput = z.infer<typeof returnRequestSchema>;

export const approveReturnSchema = z.object({
  note: z.string().trim().max(500).default(''),
  returnCode: z.string().trim().max(80).default(''),
});

export const rejectReturnSchema = z.object({
  note: z.string().trim().min(2, 'Red gerekçesi girin').max(500),
});

export const completeReturnSchema = z.object({
  restock: z.boolean().default(true),
  includeShipping: z.boolean().default(false),
  /** Verilirse kalem hesabının yerine geçer. */
  amountMinor: z.number().int().min(1).optional(),
});
