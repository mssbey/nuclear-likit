// Mixle reposundan ortak iş mantığını kopyalar.
//
// Nuclear Likit yalnız VİTRİNDİR; fiyat, stok, kupon, kargo, ödeme, sipariş ve
// müşteri hesabı kuralları Mixle'daki kodla birebir aynı olmalı (aynı
// veritabanını paylaşırlar). Bu yüzden aşağıdaki yollar BU REPODA DÜZENLENMEZ:
// değişiklik Mixle'da yapılır, sonra burada `npm run sync` çalıştırılıp commit
// edilir. Vercel derlemesi Mixle reposunu görmediği için kopyalar repoda tutulur.
//
//   npm run sync               → kopyala (Mixle: ../mixle.net, MIXLE_DIR ile değişir)
//   npm run sync -- --check    → yalnız karşılaştır; fark varsa çıkış kodu 1

import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mixle = path.resolve(root, process.env.MIXLE_DIR ?? '../mixle.net');
const checkOnly = process.argv.includes('--check');

/** Mixle'dan aynen gelen yollar (klasörse tamamı). */
export const SHARED = [
  'prisma/schema.prisma',
  'src/server',
  'src/types',
  'src/data/tr-address',
  'src/data/content.ts',
  'src/data/nav.ts',
  'src/lib/admin',
  'src/lib/validators',
  'src/lib/flavor-profiles.ts',
  'src/lib/legal-fill.ts',
  'src/lib/money.ts',
  'src/lib/new-badge.ts',
  'src/lib/payment-labels.ts',
  'src/lib/rich-text.ts',
  'src/lib/storefront-http.ts',
  'src/lib/stores.ts',
  'src/lib/checkout-client.ts',
  // Vitrin API uçları — checkout, hesap, ödeme dönüşü, webhook, takip.
  'src/app/api/checkout',
  'src/app/api/hesap',
  'src/app/api/siparis-takibi',
  'src/app/api/payments',
  'src/app/api/webhooks',
  'src/app/api/adres',
  'src/app/api/abonelik',
  'src/app/api/cron/katalog-yenile',
];

/** Testler Mixle'da koşar; buraya kopyalanmaz. */
const skip = (p) => /\.test\.tsx?$/.test(p);

function listFiles(base) {
  if (!existsSync(base)) return [];
  if (statSync(base).isFile()) return [base];
  return readdirSync(base, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(base, e.name);
    return e.isDirectory() ? listFiles(full) : [full];
  });
}

if (!existsSync(path.join(mixle, 'prisma', 'schema.prisma'))) {
  console.error(`Mixle reposu bulunamadı: ${mixle} (MIXLE_DIR ile belirtin)`);
  process.exit(1);
}

let drift = 0;
for (const rel of SHARED) {
  const from = path.join(mixle, rel);
  const to = path.join(root, rel);
  if (!existsSync(from)) {
    console.error(`Mixle'da yok: ${rel}`);
    process.exit(1);
  }
  const src = listFiles(from).filter((f) => !skip(f));
  const srcRel = new Set(src.map((f) => path.relative(from, f)));
  const dst = listFiles(to).filter((f) => !skip(f));

  if (checkOnly) {
    for (const f of src) {
      const target = path.join(to, path.relative(from, f));
      if (!existsSync(target) || !readFileSync(f).equals(readFileSync(target))) {
        console.log(`farklı: ${path.relative(root, target)}`);
        drift += 1;
      }
    }
    for (const f of dst) {
      if (!srcRel.has(path.relative(to, f))) {
        console.log(`fazla: ${path.relative(root, f)}`);
        drift += 1;
      }
    }
    continue;
  }

  // Mixle'da silinen dosyalar burada da silinsin: hedefi temizle, yeniden kopyala.
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, filter: (p) => !skip(p) });
}

if (checkOnly) {
  if (drift) {
    console.error(`${drift} dosya Mixle ile farklı — \`npm run sync\` çalıştırın.`);
    process.exit(1);
  }
  console.log('Ortak kod Mixle ile aynı.');
} else {
  console.log(`${SHARED.length} yol Mixle'dan kopyalandı (${mixle}).`);
}
