// Ödeme yöntemi etiketleri — saf, istemci ve sunucuda kullanılır.

export function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'havale':
      return 'Havale / EFT';
    case 'kapida':
      return 'Kapıda ödeme';
    case 'kart':
      return 'Kredi / banka kartı';
    case 'mock':
      return 'Test ödemesi';
    case 'nakit':
      return 'Nakit';
    case 'pos':
      return 'POS';
    default:
      return method || '—';
  }
}

/** Sağlayıcı kimliği → panel etiketi. */
export const PROVIDER_LABELS: Record<string, string> = {
  mock: 'Test (mock)',
  iyzico: 'iyzico',
  paytr: 'PayTR',
  stripe: 'Stripe',
  havale: 'Havale / EFT',
  kapida: 'Kapıda ödeme',
  kart: 'Kart',
  manuel: 'Manuel',
};
