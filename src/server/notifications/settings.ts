// E-posta gönderim ayarları — SMTP veya Resend. DEMO_MODE=true iken hiç
// kullanılmaz (queueEmail yalnız EmailLog'a yazar). Sağlayıcı anahtarları
// F3/F4'teki aynı desenle AES-256-GCM şifrelenip `Setting` tablosuna yazılır;
// panelde kayıt yoksa ortam değişkeni yedek olarak okunur.

import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { readSettingValue, writeSetting } from '../settings';
import { DEFAULT_STORE, STORE_META, type StoreId } from '@/lib/stores';
import { currentStore, deploymentStore } from '../store-context';
import { seal, tryOpen, isEncryptionConfigured } from '../crypto/secret-box';
import { site } from '@/lib/site';

export const emailSettingsSchema = z.object({
  provider: z.enum(['yok', 'smtp', 'resend']).default('yok'),
  fromName: z.string().trim().max(80).default(site.name),
  fromEmail: z.string().trim().max(200).default(''),
  replyTo: z.string().trim().max(200).default(''),
  smtp: z
    .object({
      host: z.string().trim().default(''),
      port: z.number().int().min(1).max(65535).default(587),
      secure: z.boolean().default(false),
      user: z.string().trim().default(''),
      password: z.string().default(''),
    })
    .default({}),
  resend: z.object({ apiKey: z.string().default('') }).default({}),
});
export type EmailSettings = z.output<typeof emailSettingsSchema>;

const SECRET_FIELDS = { smtp: ['password'], resend: ['apiKey'] } as const;
export const EMAIL_SETTING_KEY = 'eposta';

function parseMailFrom(raw: string | undefined): { name: string; email: string } {
  const m = (raw ?? '').match(/^(.*?)<(.+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
  return { name: '', email: (raw ?? '').trim() };
}
const envFrom = parseMailFrom(process.env.MAIL_FROM);
const ENV_FALLBACK = {
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
  },
  resend: { apiKey: process.env.RESEND_API_KEY },
  fromEmail: envFrom.email,
  fromName: envFrom.name,
};

/**
 * Şifreli alanları çözer. `useEnv` yalnız bu dağıtımın kendi mağazası için
 * açıktır: `.env`'deki SMTP/MAIL_FROM yedeği o mağazanındır, panelden başka
 * mağaza adına gönderilen e-postaya karışmamalı.
 */
function decryptSecrets(s: EmailSettings, useEnv = true): EmailSettings {
  const out = structuredClone(s);
  for (const [section, fields] of Object.entries(SECRET_FIELDS) as [keyof typeof SECRET_FIELDS, readonly string[]][]) {
    const target = out[section] as unknown as Record<string, string>;
    for (const f of fields) {
      const v = target[f];
      if (v && v.startsWith('v1.')) target[f] = tryOpen(v) ?? '';
      if (!useEnv) continue;
      if (!target[f]) target[f] = (ENV_FALLBACK[section] as Record<string, string | undefined>)[f] ?? '';
    }
  }
  if (!useEnv) return out;
  if (!out.fromEmail) out.fromEmail = ENV_FALLBACK.fromEmail;
  if (!out.fromName || out.fromName === site.name) out.fromName = ENV_FALLBACK.fromName || out.fromName;
  if (out.provider === 'yok') {
    if (ENV_FALLBACK.resend.apiKey) out.provider = 'resend';
    else if (ENV_FALLBACK.smtp.host) out.provider = 'smtp';
  }
  if (!out.smtp.host && ENV_FALLBACK.smtp.host) out.smtp.host = ENV_FALLBACK.smtp.host;
  if (ENV_FALLBACK.smtp.port) out.smtp.port ||= ENV_FALLBACK.smtp.port;
  return out;
}

/** Sunucu içi: çözülmüş anahtarlarla. Panele verilmez. */
const emailSettingsFor = cache(async (store: StoreId): Promise<EmailSettings> => {
  const value = await readSettingValue(EMAIL_SETTING_KEY, store);
  const parsed = emailSettingsSchema.safeParse(value ?? {});
  const base = parsed.success ? parsed.data : emailSettingsSchema.parse({});
  const out = decryptSecrets(base, store === deploymentStore());
  // Varsayılan gönderen adı Mixle'ınkidir; diğer mağaza kendi adıyla gönderir.
  if (store !== DEFAULT_STORE && out.fromName === site.name) out.fromName = STORE_META[store].label;
  return out;
});

/** Geçerli mağazanın ayarları (istek başına teklenir). */
export const getEmailSettings = (): Promise<EmailSettings> => emailSettingsFor(currentStore());

function maskSecret(value: string): string {
  return value ? `••••${value.slice(-4)}` : '';
}

export async function getEmailSettingsMasked() {
  const s = await getEmailSettings();
  const out = structuredClone(s) as unknown as { smtp: Record<string, unknown>; resend: Record<string, unknown> };
  out.smtp.password = maskSecret(s.smtp.password);
  (out.smtp as Record<string, unknown>).passwordSet = Boolean(s.smtp.password);
  out.resend.apiKey = maskSecret(s.resend.apiKey);
  (out.resend as Record<string, unknown>).apiKeySet = Boolean(s.resend.apiKey);
  return out as unknown as EmailSettings;
}

export async function saveEmailSettings(raw: unknown, updatedByUserId: string): Promise<void> {
  const incoming = emailSettingsSchema.parse(raw);
  const existingValue = await readSettingValue(EMAIL_SETTING_KEY);
  const existing = emailSettingsSchema.safeParse(existingValue ?? {});
  const stored = existing.success ? existing.data : emailSettingsSchema.parse({});

  const next = structuredClone(incoming);
  for (const [section, fields] of Object.entries(SECRET_FIELDS) as [keyof typeof SECRET_FIELDS, readonly string[]][]) {
    const target = next[section] as unknown as Record<string, string>;
    const prev = stored[section] as unknown as Record<string, string>;
    for (const f of fields) {
      const v = String(target[f] ?? '');
      if (!v || v.startsWith('••••')) {
        target[f] = prev[f] ?? '';
      } else {
        if (!isEncryptionConfigured()) {
          throw Object.assign(new Error('ENCRYPTION_KEY tanımlı değil; e-posta anahtarı şifrelenemeden kaydedilemez.'), { status: 422 });
        }
        target[f] = seal(v);
      }
    }
  }

  await writeSetting(EMAIL_SETTING_KEY, next, updatedByUserId, { isSecret: true });
}
