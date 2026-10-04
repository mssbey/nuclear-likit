// Roller ve izinler.
//
// TEK DOĞRULUK KAYNAĞI: Bu tablo hem `src/proxy.ts` (rota bazlı, kaba filtre)
// hem de her Route Handler (işlem bazlı, asıl kontrol) tarafından kullanılır.
// Yetki ASLA yalnızca arayüzde gizlenerek uygulanmaz — panelde bir düğmeyi
// saklamak bir güvenlik önlemi değildir, sadece nezakettir.
//
// Bu dosya saf ve bağımlılıksızdır; Edge çalışma zamanında (proxy) da çalışır.

export const ROLES = [
  'sahip',
  'yönetici',
  'editör',
  'sipariş-sorumlusu',
  'görüntüleyici',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const roleLabels: Record<Role, string> = {
  sahip: 'Sahip',
  yönetici: 'Yönetici',
  editör: 'Editör',
  'sipariş-sorumlusu': 'Sipariş Sorumlusu',
  görüntüleyici: 'Görüntüleyici',
};

export const roleDescriptions: Record<Role, string> = {
  sahip: 'Tam yetki. Kullanıcıları ve ödeme ayarlarını yönetebilir.',
  yönetici: 'Kullanıcı yönetimi dışında tüm işlemleri yapabilir.',
  editör: 'Yalnızca katalog: ürün, kategori, koleksiyon.',
  'sipariş-sorumlusu': 'Sipariş, kargo ve iade işlemleri. Ürün silemez.',
  görüntüleyici: 'Salt okunur; hiçbir değişiklik yapamaz.',
};

/**
 * İzin adları `alan:eylem` biçimindedir. Yeni bir yetenek eklerken önce buraya
 * bir izin ekle, sonra rollere dağıt.
 */
export const PERMISSIONS = [
  'katalog:oku',
  'katalog:yaz',
  'katalog:sil',
  'siparis:oku',
  'siparis:yaz',
  'siparis:iade',
  'kargo:yaz',
  'musteri:oku',
  'musteri:yaz',
  'kupon:yaz',
  'stok:yaz',
  'rapor:oku',
  'ayar:oku',
  'ayar:yaz',
  'ayar:odeme',
  'kullanici:yonet',
  'bakim:yaz',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const READ_ONLY: Permission[] = [
  'katalog:oku',
  'siparis:oku',
  'musteri:oku',
  'rapor:oku',
  'ayar:oku',
];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  sahip: ALL,

  // Kullanıcı yönetimi ve ödeme sağlayıcı anahtarları sahibe özeldir.
  yönetici: ALL.filter((p) => p !== 'kullanici:yonet' && p !== 'ayar:odeme'),

  editör: [...READ_ONLY, 'katalog:yaz', 'katalog:sil', 'stok:yaz'],

  // Ürün silemez: 'katalog:sil' verilmez.
  'sipariş-sorumlusu': [
    ...READ_ONLY,
    'siparis:yaz',
    'siparis:iade',
    'kargo:yaz',
    'musteri:yaz',
    'stok:yaz',
  ],

  görüntüleyici: READ_ONLY,
};

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function canAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/**
 * Rota bazlı kaba filtre — `src/proxy.ts` kullanır.
 * Eşleşen ilk kural geçerlidir; hiçbiri eşleşmezse `katalog:oku` yeterlidir
 * (panele girebilen herkes özet ekranını görebilir).
 */
const ROUTE_RULES: { prefix: string; permission: Permission }[] = [
  { prefix: '/admin/ayarlar/odeme', permission: 'ayar:odeme' },
  { prefix: '/admin/ayarlar/kullanicilar', permission: 'kullanici:yonet' },
  { prefix: '/admin/ayarlar', permission: 'ayar:oku' },
  { prefix: '/admin/siparisler', permission: 'siparis:oku' },
  { prefix: '/admin/kargolar', permission: 'siparis:oku' },
  { prefix: '/admin/iadeler', permission: 'siparis:oku' },
  { prefix: '/admin/odemeler', permission: 'siparis:oku' },
  { prefix: '/admin/musteriler', permission: 'musteri:oku' },
  { prefix: '/admin/kuponlar', permission: 'katalog:oku' },
  { prefix: '/admin/indirimler', permission: 'katalog:oku' },
  { prefix: '/admin/stok-yonetimi', permission: 'katalog:oku' },
  { prefix: '/admin/stok', permission: 'katalog:oku' },
  { prefix: '/admin/raporlar', permission: 'rapor:oku' },
  { prefix: '/admin/urunler', permission: 'katalog:oku' },
  { prefix: '/admin/kategoriler', permission: 'katalog:oku' },
  { prefix: '/admin/koleksiyonlar', permission: 'katalog:oku' },
];

export function requiredPermissionForPath(pathname: string): Permission {
  for (const rule of ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.permission;
    }
  }
  return 'katalog:oku';
}
