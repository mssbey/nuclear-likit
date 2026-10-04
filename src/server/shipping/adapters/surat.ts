// Sürat Kargo adaptörü — İSKELET.
//
// Sürat Kargo'nun sevkiyat oluşturma/etiket/takip API'si bayi/entegrasyon
// sözleşmesi gerektirir ve firmaya özgü, herkese açık olmayan bir sözleşmedir.
// Bu sürümde gerçek bir HTTP çağrısı YAPILMAZ — yanlış varsayılan bir istek
// gövdesi üretip sessizce hata almaktansa, açıkça "uygulanmadı" demek daha
// güvenlidir. `configured()` panelde ayarların girildiğini göstermek için
// kullanılır; asıl çağrılar gerçek API belgesiyle buraya eklenecek.

import 'server-only';
import { ShippingProviderError, type ShippingProvider } from '../provider';
import { getShippingSettings } from '../settings';

export async function suratProvider(): Promise<ShippingProvider> {
  const settings = await getShippingSettings();
  const cfg = settings.providers.surat;
  const isConfigured = cfg.enabled && Boolean(cfg.apiKey);

  return {
    id: 'surat',
    label: 'Sürat Kargo',
    configured: () => isConfigured,
    async createShipment() {
      throw new ShippingProviderError(
        'Sürat Kargo için gerçek API entegrasyonu bu sürümde yok. Takip numarasını panelden elle girin.',
        501,
      );
    },
    async track() {
      throw new ShippingProviderError('Sürat Kargo için otomatik takip henüz bağlı değil.', 501);
    },
    async cancel() {
      throw new ShippingProviderError('Sürat Kargo için otomatik iptal henüz bağlı değil.', 501);
    },
  };
}
