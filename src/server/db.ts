// Prisma istemcisi — tek örnek (singleton).
// Yalnız sunucu tarafında import edilir; `server-only` bunu derleme anında zorlar.
//
// Prisma 7 bir "driver adapter" ister; bağlantı artık şemadaki `url` üzerinden
// değil, buradan kurulur. Üretimde PostgreSQL kullanılır (bkz.
// prisma/schema.prisma başındaki not) — DATABASE_URL bir postgresql:// bağlantı
// dizesi olmalıdır (Neon, Supabase, Vercel Postgres vb.).

import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
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
      // pg 8'de 'require' zaten 'verify-full' gibi davranır; açıkça yazınca her
      // istekte loglara düşen SSL uyarısı kesilir (davranış aynı).
      if (u.searchParams.get('sslmode') === 'require') u.searchParams.set('sslmode', 'verify-full');
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

/** Bağlantı açılırken alınan, kısa süre sonra kendiliğinden geçen hatalar. */
function isTransientConnectError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : '';
  return (
    code === '53300' || // too_many_connections
    code === '57P03' || // cannot_connect_now
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    /too many connections|connection slots|upstream database|Connection terminated|timeout expired/i.test(msg)
  );
}

const CONNECT_RETRY_DELAYS_MS = [200, 600, 1_500, 3_000];

/**
 * Bağlantı alınamazsa birkaç kez bekleyip yeniden dener. Sorgu henüz
 * gönderilmediği için (hata bağlanma anında) tekrar denemek yazmalarda da
 * güvenlidir; anlık yoğunlukta panel/vitrin hata yerine biraz geç yanıt verir.
 */
class RetryingPool extends pg.Pool {
  private async connectWithRetry(): Promise<pg.PoolClient> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await super.connect();
      } catch (err) {
        const delay = CONNECT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isTransientConnectError(err)) throw err;
        await new Promise((r) => setTimeout(r, delay + Math.random() * 200));
      }
    }
  }

  // pg.Pool.query() bunu geri çağırmalı biçimde, adaptör ise Promise ile çağırır.
  override connect(): Promise<pg.PoolClient>;
  override connect(cb: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): void;
  override connect(cb?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): Promise<pg.PoolClient> | void {
    const p = this.connectWithRetry();
    if (!cb) return p;
    p.then(
      (client) => cb(undefined, client, (release) => client.release(release as Error | boolean | undefined)),
      (err: Error) => cb(err, undefined, () => {}),
    );
  }
}

function createClient(): PrismaClient {
  // Sunucusuz örnekler uzun süre sıcak kalır; boştaki bağlantılar hemen
  // bırakılmazsa üç vitrin + panel Prisma Postgres kotasını doldurur.
  const pool = new RetryingPool({
    connectionString: databaseUrl(),
    max: poolMax(),
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
  // Boştaki bir bağlantı sunucu tarafında koparsa süreç çökmesin.
  pool.on('error', (err) => console.error('[db] boştaki bağlantı hatası', err.message));
  const adapter = new PrismaPg(pool);
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
