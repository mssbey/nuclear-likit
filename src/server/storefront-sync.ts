// Diğer vitrin dağıtımlarına "önbelleğini yenile" bildirimi.
//
// Panel Mixle dağıtımında çalışır; `revalidateTag` yalnız bu dağıtımın
// önbelleğini düşürür. Ayrı Vercel projesindeki vitrin (Nuclear Likit) eski
// fiyat/stok göstermesin diye katalog ya da içerik yazıldığında ona da haber
// verilir:
//
//   STOREFRONT_REVALIDATE_URLS = https://nuclearlikit.com/api/yenile   (virgülle birden çok)
//   REVALIDATE_SECRET           = iki dağıtımda aynı rastgele dize
//
// Değişkenler yoksa hiçbir şey yapmaz (vitrin dağıtımlarında da tanımsızdır).
// İstek yanıtlandıktan SONRA (`after`) ve istek başına bir kez gönderilir:
// toplu işlemler `revalidateCatalog`'u yüzlerce kez çağırabilir.

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';

let pending = false;

function targets(): string[] {
  return (process.env.STOREFRONT_REVALIDATE_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ping(urls: string[], secret: string): Promise<void> {
  await Promise.all(
    urls.map((url) =>
      fetch(url, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) })
        .then((r) => {
          if (!r.ok) console.error(`[vitrin-yenile] ${url} → ${r.status}`);
        })
        .catch((err: unknown) => console.error(`[vitrin-yenile] ${url} ulaşılamadı:`, err)),
    ),
  );
}

export function notifyStorefronts(): void {
  const urls = targets();
  const secret = process.env.REVALIDATE_SECRET;
  if (!urls.length || !secret || pending) return;
  pending = true;
  const run = async () => {
    pending = false;
    await ping(urls, secret);
  };
  try {
    after(run);
  } catch {
    // İstek bağlamı dışında (betik vb.) — doğrudan gönder.
    void run();
  }
}

// ------------------------------------------------------------- önizleme ---
//
// Panel, başka dağıtımdaki vitrinde (taslak dahil) ürün önizlemesi açarken
// kısa ömürlü imzalı bağlantı üretir; vitrin `/api/onizleme` imzayı aynı
// `REVALIDATE_SECRET` ile doğrulayıp Draft Mode'u açar.

const PREVIEW_TTL_MS = 10 * 60_000;

function previewMac(slug: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`onizleme:${slug}:${exp}`).digest('base64url');
}

/** `?slug=…&exp=…&sig=…` sorgu dizesi; sır tanımlı değilse null. */
export function signPreviewQuery(slug: string, now = Date.now()): string | null {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return null;
  const exp = now + PREVIEW_TTL_MS;
  return new URLSearchParams({ slug, exp: String(exp), sig: previewMac(slug, exp, secret) }).toString();
}

export function verifyPreviewQuery(slug: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  const expMs = Number(exp);
  if (!secret || !sig || !Number.isFinite(expMs) || expMs < now) return false;
  const a = Buffer.from(previewMac(slug, expMs, secret));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
