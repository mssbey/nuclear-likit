'use client';

// Tek sayfalık ödeme: (1) iletişim (2) teslimat (3) kargo (4) ödeme (5) onay.
//
// Kurallar Mixle checkout'uyla aynıdır:
//  - Tutar istemcide hesaplanmaz; her değişiklikte /api/checkout/quote çağrılır.
//  - Idempotency-Key ödeme oturumu başına bir kez üretilir; yeniden gönderim
//    aynı siparişi döndürür, çift sipariş açılmaz.
//  - Yasal metinler sipariş bilgileriyle doldurulmuş gösterilir ve SÜRÜMÜ
//    siparişe yazılır.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, CreditCard, Landmark, Loader2, Lock, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { useCart } from '@/store/cart';
import { useDebounced, useMounted } from '@/lib/hooks';
import { formatMinor } from '@/lib/money';
import { fillLegal, legalProductList } from '@/lib/legal-fill';
import { checkoutApi, CheckoutApiError, type CreateOrderRequest, type QuoteResponse } from '@/lib/checkout-client';
import type { PublicCustomer } from '@/server/customers/public';
import type { AddressView } from '@/server/customers/addresses';
import { AddressForm, emptyAddress, validateAddress, type AddressErrors, type AddressFormValues } from '@/components/checkout/AddressForm';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface LegalText {
  version: number;
  title: string;
  body: string;
}

interface Props {
  customer: PublicCustomer | null;
  addresses: AddressView[];
  legal: { distanceSales: LegalText; preInfo: LegalText; kvkk: LegalText };
  store: { legalName: string; address: string; phone: string; email: string; tax: string; withdrawalDays: number };
}

type PaymentId = 'kart' | 'havale' | 'kapida';
type Consents = { distanceSales: boolean; preInfo: boolean; kvkk: boolean; marketing: boolean };

const PAYMENT_ICONS: Record<PaymentId, typeof CreditCard> = { kart: CreditCard, havale: Landmark, kapida: Wallet };

const viewToForm = (a: AddressView): AddressFormValues => ({
  title: a.title,
  firstName: a.firstName,
  lastName: a.lastName,
  phone: a.phone.replace(/^\+90/, ''),
  city: a.city,
  district: a.district,
  neighborhood: a.neighborhood,
  addressLine: a.addressLine,
  postalCode: a.postalCode,
  isCorporate: a.isCorporate,
  companyName: a.companyName,
  taxOffice: a.taxOffice,
  taxNumber: a.taxNumber,
  identityNumber: '',
});

function Section({ n, title, id, children, disabled }: { n: number; title: string; id: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn('card scroll-mt-24 p-5 sm:p-7', disabled && 'opacity-60')}>
      <h2 id={`${id}-h`} className="flex items-center gap-3 text-lg">
        <span className="tabular grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent">{n}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CheckoutClient({ customer, addresses, legal, store }: Props) {
  const router = useRouter();
  const mounted = useMounted();
  const cartLines = useCart((s) => s.lines);
  const couponCode = useCart((s) => s.couponCode);
  const setCoupon = useCart((s) => s.setCoupon);
  const clearCart = useCart((s) => s.clear);
  const lines = cartLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));

  const shippingBook = addresses.filter((a) => a.type === 'teslimat');
  const billingBook = addresses.filter((a) => a.type === 'fatura');

  const [email, setEmail] = useState(customer?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [shippingSel, setShippingSel] = useState<string>(shippingBook.find((a) => a.isDefault)?.id ?? shippingBook[0]?.id ?? 'yeni');
  const [shipping, setShipping] = useState<AddressFormValues>(() =>
    customer ? { ...emptyAddress, firstName: customer.firstName, lastName: customer.lastName, phone: (customer.phone ?? '').replace(/^\+90/, '') } : emptyAddress,
  );
  const [shippingErrors, setShippingErrors] = useState<AddressErrors>({});
  const [billingSame, setBillingSame] = useState(true);
  const [billingSel, setBillingSel] = useState<string>(billingBook.find((a) => a.isDefault)?.id ?? 'yeni');
  const [billing, setBilling] = useState<AddressFormValues>(emptyAddress);
  const [billingErrors, setBillingErrors] = useState<AddressErrors>({});
  const [shippingMethodId, setShippingMethodId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentId | ''>('');
  const [installment, setInstallment] = useState(1);
  const [customerNote, setCustomerNote] = useState('');
  const [consents, setConsents] = useState<Consents>({ distanceSales: false, preInfo: false, kvkk: false, marketing: false });
  const [consentError, setConsentError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Teklif hatası ayrı tutulur: bir sonraki başarılı teklifte kendiliğinden kalkar.
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())));
  const errorRef = useRef<HTMLParagraphElement>(null);

  const bookAddress = shippingSel !== 'yeni' ? shippingBook.find((x) => x.id === shippingSel) : undefined;
  const activeShipping: AddressFormValues = bookAddress ? viewToForm(bookAddress) : shipping;
  const installmentChoices = quote?.paymentOptions.find((p) => p.id === 'kart')?.installments ?? [];

  const quoteKey = useDebounced(JSON.stringify({ lines, city: activeShipping.city, shippingMethodId, paymentMethod, couponCode, email }), 300);
  useEffect(() => {
    if (!mounted || lines.length === 0) return;
    let alive = true;
    setQuoteLoading(true);
    checkoutApi
      .quote({
        lines,
        city: activeShipping.city || undefined,
        shippingMethodId: shippingMethodId || undefined,
        paymentMethod: paymentMethod || undefined,
        couponCode: couponCode || undefined,
        email: /\S+@\S+\.\S+/.test(email) ? email : undefined,
      })
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setQuoteError(null);
        // Adres değişip seçim geçersizleştiyse sıfırla; tek seçenek varsa otomatik seç.
        if (shippingMethodId && !q.selectedShippingId) setShippingMethodId('');
        if (!shippingMethodId && q.shippingOptions.length === 1 && activeShipping.city) setShippingMethodId(q.shippingOptions[0].methodId);
        if (paymentMethod && !q.selectedPayment) setPaymentMethod('');
      })
      .catch((err: unknown) => alive && setQuoteError(err instanceof Error ? err.message : 'Tutar hesaplanamadı'))
      .finally(() => alive && setQuoteLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, mounted]);

  const fail = (message: string, sectionId?: string) => {
    setSubmitError(message);
    const target = sectionId ? document.getElementById(sectionId) : errorRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async () => {
    setSubmitError(null);
    if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Geçerli bir e-posta adresi girin');
      return fail('E-posta adresini kontrol edin.', 'co-iletisim');
    }
    const body: CreateOrderRequest = {
      lines,
      email,
      billingSameAsShipping: billingSame,
      shippingMethodId,
      paymentMethod: paymentMethod as PaymentId,
      couponCode: couponCode || undefined,
      customerNote: customerNote || undefined,
      installment: paymentMethod === 'kart' ? installment : undefined,
      consents,
    };
    if (shippingSel !== 'yeni') body.shippingAddressId = shippingSel;
    else {
      const r = validateAddress(shipping);
      if ('errors' in r) {
        setShippingErrors(r.errors);
        return fail('Teslimat adresinde eksik alanlar var.', 'co-teslimat');
      }
      body.shippingAddress = r.data;
    }
    if (!billingSame) {
      if (billingSel !== 'yeni') body.billingAddressId = billingSel;
      else {
        const r = validateAddress(billing);
        if ('errors' in r) {
          setBillingErrors(r.errors);
          return fail('Fatura adresinde eksik alanlar var.', 'co-teslimat');
        }
        body.billingAddress = r.data;
      }
    }
    if (!shippingMethodId) return fail('Bir kargo yöntemi seçin.', 'co-kargo');
    if (!paymentMethod || !quote?.selectedPayment) return fail('Bir ödeme yöntemi seçin.', 'co-odeme');
    if (!consents.distanceSales || !consents.preInfo || !consents.kvkk) {
      setConsentError('Devam etmek için zorunlu onayları işaretleyin.');
      return fail('Zorunlu onaylar eksik.', 'co-onay');
    }
    setConsentError(null);
    setSubmitting(true);
    try {
      const result = await checkoutApi.createOrder(body, idempotencyKey);
      if (result.nextUrl) {
        // Kart: doğrulama sayfası, ödeme onaylanınca sepeti temizler.
        router.push(`${result.nextUrl}&d=${encodeURIComponent(result.thankYouUrl)}`);
      } else {
        clearCart();
        router.push(result.thankYouUrl);
      }
    } catch (err) {
      setSubmitting(false);
      if (err instanceof CheckoutApiError) {
        if (err.issues.shippingAddress || err.issues.city) return fail(err.message, 'co-teslimat');
        if (err.issues.shippingMethodId) return fail(err.message, 'co-kargo');
        if (err.issues.paymentMethod) return fail(err.message, 'co-odeme');
        if (err.code === 'stock' || err.issues.lines) setQuote(null);
        return fail(err.message);
      }
      fail('Sipariş oluşturulamadı. Lütfen tekrar deneyin.');
    }
  };

  const t = quote?.totals;
  const legalVars = {
    saticiUnvan: store.legalName,
    saticiAdres: store.address,
    saticiTelefon: store.phone,
    saticiEposta: store.email,
    saticiVergi: store.tax,
    aliciAd: `${activeShipping.firstName} ${activeShipping.lastName}`.trim(),
    aliciAdres: [activeShipping.addressLine, activeShipping.neighborhood, activeShipping.district, activeShipping.city].filter(Boolean).join(', '),
    aliciEposta: email,
    aliciTelefon: activeShipping.phone ? `+90 ${activeShipping.phone}` : '',
    siparisNo: '(sipariş onaylanınca atanır)',
    siparisTarihi: new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(new Date()),
    urunListesi: quote ? legalProductList(quote.lines, formatMinor) : '',
    araToplam: t ? formatMinor(t.itemsSubtotalMinor) : '',
    indirim: t ? formatMinor(t.discountTotalMinor) : '',
    kargoUcreti: t ? (t.shippingTotalMinor === 0 ? 'Ücretsiz' : formatMinor(t.shippingTotalMinor)) : '',
    kdvToplam: t ? formatMinor(t.taxTotalMinor) : '',
    genelToplam: t ? formatMinor(t.grandTotalMinor) : '',
    odemeYontemi: quote?.paymentOptions.find((p) => p.id === paymentMethod)?.label ?? '',
    kargoYontemi: quote?.shippingOptions.find((s) => s.methodId === shippingMethodId)?.name ?? '',
    teslimSuresi: quote?.shippingOptions.find((s) => s.methodId === shippingMethodId)?.estimatedDays ?? '',
    caymaGun: store.withdrawalDays,
  };

  if (!mounted) return <div className="mt-8 h-96 animate-pulse rounded-2xl bg-surface" />;
  if (lines.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        icon={ShoppingBag}
        title="Sepetin boş"
        description="Ödeme adımına geçmek için sepete ürün ekle."
        action={
          <Link href="/urunler" className="btn-primary">
            Ürünlere göz at
          </Link>
        }
      />
    );
  }

  const radioCard = (active: boolean, disabled?: boolean) =>
    cn(
      'flex min-h-14 gap-3 rounded-xl border p-4 text-sm transition-colors',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      active ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-subtle',
    );
  const radio = 'mt-0.5 h-4 w-4 shrink-0 accent-[#B6FF3B]';

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-5">
        <Section n={1} id="co-iletisim" title="İletişim">
          {customer ? (
            <p className="rounded-xl bg-surface-2 p-3.5 text-sm">
              <strong>
                {customer.firstName} {customer.lastName}
              </strong>{' '}
              olarak giriş yaptın · <span className="text-muted">{customer.email}</span>
            </p>
          ) : (
            <p className="mb-4 text-sm text-muted">
              Üye olmadan devam edebilirsin. Hesabın varsa{' '}
              <Link href="/giris?next=/odeme" className="link">
                giriş yap
              </Link>
              , adreslerin hazır gelsin.
            </p>
          )}
          {!customer && (
            <div>
              <label htmlFor="co-email" className="field-label">
                E-posta
              </label>
              <input
                id="co-email"
                type="email"
                autoComplete="email"
                className="field"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                aria-invalid={emailError ? true : undefined}
                aria-describedby="co-email-help"
              />
              <p id="co-email-help" className={emailError ? 'field-error' : 'field-hint'}>
                {emailError ?? 'Sipariş onayı ve kargo bilgisi bu adrese gönderilir.'}
              </p>
            </div>
          )}
        </Section>

        <Section n={2} id="co-teslimat" title="Teslimat adresi">
          {shippingBook.length > 0 && (
            <div className="mb-4 grid gap-2">
              {shippingBook.map((a) => (
                <label key={a.id} className={radioCard(shippingSel === a.id)}>
                  <input type="radio" name="co-ship" className={radio} checked={shippingSel === a.id} onChange={() => setShippingSel(a.id)} />
                  <span>
                    <strong>{a.title}</strong> — {a.firstName} {a.lastName}
                    <span className="block text-muted">
                      {a.addressLine}, {a.district} / {a.city}
                    </span>
                  </span>
                </label>
              ))}
              <label className={radioCard(shippingSel === 'yeni')}>
                <input type="radio" name="co-ship" className={radio} checked={shippingSel === 'yeni'} onChange={() => setShippingSel('yeni')} />
                Yeni adres gir
              </label>
            </div>
          )}
          {shippingSel === 'yeni' && (
            <AddressForm
              values={shipping}
              onChange={(v) => {
                setShipping(v);
                setShippingErrors({});
              }}
              errors={shippingErrors}
              showInvoiceFields={billingSame}
              idPrefix="ship"
            />
          )}

          <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#B6FF3B]" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} />
            Fatura adresim teslimat adresiyle aynı
          </label>
          {!billingSame && (
            <div className="mt-4 rounded-xl border border-line p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Building2 size={16} className="text-accent" aria-hidden="true" /> Fatura adresi
              </p>
              {billingBook.length > 0 && (
                <div className="mb-4 grid gap-2">
                  {billingBook.map((a) => (
                    <label key={a.id} className={radioCard(billingSel === a.id)}>
                      <input type="radio" name="co-bill" className={radio} checked={billingSel === a.id} onChange={() => setBillingSel(a.id)} />
                      <span>
                        <strong>{a.title}</strong> — {a.isCorporate ? a.companyName : `${a.firstName} ${a.lastName}`}
                      </span>
                    </label>
                  ))}
                  <label className={radioCard(billingSel === 'yeni')}>
                    <input type="radio" name="co-bill" className={radio} checked={billingSel === 'yeni'} onChange={() => setBillingSel('yeni')} />
                    Yeni fatura adresi
                  </label>
                </div>
              )}
              {billingSel === 'yeni' && (
                <AddressForm
                  values={billing}
                  onChange={(v) => {
                    setBilling(v);
                    setBillingErrors({});
                  }}
                  errors={billingErrors}
                  showInvoiceFields
                  idPrefix="bill"
                />
              )}
            </div>
          )}
        </Section>

        <Section n={3} id="co-kargo" title="Kargo" disabled={!activeShipping.city}>
          {!activeShipping.city ? (
            <p className="text-sm text-muted">Kargo seçenekleri il seçildikten sonra görünür.</p>
          ) : !quote?.shippingOptions.length ? (
            <p className="text-sm text-muted">{quoteLoading ? 'Kargo seçenekleri hesaplanıyor…' : 'Bu adres için kargo seçeneği bulunamadı.'}</p>
          ) : (
            <div className="grid gap-2" role="radiogroup" aria-label="Kargo yöntemi">
              {quote.shippingOptions.map((s) => (
                <label key={s.methodId} className={radioCard(shippingMethodId === s.methodId)}>
                  <input
                    type="radio"
                    name="co-shipping"
                    className={radio}
                    checked={shippingMethodId === s.methodId}
                    onChange={() => {
                      setShippingMethodId(s.methodId);
                      if (s.type !== 'kapıda' && paymentMethod === 'kapida') setPaymentMethod('');
                    }}
                  />
                  <Truck size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="flex-1">
                    <strong>{s.name}</strong>
                    {s.estimatedDays && <span className="block text-xs text-muted">Tahmini {s.estimatedDays}</span>}
                  </span>
                  <span className="tabular font-semibold">{s.priceMinor === 0 ? <span className="text-success">Ücretsiz</span> : formatMinor(s.priceMinor)}</span>
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section n={4} id="co-odeme" title="Ödeme">
          <div className="grid gap-2" role="radiogroup" aria-label="Ödeme yöntemi">
            {quote?.paymentOptions.map((p) => {
              const Icon = PAYMENT_ICONS[p.id];
              return (
                <label key={p.id} className={radioCard(paymentMethod === p.id, !p.available)}>
                  <input type="radio" name="co-payment" className={radio} disabled={!p.available} checked={paymentMethod === p.id} onChange={() => setPaymentMethod(p.id)} />
                  <Icon size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="flex-1">
                    <strong>{p.label}</strong>
                    {p.testMode && <span className="ml-2 rounded-md bg-hazard-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-hazard">Test modu</span>}
                    <span className="block text-xs text-muted">{p.description}</span>
                    {!p.available && p.reason && <span className="block text-xs text-danger">{p.reason}</span>}
                  </span>
                  {p.surchargeMinor > 0 && <span className="tabular text-xs font-semibold">+{formatMinor(p.surchargeMinor)}</span>}
                </label>
              );
            })}
            {!quote && <p className="text-sm text-muted">Ödeme seçenekleri yükleniyor…</p>}
          </div>
          {paymentMethod === 'kart' && installmentChoices.length > 1 && (
            <fieldset className="mt-4 rounded-xl border border-line p-4">
              <legend className="px-1 text-xs font-semibold">Taksit</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {installmentChoices.map((o) => (
                  <label key={o.count} className={cn(radioCard(installment === o.count), 'min-h-11 items-center justify-between py-2.5')}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="co-installment" className="h-4 w-4 accent-[#B6FF3B]" checked={installment === o.count} onChange={() => setInstallment(o.count)} />
                      {o.count === 1 ? 'Tek çekim' : `${o.count} taksit`}
                    </span>
                    <span className="tabular text-xs text-muted">{o.count === 1 ? formatMinor(o.totalMinor) : `${o.count} × ${formatMinor(o.perMonthMinor)}`}</span>
                  </label>
                ))}
              </div>
              <p className="field-hint">Taksit ve vade farkı bankana göre ödeme sayfasında kesinleşir.</p>
            </fieldset>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Lock size={14} className="text-accent" aria-hidden="true" /> Kart bilgilerin bizde saklanmaz; ödeme bankanın 3D Secure sayfasında alınır.
          </p>
        </Section>

        <Section n={5} id="co-onay" title="Onay">
          <div>
            <label htmlFor="co-note" className="field-label">
              Sipariş notu <span className="font-normal text-subtle">(isteğe bağlı)</span>
            </label>
            <textarea id="co-note" rows={2} maxLength={500} className="field" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
          </div>

          <div className="mt-5 space-y-2">
            <LegalAccordion title={`${legal.preInfo.title} (sürüm ${legal.preInfo.version})`} body={fillLegal(legal.preInfo.body, legalVars)} />
            <LegalAccordion title={`${legal.distanceSales.title} (sürüm ${legal.distanceSales.version})`} body={fillLegal(legal.distanceSales.body, legalVars)} />
            <LegalAccordion title={`${legal.kvkk.title} (sürüm ${legal.kvkk.version})`} body={fillLegal(legal.kvkk.body, legalVars)} />
          </div>

          <fieldset className="mt-5 space-y-1 text-sm" aria-describedby={consentError ? 'co-consent-err' : undefined}>
            <legend className="sr-only">Onaylar</legend>
            {(
              [
                ['preInfo', 'Ön Bilgilendirme Formu’nu okudum, onaylıyorum.', true],
                ['distanceSales', 'Mesafeli Satış Sözleşmesi’ni okudum, onaylıyorum.', true],
                ['kvkk', 'KVKK Aydınlatma Metni’ni okudum.', true],
                ['marketing', 'Kampanya ve yeniliklerden e-posta ile haberdar olmak istiyorum (isteğe bağlı).', false],
              ] as const
            ).map(([key, text, required]) => (
              <label key={key} className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-1.5', !required && 'text-muted')}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#B6FF3B]"
                  checked={consents[key]}
                  onChange={(e) => setConsents({ ...consents, [key]: e.target.checked })}
                />
                <span>
                  {text} {required && <span className="text-danger">*</span>}
                </span>
              </label>
            ))}
            {consentError && (
              <p id="co-consent-err" role="alert" className="field-error">
                {consentError}
              </p>
            )}
          </fieldset>
        </Section>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <OrderSummary quote={quote} loading={quoteLoading} couponCode={couponCode} onCouponChange={setCoupon}>
          {quote?.problems.length ? (
            <ul className="mt-4 space-y-1 rounded-xl bg-hazard-soft p-3 text-xs text-hazard" aria-live="polite">
              {quote.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          <p ref={errorRef} className="mt-4 min-h-5 text-sm text-danger" role="alert" aria-live="assertive">
            {submitError ?? quoteError ?? ''}
          </p>
          <button type="button" className="btn-primary mt-2 h-12 w-full text-base" onClick={submit} disabled={submitting || !quote}>
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Sipariş oluşturuluyor…
              </>
            ) : (
              <>
                <Lock size={17} aria-hidden="true" /> Siparişi tamamla{t ? ` · ${formatMinor(t.grandTotalMinor)}` : ''}
              </>
            )}
          </button>
          <Link href="/sepet" className="btn-ghost mt-2 w-full">
            Sepete dön
          </Link>
        </OrderSummary>
      </div>
    </div>
  );
}

function LegalAccordion({ title, body }: { title: string; body: string }) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium">
        {title}
        <ChevronDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-line px-4 py-3 font-sans text-xs leading-5 text-muted">{body}</pre>
    </details>
  );
}
