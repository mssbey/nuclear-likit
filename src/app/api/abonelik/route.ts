// Footer bülten (e-posta) ve SMS abonelik ucu.
//
// - `POST { kind: "eposta", email }` → NewsletterSubscriber
// - `POST { kind: "sms", phone }`    → SmsSubscriber
//
// Origin doğrulaması + IP başına dakikada 5 deneme. Kayıt idempotenttir:
// aynı e-posta/telefon ikinci kez gönderilirse hata değil "zaten kayıtlı" döner.

import { assertSameOrigin, clientIpOf, readJsonBody, storefrontError } from '@/lib/storefront-http';
import {
  newsletterInputSchema,
  smsInputSchema,
  subscribeNewsletter,
  subscribeSms,
} from '@/server/marketing/subscriptions';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const LIMIT = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ip = clientIpOf(request);
    if (rateLimited(ip)) {
      return Response.json(
        { error: 'rate', message: 'Çok fazla deneme. Bir dakika sonra tekrar deneyin.' },
        { status: 429 },
      );
    }

    const body = await readJsonBody<{ kind?: string; email?: string; phone?: string }>(request);
    const meta = { ip, userAgent: request.headers.get('user-agent') };

    if (body.kind === 'sms') {
      const input = smsInputSchema.parse({ phone: body.phone, source: 'footer' });
      const { created } = await subscribeSms(input, meta);
      return Response.json({
        ok: true,
        created,
        message: created
          ? 'Kaydınız alındı. Bilgilendirmelerden SMS ile haberdar olacaksınız.'
          : 'Bu numara zaten kayıtlı.',
      });
    }

    const input = newsletterInputSchema.parse({ email: body.email, source: 'footer' });
    const { created } = await subscribeNewsletter(input, meta);
    return Response.json({
      ok: true,
      created,
      message: created
        ? 'Kaydınız alındı. Kampanya ve duyurulardan e-posta ile haberdar olacaksınız.'
        : 'Bu e-posta adresi zaten kayıtlı.',
    });
  } catch (err) {
    return storefrontError(err);
  }
}
