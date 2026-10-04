// Manuel kargo — API'siz her zaman çalışan varsayılan. Takip no panelden girilir.

import { ShippingProviderError, type ShippingProvider } from '../provider';
import { trackingUrlFor } from '../carriers';

export function manuelProvider(carrier: 'manuel' | 'kendi-kuryemiz'): ShippingProvider {
  return {
    id: carrier,
    label: carrier === 'manuel' ? 'Diğer (manuel)' : 'Kendi kuryemiz',
    configured: () => true,
    async createShipment(req) {
      // Gerçek bir API çağrısı yok; panel zaten takip numarasını elle alıyor.
      return { trackingNumber: '', trackingUrl: null, labelUrl: null, raw: { manual: true, shipmentId: req.shipmentId } };
    },
    async track(trackingNumber) {
      void trackingNumber;
      throw new ShippingProviderError('Manuel kargoda otomatik takip yok; durumu panelden güncelleyin.', 501);
    },
    async cancel() {
      // Manuel sevkiyatların iptali doğrudan panelden durum güncellemesiyle yapılır.
    },
  };
}

export function trackingUrlOrNull(carrier: string, trackingNumber: string | null): string | null {
  if (!trackingNumber) return null;
  return trackingUrlFor(carrier, trackingNumber);
}
