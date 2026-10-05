// Prisma istemcisi — tek örnek (singleton).
// Yalnız sunucu tarafında import edilir; `server-only` bunu derleme anında zorlar.
//
// Prisma 7 bir "driver adapter" ister; bağlantı artık şemadaki `url` üzerinden
// değil, buradan kurulur. Üretimde PostgreSQL kullanılır (bkz.
// prisma/schema.prisma başındaki not) — DATABASE_URL bir postgresql:// bağlantı
// dizesi olmalıdır (Neon, Supabase, Vercel Postgres vb.).

import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

declare global {
  var __nefisPrisma: PrismaClient | undefined;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL tanımlı değil. .env dosyasına bir PostgreSQL bağlantı dizesi ekleyin (bkz. .env.example).',
    );
  }
  return pooledUrl(url);
}

/**
 * Prisma Postgres doğrudan adresi (`db.prisma.io`) rol başına ~45 bağlantıyla
 * sınırlı; üç vitrin + panelin sunucusuz örnekleri bunu doldurunca "Too many
 * database connections opened" hatası çıkar. Havuzlu adres
 * (`pooled.db.prisma.io`) aynı kimlik bilgileriyle çalışır ve istemci
 * bağlantılarını az sayıda sunucu bağlantısına katlar, yani kota dolmaz.
 * Migrasyon/script'ler bu modülü kullanmaz; onlar doğrudan adreste kalır.
 */
function pooledUrl(url: string): string {
  if (process.env.DATABASE_DIRECT === '1') return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'db.prisma.io') {
      u.hostname = 'pooled.db.prisma.io';
      return u.toString();
    }
  } catch {
    // Ayrıştırılamayan dize olduğu gibi kullanılır.
  }
  return url;
}

/**
 * Süreç başına en çok kaç bağlantı açılacağı.
 *
 * Katalog okuması 7 sorguyu paralel atar; `next build` ise statik sayfaları
 * birçok worker'da aynı anda üretir. Her worker'ın havuzu sınırsız kalırsa
 * Prisma Postgres'in doğrudan bağlantı kotası dolar ("Too many database
 * connections") ve build düşer. Sunucusuz çalışma zamanında da her örnek
 * kendi havuzunu açtığından küçük bir üst sınır doğrudur.
 */
function poolMax(): number {
  const fromEnv = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.floor(fromEnv);
  return process.env.NEXT_PHASE === 'phase-production-build' ? 1 : 4;
}

function createClient(): PrismaClient {
  // Sunucusuz örnekler uzun süre sıcak kalır; boştaki bağlantılar hemen
  // bırakılmazsa üç vitrin + panel Prisma Postgres kotasını doldurur.
  const adapter = new PrismaPg({
    connectionString: databaseUrl(),
    max: poolMax(),
    idleTimeoutMillis: 5_000,
  });
  return new PrismaClient({
    adapter,
    // Varsayılan 5 sn, uzak veritabanında çok kalemli sipariş/iade/durum
    // işlemlerinde aşılıp "Transaction already closed" verebiliyor.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// globalThis üzerinde saklanır: dev'de sıcak yeniden yükleme, üretimde ise bu
// modülün birden çok paket parçasına (sayfa, route handler…) kopyalanması her
// seferinde ayrı bir havuz açıp bağlantı kotasını katlamasın.
export const db: PrismaClient = (globalThis.__nefisPrisma ??= createClient());
