// Kargo firması sabitleri — SAF modül (server-only yok).
// Hem panel client bileşenleri hem sunucu servisleri buradan okur.

export const CARRIERS = ['yurtici', 'aras', 'mng', 'surat', 'ptt', 'kendi-kuryemiz', 'manuel'] as const;
export type Carrier = (typeof CARRIERS)[number];

export const carrierLabels: Record<Carrier, string> = {
  yurtici: 'Yurtiçi Kargo',
  aras: 'Aras Kargo',
  mng: 'MNG Kargo',
  surat: 'Sürat Kargo',
  ptt: 'PTT Kargo',
  'kendi-kuryemiz': 'Kendi kuryemiz',
  manuel: 'Diğer (manuel)',
};

export const SHIPMENT_STATUSES = [
  'hazırlanıyor',
  'paketlendi',
  'kargoya-verildi',
  'dağıtımda',
  'teslim-edildi',
  'iade-yolda',
  'kayıp',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Takip numarasından firma takip sayfası. */
export function trackingUrlFor(carrier: string, trackingNumber: string): string | null {
  const n = encodeURIComponent(trackingNumber.trim());
  switch (carrier) {
    case 'yurtici':
      return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`;
    case 'aras':
      return `https://kargotakip.araskargo.com.tr/mainpage.aspx?code=${n}`;
    case 'mng':
      return `https://www.mngkargo.com.tr/gonderitakip?takipNo=${n}`;
    case 'surat':
      return `https://suratkargo.com.tr/KargoTakip/?kargotakipno=${n}`;
    case 'ptt':
      return `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${n}`;
    default:
      return null;
  }
}
