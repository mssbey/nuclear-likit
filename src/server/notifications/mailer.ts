// Gerçek e-posta gönderimi — SMTP (nodemailer) veya Resend (REST API).
// Yalnız `DEMO_MODE=false` iken `queueEmail()` tarafından çağrılır. Hata
// fırlatmaz; çağıran taraf (queueEmail) `EmailLog.status`u günceller.

import 'server-only';
import { getEmailSettings } from './settings';
import { log } from '../log';

export interface SendResult {
  ok: boolean;
  error?: string;
  providerId?: string | null;
}

function textToHtml(body: string): string {
  const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="font:14px/1.6 Arial,Helvetica,sans-serif;color:#211923;white-space:pre-wrap">${esc}</div>`;
}

async function sendViaResend(apiKey: string, from: string, to: string, subject: string, html: string, text: string): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body.message ?? `Resend hatası (${res.status})` };
    return { ok: true, providerId: body.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Resend isteği başarısız' };
  }
}

async function sendViaSmtp(
  smtp: { host: string; port: number; secure: boolean; user: string; password: string },
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
    const info = await transport.sendMail({ from, to, subject, html, text });
    return { ok: true, providerId: info.messageId ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SMTP gönderimi başarısız' };
  }
}

/** Gerçek gönderim. Yapılandırma yoksa `{ok:false}` döner, ASLA fırlatmaz. */
export async function sendMailNow(to: string, subject: string, body: string): Promise<SendResult> {
  const s = await getEmailSettings();
  const from = s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail;
  const html = textToHtml(body);

  if (!s.fromEmail) return { ok: false, error: 'Gönderen e-posta adresi ayarlanmamış.' };

  let result: SendResult;
  if (s.provider === 'resend') {
    if (!s.resend.apiKey) return { ok: false, error: 'Resend API anahtarı ayarlanmamış.' };
    result = await sendViaResend(s.resend.apiKey, from, to, subject, html, body);
  } else if (s.provider === 'smtp') {
    if (!s.smtp.host) return { ok: false, error: 'SMTP sunucusu ayarlanmamış.' };
    result = await sendViaSmtp(s.smtp, from, to, subject, html, body);
  } else {
    return { ok: false, error: 'E-posta sağlayıcısı yapılandırılmamış (/admin/ayarlar/eposta).' };
  }

  if (!result.ok) log.warn('eposta', 'gönderim başarısız', { to, provider: s.provider, error: result.error });
  return result;
}
