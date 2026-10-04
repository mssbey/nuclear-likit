// Sipariş durum makinesi.
//
// İzinli geçişler TEK bir tabloda tanımlıdır; keyfi geçişe izin verilmez.
// Route Handler'lar `assertTransition()` ile kontrol eder ve geçersiz geçişte
// 409 döner. Her geçiş bir OrderEvent üretir (bkz. transitions.ts).
//
// Bu dosya saf ve bağımlılıksızdır — birim testleri doğrudan çalıştırır.

export const ORDER_STATUSES = [
  'taslak',
  'ödeme-bekliyor',
  'ödendi',
  'hazırlanıyor',
  'kargolandı',
  'teslim-edildi',
  'tamamlandı',
  'iptal',
  'iade-talebi',
  'iade-edildi',
  'başarısız',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'bekliyor',
  'kısmi',
  'ödendi',
  'başarısız',
  'iade-edildi',
  'kısmi-iade',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILLMENT_STATUSES = [
  'hazırlanmadı',
  'kısmi',
  'gönderildi',
  'teslim-edildi',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  taslak: 'Taslak',
  'ödeme-bekliyor': 'Ödeme bekliyor',
  ödendi: 'Ödendi',
  hazırlanıyor: 'Hazırlanıyor',
  kargolandı: 'Kargolandı',
  'teslim-edildi': 'Teslim edildi',
  tamamlandı: 'Tamamlandı',
  iptal: 'İptal edildi',
  'iade-talebi': 'İade talebi',
  'iade-edildi': 'İade edildi',
  başarısız: 'Ödeme başarısız',
};

/**
 * İZİNLİ GEÇİŞ TABLOSU.
 *
 *   taslak → ödeme-bekliyor → ödendi → hazırlanıyor → kargolandı → teslim-edildi → tamamlandı
 *   herhangi bir aşamadan → iptal (kargolanmadıysa)
 *   teslim-edildi → iade-talebi → iade-edildi
 *   ödeme-bekliyor → başarısız
 *
 * Ek kabuller (prompttaki çizgiyi bozmayan, operasyonel gereklilikler):
 *   - başarısız → ödeme-bekliyor: müşteri yeniden ödeme deneyebilir.
 *   - ödendi → hazırlanıyor atlanıp doğrudan kargolandı olabilir (küçük mağaza).
 *   - ödeme-bekliyor → hazırlanıyor: KAPIDA ÖDEME. Ödeme teslimatta alınır;
 *     sipariş ödenmeden hazırlanır, stok bu geçişte kesinleşir. Ödeme durumu
 *     teslimatta panelden "ödeme al" ile kapatılır (F2).
 *   - tamamlandı → iade-talebi: cayma hakkı 14 gün, teslimden sonra otomatik
 *     tamamlanan siparişte de iade açılabilmeli.
 *   - iade-talebi → teslim-edildi / tamamlandı: talep reddedilirse eski duruma dönüş.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  taslak: ['ödeme-bekliyor', 'iptal'],
  'ödeme-bekliyor': ['ödendi', 'hazırlanıyor', 'başarısız', 'iptal'],
  ödendi: ['hazırlanıyor', 'kargolandı', 'iptal'],
  hazırlanıyor: ['kargolandı', 'iptal'],
  kargolandı: ['teslim-edildi'],
  'teslim-edildi': ['tamamlandı', 'iade-talebi'],
  tamamlandı: ['iade-talebi'],
  iptal: [],
  'iade-talebi': ['iade-edildi', 'teslim-edildi', 'tamamlandı'],
  'iade-edildi': [],
  başarısız: ['ödeme-bekliyor', 'iptal'],
};

/** Kargolanmış sayılan durumlar — bunlardan iptal yapılamaz, iade gerekir. */
export const SHIPPED_STATUSES: readonly OrderStatus[] = [
  'kargolandı',
  'teslim-edildi',
  'tamamlandı',
  'iade-talebi',
  'iade-edildi',
];

/** Sonlanmış durumlar — başka geçiş yok. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['iptal', 'iade-edildi'];

/**
 * Ciro/harcama hesaplarına dahil edilen durumlar — ödemesi alınmış (veya
 * kapıda alınacak, teslim edilmiş) siparişler. `taslak`, `ödeme-bekliyor`,
 * `iptal`, `başarısız` hariçtir. Müşteri harcaması (`customers/admin.ts`) ve
 * satış raporları (`reports/*.ts`) aynı tanımı kullanır — tutarlılık için
 * TEK yerden.
 */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  'ödendi',
  'hazırlanıyor',
  'kargolandı',
  'teslim-edildi',
  'tamamlandı',
  'iade-talebi',
  'iade-edildi',
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export class InvalidTransitionError extends Error {
  readonly status = 409 as const;
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(
      `“${orderStatusLabels[from]}” durumundaki sipariş “${orderStatusLabels[to]}” durumuna alınamaz.` +
        (TRANSITIONS[from].length
          ? ` İzinli geçişler: ${TRANSITIONS[from].map((s) => orderStatusLabels[s]).join(', ')}.`
          : ' Bu sipariş sonlanmış.'),
    );
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/**
 * Durum geçişinin yan etkileri — çağıran taraf (transitions.ts) bunları
 * uygular. Burada yalnız NE yapılacağı tanımlanır, NASIL değil; böylece
 * kural tek yerde ve test edilebilir kalır.
 */
export interface TransitionEffects {
  /** Stok rezervasyonunu kesinleştir (rezerve → düşüldü). */
  commitStock: boolean;
  /** Stoku geri ver (iptal / iade). */
  releaseStock: boolean;
  /** Kupon kullanımını geri al. */
  revokeCoupon: boolean;
  /** Gönderilecek e-posta şablonu. */
  email: string | null;
  /** Sipariş üzerinde damgalanacak zaman alanı. */
  stamp: 'paidAt' | 'cancelledAt' | 'completedAt' | null;
}

export function effectsOf(from: OrderStatus, to: OrderStatus): TransitionEffects {
  const none: TransitionEffects = {
    commitStock: false,
    releaseStock: false,
    revokeCoupon: false,
    email: null,
    stamp: null,
  };

  switch (to) {
    case 'ödeme-bekliyor':
      return { ...none, email: from === 'taslak' ? 'siparis-alindi' : null };
    case 'ödendi':
      return { ...none, commitStock: true, email: 'odeme-basarili', stamp: 'paidAt' };
    case 'hazırlanıyor':
      // Kapıda ödeme: ödeme beklenirken hazırlığa geçince stok kesinleşir.
      return { ...none, commitStock: from === 'ödeme-bekliyor' };
    case 'başarısız':
      return { ...none, email: 'odeme-basarisiz' };
    case 'kargolandı':
      return { ...none, email: 'kargoya-verildi' };
    case 'teslim-edildi':
      return { ...none, email: 'teslim-edildi' };
    case 'tamamlandı':
      return { ...none, stamp: 'completedAt' };
    case 'iptal':
      // Ödenmemiş siparişte stok yalnız rezerve; ödenmişte düşülmüş. İki durumda
      // da geri verilir — rezervasyon katmanı hangisi olduğunu bilir.
      return { ...none, releaseStock: true, revokeCoupon: true, email: 'iptal', stamp: 'cancelledAt' };
    case 'iade-talebi':
      return { ...none, email: 'iade-onayi' };
    case 'iade-edildi':
      return { ...none, releaseStock: true, revokeCoupon: true, email: 'iade-tamamlandi' };
    default:
      return none;
  }
}

/** Sipariş durumundan türetilen ödeme/sevkiyat durumları (tutarlılık için). */
export function derivedStatuses(status: OrderStatus): {
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
} {
  switch (status) {
    case 'ödendi':
    case 'hazırlanıyor':
      return { paymentStatus: 'ödendi' };
    case 'kargolandı':
      return { paymentStatus: 'ödendi', fulfillmentStatus: 'gönderildi' };
    case 'teslim-edildi':
    case 'tamamlandı':
      return { paymentStatus: 'ödendi', fulfillmentStatus: 'teslim-edildi' };
    case 'başarısız':
      return { paymentStatus: 'başarısız' };
    case 'iade-edildi':
      return { paymentStatus: 'iade-edildi' };
    default:
      return {};
  }
}
