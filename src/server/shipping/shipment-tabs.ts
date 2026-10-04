// Sevkiyat listesi sekmeleri — SAF modül (client bileşenleri de okur).

export const SHIPMENT_TABS = {
  tumu: { label: 'Tümü', statuses: null },
  hazirlaniyor: { label: 'Hazırlanıyor', statuses: ['hazırlanıyor', 'paketlendi'] },
  yolda: { label: 'Yolda', statuses: ['kargoya-verildi', 'dağıtımda'] },
  'teslim-edildi': { label: 'Teslim edildi', statuses: ['teslim-edildi'] },
  sorun: { label: 'Sorunlu', statuses: ['iade-yolda', 'kayıp'] },
} as const;

export type ShipmentTab = keyof typeof SHIPMENT_TABS;
