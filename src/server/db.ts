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
  const adapter = new PrismaPg({ connectionString: databaseUrl(), max: poolMax() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// Dev'de sıcak yeniden yükleme her seferinde yeni bir istemci üretip bağlantı
// sızdırmasın diye globalThis üzerinde saklanır.
export const db: PrismaClient = globalThis.__nefisPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__nefisPrisma = db;
}
