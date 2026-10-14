// Üyelikte gösterilen ve onaylanan yasal metinler.
//
// Kayıt formu (e-posta veya Google/Apple) Üyelik Sözleşmesi ile KVKK
// Aydınlatma Metni'nin YAYINDAKİ sürümünü satıcı bilgileriyle doldurulmuş
// gösterir; müşteri onaylayınca o sürüm numaraları `Customer.consents`e yazılır.

import 'server-only';
import { ensureDefaultLegalDocuments, fillLegal, getCurrentLegal } from '../legal/documents';
import { getStoreInfo, getStoreSettings } from '../settings';

export interface SignupLegalText {
  version: number;
  title: string;
  body: string;
}

export interface SignupLegal {
  uyelik: SignupLegalText;
  kvkk: SignupLegalText;
}

export async function getSignupLegal(): Promise<SignupLegal> {
  await ensureDefaultLegalDocuments();
  const [uyelik, kvkk, info, settings] = await Promise.all([
    getCurrentLegal('uyelik-sozlesmesi'),
    getCurrentLegal('kvkk-aydinlatma'),
    getStoreInfo(),
    getStoreSettings(),
  ]);
  const vars = {
    saticiUnvan: info.legalName,
    saticiAdres: [info.address, info.city].filter(Boolean).join(', '),
    saticiTelefon: info.phone,
    saticiEposta: info.email,
    saticiVergi: [info.taxOffice, info.taxNumber].filter(Boolean).join(' / '),
    caymaGun: settings.withdrawalDays,
  };
  const pick = (d: typeof uyelik): SignupLegalText => ({ version: d.version, title: d.title, body: fillLegal(d.body, vars) });
  return { uyelik: pick(uyelik), kvkk: pick(kvkk) };
}

export type SignupChannel = 'eposta' | 'google' | 'apple';

/** `Customer.consents` kaydı — hangi sürüm, ne zaman, hangi kanaldan, hangi IP'den. */
export async function buildSignupConsents(channel: SignupChannel, marketingOptIn: boolean, ip: string) {
  const legal = await getSignupLegal();
  const at = new Date().toISOString();
  return {
    uyelik: { v: legal.uyelik.version, at },
    kvkk: { v: legal.kvkk.version, at },
    ...(marketingOptIn ? { etk: { at } } : {}),
    kanal: channel,
    ip,
  };
}
