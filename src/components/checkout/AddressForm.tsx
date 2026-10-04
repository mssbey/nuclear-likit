'use client';

// Adres formu — il → ilçe → mahalle kademeli seçici. Doğrulama sunucuyla aynı
// Zod şemasıdır (`server/customers/address-schema.ts`, Mixle'dan senkron);
// hatalar alan altında metinle ve aria ile bildirilir.

import { useEffect, useId, useMemo, useState } from 'react';
import { addressInputSchema, type AddressInput } from '@/server/customers/address-schema';
import { iller, ilceler, ilByName } from '@/data/tr-address';
import { maskPhoneInput } from '@/lib/validators/phone';
import { checkoutApi } from '@/lib/checkout-client';
import { cn } from '@/lib/utils';

export type AddressFormValues = {
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  postalCode: string;
  isCorporate: boolean;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  identityNumber: string;
};

export const emptyAddress: AddressFormValues = {
  title: '',
  firstName: '',
  lastName: '',
  phone: '',
  city: '',
  district: '',
  neighborhood: '',
  addressLine: '',
  postalCode: '',
  isCorporate: false,
  companyName: '',
  taxOffice: '',
  taxNumber: '',
  identityNumber: '',
};

export type AddressErrors = Partial<Record<keyof AddressFormValues, string>>;

export function validateAddress(values: AddressFormValues): { data: AddressInput } | { errors: AddressErrors } {
  const parsed = addressInputSchema.safeParse({ ...values, country: 'TR' });
  if (parsed.success) return { data: parsed.data };
  const errors: AddressErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof AddressFormValues;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}

export function AddressForm({
  values,
  onChange,
  errors = {},
  showInvoiceFields = false,
  idPrefix,
}: {
  values: AddressFormValues;
  onChange: (next: AddressFormValues) => void;
  errors?: AddressErrors;
  showInvoiceFields?: boolean;
  idPrefix?: string;
}) {
  const autoId = useId();
  const p = idPrefix ?? autoId;
  const [mahalleler, setMahalleler] = useState<string[]>([]);
  const [mahalleLoading, setMahalleLoading] = useState(false);

  const il = useMemo(() => ilByName(values.city), [values.city]);
  const ilceList = useMemo(() => (il ? ilceler(il.code) : []), [il]);

  useEffect(() => {
    if (!il || !values.district) {
      setMahalleler([]);
      return;
    }
    let alive = true;
    setMahalleLoading(true);
    checkoutApi
      .neighbourhoods(il.code, values.district)
      .then((r) => alive && setMahalleler(r.mahalleler))
      .catch(() => alive && setMahalleler([]))
      .finally(() => alive && setMahalleLoading(false));
    return () => {
      alive = false;
    };
  }, [il, values.district]);

  const set = <K extends keyof AddressFormValues>(key: K, value: AddressFormValues[K]) => onChange({ ...values, [key]: value });
  const a11y = (key: keyof AddressFormValues) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${p}-${key}-err` : undefined,
  });
  const err = (key: keyof AddressFormValues) =>
    errors[key] ? (
      <p id={`${p}-${key}-err`} className="field-error">
        {errors[key]}
      </p>
    ) : null;
  const optional = <span className="font-normal text-subtle">(isteğe bağlı)</span>;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-firstName`} className="field-label">
            Ad
          </label>
          <input id={`${p}-firstName`} className="field" value={values.firstName} autoComplete="given-name" onChange={(e) => set('firstName', e.target.value)} {...a11y('firstName')} />
          {err('firstName')}
        </div>
        <div>
          <label htmlFor={`${p}-lastName`} className="field-label">
            Soyad
          </label>
          <input id={`${p}-lastName`} className="field" value={values.lastName} autoComplete="family-name" onChange={(e) => set('lastName', e.target.value)} {...a11y('lastName')} />
          {err('lastName')}
        </div>
      </div>

      <div>
        <label htmlFor={`${p}-phone`} className="field-label">
          Cep telefonu
        </label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-xl border border-r-0 border-line-strong bg-surface-2 px-3 text-sm text-muted">+90</span>
          <input
            id={`${p}-phone`}
            className="field rounded-l-none"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(5XX) XXX XX XX"
            value={values.phone}
            onChange={(e) => set('phone', maskPhoneInput(e.target.value))}
            {...a11y('phone')}
          />
        </div>
        {err('phone')}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-city`} className="field-label">
            İl
          </label>
          <select id={`${p}-city`} className="field" value={values.city} onChange={(e) => onChange({ ...values, city: e.target.value, district: '', neighborhood: '' })} {...a11y('city')}>
            <option value="">Seçin</option>
            {iller.map((i) => (
              <option key={i.code} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
          {err('city')}
        </div>
        <div>
          <label htmlFor={`${p}-district`} className="field-label">
            İlçe
          </label>
          <select
            id={`${p}-district`}
            className="field"
            value={values.district}
            disabled={!il}
            onChange={(e) => onChange({ ...values, district: e.target.value, neighborhood: '' })}
            {...a11y('district')}
          >
            <option value="">{il ? 'Seçin' : 'Önce il seçin'}</option>
            {ilceList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {err('district')}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
        <div>
          <label htmlFor={`${p}-neighborhood`} className="field-label">
            Mahalle {optional}
          </label>
          {mahalleler.length > 0 ? (
            <select id={`${p}-neighborhood`} className="field" value={values.neighborhood} onChange={(e) => set('neighborhood', e.target.value)}>
              <option value="">Seçin</option>
              {mahalleler.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${p}-neighborhood`}
              className="field"
              value={values.neighborhood}
              placeholder={mahalleLoading ? 'Yükleniyor…' : values.district ? 'Mahalle' : 'Önce ilçe seçin'}
              onChange={(e) => set('neighborhood', e.target.value)}
            />
          )}
        </div>
        <div>
          <label htmlFor={`${p}-postalCode`} className="field-label">
            Posta kodu {optional}
          </label>
          <input
            id={`${p}-postalCode`}
            className="field"
            inputMode="numeric"
            maxLength={5}
            value={values.postalCode}
            onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, ''))}
            {...a11y('postalCode')}
          />
          {err('postalCode')}
        </div>
      </div>

      <div>
        <label htmlFor={`${p}-addressLine`} className="field-label">
          Açık adres
        </label>
        <textarea
          id={`${p}-addressLine`}
          className={cn('field min-h-[84px]')}
          rows={2}
          autoComplete="street-address"
          placeholder="Sokak, bina no, daire"
          value={values.addressLine}
          onChange={(e) => set('addressLine', e.target.value)}
          {...a11y('addressLine')}
        />
        {err('addressLine')}
      </div>

      {showInvoiceFields && (
        <fieldset className="rounded-xl border border-line bg-surface-2/60 p-4">
          <legend className="px-1 text-xs font-semibold">Fatura tipi</legend>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" className="h-4 w-4 accent-[#B6FF3B]" name={`${p}-invoice`} checked={!values.isCorporate} onChange={() => set('isCorporate', false)} />
              Bireysel
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" className="h-4 w-4 accent-[#B6FF3B]" name={`${p}-invoice`} checked={values.isCorporate} onChange={() => set('isCorporate', true)} />
              Kurumsal
            </label>
          </div>
          {values.isCorporate ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={`${p}-companyName`} className="field-label">
                  Firma unvanı
                </label>
                <input id={`${p}-companyName`} className="field" value={values.companyName} onChange={(e) => set('companyName', e.target.value)} {...a11y('companyName')} />
                {err('companyName')}
              </div>
              <div>
                <label htmlFor={`${p}-taxOffice`} className="field-label">
                  Vergi dairesi
                </label>
                <input id={`${p}-taxOffice`} className="field" value={values.taxOffice} onChange={(e) => set('taxOffice', e.target.value)} {...a11y('taxOffice')} />
                {err('taxOffice')}
              </div>
              <div>
                <label htmlFor={`${p}-taxNumber`} className="field-label">
                  Vergi numarası
                </label>
                <input
                  id={`${p}-taxNumber`}
                  className="field"
                  inputMode="numeric"
                  maxLength={10}
                  value={values.taxNumber}
                  onChange={(e) => set('taxNumber', e.target.value.replace(/\D/g, ''))}
                  {...a11y('taxNumber')}
                />
                {err('taxNumber')}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <label htmlFor={`${p}-identityNumber`} className="field-label">
                TC Kimlik No {optional}
              </label>
              <input
                id={`${p}-identityNumber`}
                className="field"
                inputMode="numeric"
                maxLength={11}
                value={values.identityNumber}
                onChange={(e) => set('identityNumber', e.target.value.replace(/\D/g, ''))}
                {...a11y('identityNumber')}
              />
              {err('identityNumber') ?? <p className="field-hint">Şifreli saklanır; yalnız fatura düzenlenirken kullanılır.</p>}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
