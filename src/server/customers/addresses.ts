// Adres defteri — müşteri hesabı için CRUD.
//
// TCKN yalnız şifreli saklanır (`identityNumberEnc`); dışarı asla düz metin
// çıkmaz, `identityNumberMasked` ile maskeli döner. Fatura kesilirken (F7)
// sunucu tarafında `open()` ile çözülür.

import 'server-only';
import { db } from '../db';
import { isEncryptionConfigured, seal, tryOpen } from '../crypto/secret-box';
import { maskTckn } from '@/lib/validators/tckn';
import { addressInputSchema, type AddressInput } from './address-schema';

export interface AddressView {
  id: string;
  type: 'teslimat' | 'fatura';
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  postalCode: string;
  isDefault: boolean;
  isCorporate: boolean;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  identityNumberMasked: string;
  /** Düzenleme formu için: TCKN girilmiş mi (değeri değil). */
  hasIdentityNumber: boolean;
}

export class AddressError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 422 = 422,
    public readonly issues: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AddressError';
  }
}

function toView(row: {
  id: string;
  type: string;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
  isCorporate: boolean;
  companyName: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  identityNumberEnc: string | null;
}): AddressView {
  const tckn = tryOpen(row.identityNumberEnc);
  return {
    id: row.id,
    type: row.type as AddressView['type'],
    title: row.title,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    country: row.country,
    city: row.city,
    district: row.district,
    neighborhood: row.neighborhood,
    addressLine: row.addressLine,
    postalCode: row.postalCode ?? '',
    isDefault: row.isDefault,
    isCorporate: row.isCorporate,
    companyName: row.companyName ?? '',
    taxOffice: row.taxOffice ?? '',
    taxNumber: row.taxNumber ?? '',
    identityNumberMasked: tckn ? maskTckn(tckn) : '',
    hasIdentityNumber: Boolean(row.identityNumberEnc),
  };
}

export async function listAddresses(customerId: string): Promise<AddressView[]> {
  const rows = await db.address.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toView);
}

function parse(raw: unknown): AddressInput {
  const parsed = addressInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: Record<string, string> = {};
    for (const i of parsed.error.issues) issues[i.path.join('.')] ||= i.message;
    throw new AddressError('Adres formunda hatalı alanlar var.', 422, issues);
  }
  return parsed.data;
}

function toData(a: AddressInput, type: 'teslimat' | 'fatura') {
  return {
    type,
    title: a.title || (type === 'fatura' ? 'Fatura adresi' : 'Teslimat adresi'),
    firstName: a.firstName,
    lastName: a.lastName,
    phone: a.phone,
    country: a.country,
    city: a.city,
    district: a.district,
    neighborhood: a.neighborhood,
    addressLine: a.addressLine,
    postalCode: a.postalCode || null,
    isCorporate: a.isCorporate,
    companyName: a.isCorporate ? a.companyName : null,
    taxOffice: a.isCorporate ? a.taxOffice : null,
    taxNumber: a.isCorporate ? a.taxNumber : null,
  };
}

export async function createAddress(
  customerId: string,
  raw: unknown,
  type: 'teslimat' | 'fatura',
): Promise<AddressView> {
  const a = parse(raw);
  const count = await db.address.count({ where: { customerId, type } });
  const row = await db.address.create({
    data: {
      customerId,
      ...toData(a, type),
      isDefault: count === 0,
      identityNumberEnc:
        !a.isCorporate && a.identityNumber && isEncryptionConfigured() ? seal(a.identityNumber) : null,
    },
  });
  return toView(row);
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  raw: unknown,
): Promise<AddressView> {
  const existing = await db.address.findFirst({ where: { id: addressId, customerId } });
  if (!existing) throw new AddressError('Adres bulunamadı.', 404);
  const a = parse(raw);

  // TCKN alanı boş bırakıldıysa mevcut şifreli değer korunur; yeni girildiyse değişir.
  const identityNumberEnc = a.isCorporate
    ? null
    : a.identityNumber && isEncryptionConfigured()
      ? seal(a.identityNumber)
      : existing.identityNumberEnc;

  const row = await db.address.update({
    where: { id: addressId },
    data: { ...toData(a, existing.type as 'teslimat' | 'fatura'), identityNumberEnc },
  });
  return toView(row);
}

export async function deleteAddress(customerId: string, addressId: string): Promise<void> {
  const existing = await db.address.findFirst({ where: { id: addressId, customerId } });
  if (!existing) throw new AddressError('Adres bulunamadı.', 404);
  await db.address.delete({ where: { id: addressId } });

  // Varsayılan silindiyse aynı türden en yenisi varsayılan olsun.
  if (existing.isDefault) {
    const next = await db.address.findFirst({
      where: { customerId, type: existing.type },
      orderBy: { createdAt: 'desc' },
    });
    if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

export async function setDefaultAddress(customerId: string, addressId: string): Promise<void> {
  const existing = await db.address.findFirst({ where: { id: addressId, customerId } });
  if (!existing) throw new AddressError('Adres bulunamadı.', 404);
  await db.$transaction([
    db.address.updateMany({
      where: { customerId, type: existing.type },
      data: { isDefault: false },
    }),
    db.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
}
