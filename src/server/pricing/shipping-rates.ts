// Kargo tarife motoru — saf.
//
// Bölge (il eşleşmesi) → yöntemler → her yöntem için ücret. Tipler:
//   sabit        : priceMinor
//   desi         : tiers [{ upTo: ölçü, priceMinor }] — ilk eşleşen kademe. Ölçü,
//                  sepetteki ürünlerin toplam ağırlığıdır (kg); ürün ölçüleri
//                  tutulmadığı için hacimsel desi hesaplanamaz. Sepette ağırlığı
//                  girilmemiş ürün varsa ölçü bilinmez ve yöntem SUNULMAZ
//                  (ilk kademeyi uydurmak yerine).
//   tutara-göre  : tiers [{ upTo: sepetKuruş, priceMinor }]
//   ücretsiz     : 0
//   kapıda       : priceMinor — ücretsiz kargo eşiği ve ücretsiz kargo kuponu
//                  UYGULANMAZ (kapıda ödeme hizmet bedeli ayrı, ödeme katmanında).
// Kapıda dışındaki tiplerde `freeOverMinor` (> 0) varsa ve indirim sonrası sepet
// o eşiğe ulaştıysa (≥) ücret 0'dır. `freeOverMinor` 0 veya null → eşik yok.

export type ShippingMethodType = 'sabit' | 'desi' | 'tutara-göre' | 'ücretsiz' | 'kapıda';

export interface RateTier {
  /** Üst sınır (dahil). Sonsuz için null. */
  upTo: number | null;
  priceMinor: number;
}

export interface ShippingMethodRule {
  id: string;
  zoneId: string;
  name: string;
  type: ShippingMethodType;
  priceMinor: number;
  freeOverMinor: number | null;
  tiers: RateTier[] | null;
  estimatedDays: string;
  carrier: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ShippingZoneRule {
  id: string;
  name: string;
  countries: string[];
  /** Boşsa ülkedeki tüm iller. */
  cities: string[];
  sortOrder: number;
  methods: ShippingMethodRule[];
}

export interface ShippingContext {
  country: string;
  city: string;
  /** Sepet ara toplamı (indirim sonrası), kuruş. */
  cartTotalMinor: number;
  /** Kargo ölçüsü (toplam ağırlık, kg). null → sepette ağırlığı bilinmeyen ürün var. */
  desi: number | null;
  /** Kuponla ücretsiz kargo kazanıldı mı. */
  freeShippingCoupon: boolean;
}

export interface ShippingQuote {
  methodId: string;
  zoneId: string;
  name: string;
  type: ShippingMethodType;
  carrier: string | null;
  estimatedDays: string;
  priceMinor: number;
  /** Ücretin neden 0 olduğu (varsa) — arayüzde rozet olarak gösterilir. */
  freeReason: 'eşik' | 'kupon' | 'yöntem' | null;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('tr');

/** Adrese uyan ilk bölge (sortOrder'a göre). */
export function matchZone(zones: ShippingZoneRule[], country: string, city: string) {
  const c = norm(country || 'TR');
  const il = norm(city);
  return [...zones]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((z) => {
      const countryOk = z.countries.length === 0 || z.countries.map(norm).includes(c);
      if (!countryOk) return false;
      if (z.cities.length === 0) return true;
      return z.cities.map(norm).includes(il);
    });
}

function tierPrice(tiers: RateTier[] | null, measure: number, fallback: number): number {
  if (!tiers || tiers.length === 0) return fallback;
  const sorted = [...tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  for (const t of sorted) {
    if (t.upTo == null || measure <= t.upTo) return t.priceMinor;
  }
  // Tüm kademelerin üstü: son kademe.
  return sorted[sorted.length - 1].priceMinor;
}

/** Yöntemin ücretsiz kargo eşiği; kapıda/ücretsiz tiplerde ve 0/boş değerde eşik yoktur. */
export function methodThreshold(method: ShippingMethodRule): number | null {
  if (method.type === 'kapıda' || method.type === 'ücretsiz') return null;
  return method.freeOverMinor != null && method.freeOverMinor > 0 ? method.freeOverMinor : null;
}

/** Bu sepet için yöntem fiyatlanabilir mi (desi yöntemi ağırlık bilgisi ister). */
export function isQuotable(method: ShippingMethodRule, ctx: Pick<ShippingContext, 'desi'>): boolean {
  if (method.type !== 'desi' || !method.tiers?.length) return true;
  return ctx.desi != null;
}

export function quoteMethod(method: ShippingMethodRule, ctx: ShippingContext): ShippingQuote {
  let priceMinor: number;
  let freeReason: ShippingQuote['freeReason'] = null;

  switch (method.type) {
    case 'ücretsiz':
      priceMinor = 0;
      freeReason = 'yöntem';
      break;
    case 'desi':
      priceMinor = tierPrice(method.tiers, ctx.desi ?? 0, method.priceMinor);
      break;
    case 'tutara-göre':
      priceMinor = tierPrice(method.tiers, ctx.cartTotalMinor, method.priceMinor);
      break;
    case 'sabit':
    case 'kapıda':
    default:
      priceMinor = method.priceMinor;
  }

  const threshold = methodThreshold(method);
  if (priceMinor > 0 && threshold != null && ctx.cartTotalMinor >= threshold) {
    priceMinor = 0;
    freeReason = 'eşik';
  }
  if (priceMinor > 0 && ctx.freeShippingCoupon && method.type !== 'kapıda') {
    priceMinor = 0;
    freeReason = 'kupon';
  }

  return {
    methodId: method.id,
    zoneId: method.zoneId,
    name: method.name,
    type: method.type,
    carrier: method.carrier,
    estimatedDays: method.estimatedDays,
    priceMinor: Math.max(0, Math.round(priceMinor)),
    freeReason,
  };
}

/** Adres için sunulabilecek tüm yöntemler, sırayla. Bölge yoksa boş. */
export function quoteShipping(zones: ShippingZoneRule[], ctx: ShippingContext): ShippingQuote[] {
  const zone = matchZone(zones, ctx.country, ctx.city);
  if (!zone) return [];
  return [...zone.methods]
    .filter((m) => m.isActive && isQuotable(m, ctx))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => quoteMethod(m, ctx));
}

export interface ShippingEstimate {
  /** Tahminin dayandığı yöntem — ücret ve eşik HEP bu yöntemden gelir. */
  method: ShippingMethodRule;
  /** Eşik/kupon uygulanmadan önceki ücret, kuruş. */
  baseFeeMinor: number;
  /** Bu yöntemin ücretsiz kargo eşiği, kuruş; yoksa null. */
  thresholdMinor: number | null;
  /** Eşik/kupon uygulanmış ücret. */
  quote: ShippingQuote;
  /**
   * Adres bilinmiyorken ülkedeki diğer adaylar farklı ücret/eşik veriyor mu.
   * true ise kesin ücret adrese göre değişebilir; arayüz bunu genel vaat gibi sunmaz.
   */
  varies: boolean;
}

/**
 * Sepette (adres/yöntem seçilmeden) gösterilecek TEK tahmini yöntem.
 *
 *  - Yöntem seçildiyse o.
 *  - İl biliniyorsa o ile uyan bölgenin ilk uygun yöntemi.
 *  - İl yoksa: ülke geneli (il listesi boş) bölgelerin ilk uygun yöntemi; yoksa
 *    ülkedeki ilk bölgeninki.
 * Uygun = aktif, kapıda değil, bu sepet için fiyatlanabilir. Ücret ve eşik aynı
 * yöntemden okunur ki "X ₺ kargo / Y ₺ üzeri ücretsiz" farklı yöntemlerden
 * karışıp yanlış vaat üretmesin.
 */
export function estimateShipping(
  zones: ShippingZoneRule[],
  opts: {
    country: string;
    city?: string;
    methodId?: string | null;
    cartTotalMinor: number;
    desi: number | null;
    freeShippingCoupon: boolean;
  },
): ShippingEstimate | null {
  const c = norm(opts.country || 'TR');
  const sortedZones = [...zones]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((z) => z.countries.length === 0 || z.countries.map(norm).includes(c));
  const pool = opts.city
    ? [matchZone(zones, opts.country, opts.city)].filter((z): z is ShippingZoneRule => !!z)
    : sortedZones.some((z) => z.cities.length === 0)
      ? sortedZones.filter((z) => z.cities.length === 0)
      : sortedZones;
  const eligible = (z: ShippingZoneRule) =>
    [...z.methods]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((m) => m.isActive && m.type !== 'kapıda' && isQuotable(m, opts));
  const candidates = pool.flatMap(eligible);
  const method =
    (opts.methodId ? pool.flatMap((z) => z.methods).find((m) => m.id === opts.methodId && m.isActive) : undefined) ??
    candidates[0];
  if (!method) return null;

  const ctx: ShippingContext = {
    country: opts.country,
    city: opts.city ?? '',
    cartTotalMinor: opts.cartTotalMinor,
    desi: opts.desi,
    freeShippingCoupon: opts.freeShippingCoupon,
  };
  const baseFeeMinor = quoteMethod({ ...method, freeOverMinor: null }, { ...ctx, freeShippingCoupon: false }).priceMinor;
  const thresholdMinor = methodThreshold(method);

  // Adres bilinmiyorsa: başka bir ildeki müşterinin tahmini (o bölgenin ilk
  // uygun yöntemi) bu tahminden farklı mı? Il özel bölgeler dahil.
  let varies = false;
  if (!opts.city && !opts.methodId) {
    const perZoneDefault = sortedZones
      .map((z) => eligible(z)[0])
      .filter((m): m is ShippingMethodRule => !!m);
    varies = perZoneDefault.some((m) => {
      const fee = quoteMethod({ ...m, freeOverMinor: null }, { ...ctx, freeShippingCoupon: false }).priceMinor;
      return fee !== baseFeeMinor || methodThreshold(m) !== thresholdMinor;
    });
  }

  return { method, baseFeeMinor, thresholdMinor, quote: quoteMethod(method, ctx), varies };
}
