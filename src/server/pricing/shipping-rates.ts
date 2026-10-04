// Kargo tarife motoru — saf.
//
// Bölge (il eşleşmesi) → yöntemler → her yöntem için ücret. Tipler:
//   sabit        : priceMinor
//   desi         : tiers [{ upTo: desi, priceMinor }] — ilk eşleşen kademe
//   tutara-göre  : tiers [{ upTo: sepetKuruş, priceMinor }]
//   ücretsiz     : 0
//   kapıda       : priceMinor (kapıda ödeme hizmet bedeli ayrı, ödeme katmanında)
// Her tipte `freeOverMinor` varsa ve sepet o eşiği geçtiyse ücret 0'dır.

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
  /** Toplam desi (yoksa 0). */
  desi: number;
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

export function quoteMethod(method: ShippingMethodRule, ctx: ShippingContext): ShippingQuote {
  let priceMinor: number;
  let freeReason: ShippingQuote['freeReason'] = null;

  switch (method.type) {
    case 'ücretsiz':
      priceMinor = 0;
      freeReason = 'yöntem';
      break;
    case 'desi':
      priceMinor = tierPrice(method.tiers, ctx.desi, method.priceMinor);
      break;
    case 'tutara-göre':
      priceMinor = tierPrice(method.tiers, ctx.cartTotalMinor, method.priceMinor);
      break;
    case 'sabit':
    case 'kapıda':
    default:
      priceMinor = method.priceMinor;
  }

  if (priceMinor > 0 && method.freeOverMinor != null && ctx.cartTotalMinor >= method.freeOverMinor) {
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
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => quoteMethod(m, ctx));
}
