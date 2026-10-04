// Sipariş listesi sekmeleri — SAF modül (client bileşenleri de okur).

export const ORDER_TABS = {
  tumu: { label: 'Tümü', statuses: null },
  'odeme-bekleyen': { label: 'Ödeme bekleyen', statuses: ['ödeme-bekliyor', 'başarısız'] },
  hazirlanacak: { label: 'Hazırlanacak', statuses: ['ödendi', 'hazırlanıyor'] },
  kargolanacak: { label: 'Kargolanacak', statuses: ['hazırlanıyor'] },
  kargoda: { label: 'Kargoda', statuses: ['kargolandı'] },
  iade: { label: 'İade', statuses: ['iade-talebi', 'iade-edildi'] },
  iptal: { label: 'İptal / başarısız', statuses: ['iptal', 'başarısız'] },
} as const;

export type OrderTab = keyof typeof ORDER_TABS;
