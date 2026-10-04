// Sipariş oluşturma — checkout'un son adımı.
//
// GARANTİLER
//  - Fiyatlar istemciden alınmaz; teklif burada YENİDEN hesaplanır (quote.ts).
//  - Stok rezerve edilir; yetersizse hiçbir şey yazılmaz (transaction).
//  - Aynı Idempotency-Key ile ikinci istek aynı siparişi döndürür, yenisini açmaz.
//  - Kabul edilen yasal metinlerin SÜRÜMÜ siparişe yazılır.
//  - TCKN sipariş anlık görüntüsüne düz metin yazılmaz; şifreli hali adres
//    defterinde kalır, siparişte maskeli gösterim vardır.

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { currentStore } from '../store-context';
import { maskTckn } from '@/lib/validators/tckn';
import { seal, isEncryptionConfigured, tryOpen } from '../crypto/secret-box';
import { reserveStock, releaseExpiredReservations } from '../inventory/reserve';
import { getCurrentLegal } from '../legal/documents';
import { orderEmailVars, queueEmail } from '../notifications/email';
import { getStoreInfo, getStoreSettings } from '../settings';
import { addressInputSchema, type AddressInput, type AddressSnapshot } from '../customers/address-schema';
import { nextOrderNumber } from './numbering';
import { revalidateCatalog } from '../catalog/queries';
import { thankYouUrl } from './access';
import { PAYMENT_METHODS, buildQuote, quoteInputSchema, type CheckoutQuote } from './quote';
import { transitionOrder } from './transitions';
import { startCardPayment } from '../payments/start';

export const consentsSchema = z.object({
  distanceSales: z.literal(true, { errorMap: () => ({ message: 'Mesafeli satış sözleşmesini onaylamalısınız' }) }),
  preInfo: z.literal(true, { errorMap: () => ({ message: 'Ön bilgilendirme formunu onaylamalısınız' }) }),
  kvkk: z.literal(true, { errorMap: () => ({ message: 'KVKK aydınlatma metnini okuduğunuzu onaylamalısınız' }) }),
  /** Pazarlama izni AYRI ve isteğe bağlıdır; satın alma şartı olamaz. */
  marketing: z.boolean().default(false),
});

export const createOrderSchema = quoteInputSchema
  .omit({ city: true, country: true, email: true })
  .extend({
    email: z.string().trim().email('Geçerli bir e-posta girin').max(200),
    /** Kayıtlı müşteri adres defterinden seçtiyse kimlik; form yerine geçer. */
    shippingAddressId: z.string().optional(),
    billingAddressId: z.string().optional(),
    shippingAddress: addressInputSchema.optional(),
    billingSameAsShipping: z.boolean().default(true),
    billingAddress: addressInputSchema.optional(),
    shippingMethodId: z.string().min(1, 'Kargo yöntemi seçin'),
    paymentMethod: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'Ödeme yöntemi seçin' }) }),
    customerNote: z.string().trim().max(500).default(''),
    /** Kart taksit seçimi (1 = tek çekim). Sağlayıcı sayfası nihai taksiti belirler. */
    installment: z.number().int().min(1).max(12).optional(),
    /** Vitrin siparişinde zorunlu; panelden manuel siparişte (source=panel) yok. */
    consents: consentsSchema.optional(),
    /** Misafir, sipariş sonunda hesap açmak isterse. */
    createAccountPassword: z.string().min(10).max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.shippingAddress && !v.shippingAddressId) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress'], message: 'Teslimat adresi girin' });
    }
    if (!v.billingSameAsShipping && !v.billingAddress && !v.billingAddressId) {
      ctx.addIssue({ code: 'custom', path: ['billingAddress'], message: 'Fatura adresi girin' });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface CreateOrderContext {
  customerId: string | null;
  ip: string | null;
  userAgent: string | null;
  idempotencyKey: string | null;
  /** web (varsayılan) | panel | telefon — panel siparişinde onaylar aranmaz. */
  source?: 'web' | 'panel' | 'telefon';
  /** Panel kullanıcısı (manuel sipariş). */
  createdByUserId?: string | null;
  /** Manuel siparişte ödeme zaten alındıysa hemen 'ödendi'ye geçir. */
  markPaid?: boolean;
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 409 | 422 = 422,
    public readonly issues: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

/** Adres defterindeki kaydı form girdisine çevirir (TCKN şifresi çözülerek maskelenir). */
async function resolveStoredAddress(
  customerId: string | null,
  addressId: string | undefined,
): Promise<AddressInput | null> {
  if (!customerId || !addressId) return null;
  const row = await db.address.findFirst({ where: { id: addressId, customerId } });
  if (!row) throw new CheckoutError('Seçilen adres bulunamadı.', 422, { shippingAddressId: 'Adresi yeniden seçin' });
  return {
    title: row.title,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    country: 'TR',
    city: row.city,
    district: row.district,
    neighborhood: row.neighborhood,
    addressLine: row.addressLine,
    postalCode: row.postalCode ?? '',
    isCorporate: row.isCorporate,
    companyName: row.companyName ?? '',
    taxOffice: row.taxOffice ?? '',
    taxNumber: row.taxNumber ?? '',
    identityNumber: tryOpen(row.identityNumberEnc) ?? '',
  };
}

function toSnapshot(a: AddressInput): AddressSnapshot {
  const { identityNumber, ...rest } = a;
  return { ...rest, identityNumberMasked: identityNumber ? maskTckn(identityNumber) : '' };
}

/** Adres defterine yazar (TCKN şifreli). Şifreleme yapılandırılmamışsa TCKN atlanır. */
async function saveAddress(
  tx: Prisma.TransactionClient,
  customerId: string,
  a: AddressInput,
  type: 'teslimat' | 'fatura',
) {
  const enc = a.identityNumber && isEncryptionConfigured() ? seal(a.identityNumber) : null;
  const existingDefault = await tx.address.count({ where: { customerId, type } });
  return tx.address.create({
    data: {
      customerId,
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
      isDefault: existingDefault === 0,
      isCorporate: a.isCorporate,
      companyName: a.isCorporate ? a.companyName : null,
      taxOffice: a.isCorporate ? a.taxOffice : null,
      taxNumber: a.isCorporate ? a.taxNumber : null,
      identityNumberEnc: enc,
    },
  });
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  grandTotalMinor: number;
  /** Aynı Idempotency-Key ile daha önce oluşturulmuştu. */
  reused: boolean;
  /** Kart ödemesinde yönlendirilecek sayfa (test modunda mock 3DS). */
  nextUrl: string | null;
  /** Teşekkür sayfası (imzalı erişim jetonuyla). */
  thankYouUrl: string;
}

export async function createOrder(
  raw: unknown,
  ctx: CreateOrderContext,
): Promise<CreateOrderResult> {
  const store = currentStore();
  // 1) Idempotency — aynı anahtarla gelen ikinci istek yeni sipariş açmaz.
  if (ctx.idempotencyKey) {
    const existing = await db.order.findUnique({ where: { idempotencyKey: ctx.idempotencyKey } });
    if (existing && existing.store === store) {
      return {
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        status: existing.status,
        paymentMethod: existing.paymentMethod,
        grandTotalMinor: existing.grandTotalMinor,
        reused: true,
        // Yeniden gönderimde ödeme sayfasına tekrar yönlendirmek yerine teşekkür
        // sayfası döner; oradan "ödemeyi tamamla" ile devam edilir.
        nextUrl: null,
        thankYouUrl: thankYouUrl(existing.orderNumber, existing.id),
      };
    }
  }

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: Record<string, string> = {};
    for (const i of parsed.error.issues) issues[i.path.join('.')] ||= i.message;
    throw new CheckoutError('Formda eksik veya hatalı alanlar var.', 422, issues);
  }
  const input = parsed.data;
  const email = input.email.toLocaleLowerCase('tr');
  const source = ctx.source ?? 'web';
  if (source === 'web' && !input.consents) {
    throw new CheckoutError('Yasal onaylar zorunludur.', 422, { consents: 'Onayları işaretleyin' });
  }
  const marketing = input.consents?.marketing ?? false;

  // 1b) Adres defterinden seçilen adresler yalnız bu müşteriye aitse kullanılır.
  const shippingFromBook = await resolveStoredAddress(ctx.customerId, input.shippingAddressId);
  const billingFromBook = await resolveStoredAddress(ctx.customerId, input.billingAddressId);
  const shippingAddress = shippingFromBook ?? input.shippingAddress;
  if (!shippingAddress) {
    throw new CheckoutError('Teslimat adresi bulunamadı.', 422, { shippingAddress: 'Adres seçin veya girin' });
  }
  const billingAddress = input.billingSameAsShipping
    ? shippingAddress
    : (billingFromBook ?? input.billingAddress);
  if (!billingAddress) {
    throw new CheckoutError('Fatura adresi bulunamadı.', 422, { billingAddress: 'Adres seçin veya girin' });
  }

  // 2) Süresi dolmuş rezervasyonları temizle ki stok gerçek değeri yansıtsın.
  await db.$transaction((tx) => releaseExpiredReservations(tx));

  // 3) Teklifi sunucuda yeniden hesapla.
  const quote: CheckoutQuote = await buildQuote(
    {
      lines: input.lines,
      city: shippingAddress.city,
      country: shippingAddress.country,
      shippingMethodId: input.shippingMethodId,
      paymentMethod: input.paymentMethod,
      couponCode: input.couponCode,
      email,
    },
    { customerId: ctx.customerId },
  );

  if (quote.cart.lines.length === 0) {
    throw new CheckoutError('Sepetinizdeki ürünler artık satışta değil.', 422);
  }
  if (quote.cart.problems.length) {
    // Stok düşürüldü / ürün çıkarıldı: kullanıcı yeni tutarı görmeli, sessizce yazma.
    throw new CheckoutError(quote.cart.problems[0], 409, { lines: quote.cart.problems.join(' ') });
  }
  if (!quote.selectedShipping) {
    throw new CheckoutError('Seçtiğiniz kargo yöntemi bu adres için geçerli değil.', 422, {
      shippingMethodId: 'Kargo yöntemini yeniden seçin',
    });
  }
  if (!quote.selectedPayment) {
    const opt = quote.paymentOptions.find((p) => p.id === input.paymentMethod);
    throw new CheckoutError(opt?.reason ?? 'Ödeme yöntemi kullanılamıyor.', 422, {
      paymentMethod: opt?.reason ?? 'Ödeme yöntemini yeniden seçin',
    });
  }
  if (quote.coupon && !quote.coupon.ok) {
    throw new CheckoutError(quote.coupon.reason, 422, { couponCode: quote.coupon.reason });
  }

  const [settings, legalDs, legalPi, legalKvkk] = await Promise.all([
    getStoreSettings(),
    getCurrentLegal('mesafeli-satis'),
    getCurrentLegal('on-bilgilendirme'),
    getCurrentLegal('kvkk-aydinlatma'),
  ]);

  const now = new Date();
  const shippingSnapshot = toSnapshot(shippingAddress);
  const billingSnapshot = toSnapshot(billingAddress);
  const t = quote.totals;

  // 4) Her şey tek transaction'da: numara, müşteri, sipariş, kalemler, stok, ödeme, kupon.
  const created = await db.$transaction(async (tx) => {
    // Müşteri: oturum varsa o; yoksa e-postaya göre misafir kaydı (upsert).
    let customerId = ctx.customerId;
    if (!customerId) {
      const guest = await tx.customer.upsert({
        where: { store_email: { store, email } },
        create: {
          store,
          email,
          isGuest: true,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          phone: shippingAddress.phone,
          tags: [],
          marketingOptIn: marketing,
          marketingOptInAt: marketing ? now : null,
        },
        update: {
          // Misafir verisi tazelenir; kayıtlı hesabın adı ezilmez.
          ...(await tx.customer.findUnique({ where: { store_email: { store, email } }, select: { isGuest: true } }))?.isGuest
            ? {
                firstName: shippingAddress.firstName,
                lastName: shippingAddress.lastName,
                phone: shippingAddress.phone,
              }
            : {},
          ...(marketing ? { marketingOptIn: true, marketingOptInAt: now } : {}),
        },
      });
      customerId = guest.id;
    } else if (marketing) {
      await tx.customer.update({
        where: { id: customerId },
        data: { marketingOptIn: true, marketingOptInAt: now },
      });
    }

    // Formdan girilen adresler deftere yazılır; defterden seçilenler zaten kayıtlı.
    if (!shippingFromBook) await saveAddress(tx, customerId, shippingAddress, 'teslimat');
    if (!input.billingSameAsShipping && !billingFromBook) {
      await saveAddress(tx, customerId, billingAddress, 'fatura');
    }

    const orderNumber = await nextOrderNumber(tx, store);

    const order = await tx.order.create({
      data: {
        store,
        orderNumber,
        customerId,
        guestEmail: ctx.customerId ? null : email,
        status: 'ödeme-bekliyor',
        paymentStatus: 'bekliyor',
        fulfillmentStatus: 'hazırlanmadı',
        currency: 'TRY',
        itemsSubtotalMinor: t.itemsSubtotalMinor,
        discountTotalMinor: t.discountTotalMinor,
        shippingTotalMinor: t.shippingTotalMinor,
        taxTotalMinor: t.taxTotalMinor,
        surchargeMinor: t.surchargeMinor,
        grandTotalMinor: t.grandTotalMinor,
        taxBreakdown: t.taxBreakdown as unknown as Prisma.InputJsonValue,
        billingAddress: billingSnapshot as unknown as Prisma.InputJsonValue,
        shippingAddress: shippingSnapshot as unknown as Prisma.InputJsonValue,
        couponCode: t.couponCode,
        couponSnapshot: quote.coupon?.ok
          ? ({ code: quote.coupon.code, type: quote.coupon.type, discountMinor: quote.coupon.discountMinor } as Prisma.InputJsonValue)
          : undefined,
        discountRulesSnapshot: quote.appliedDiscounts.length
          ? (quote.appliedDiscounts as unknown as Prisma.InputJsonValue)
          : undefined,
        paymentMethod: input.paymentMethod,
        shippingMethod: {
          id: quote.selectedShipping!.methodId,
          name: quote.selectedShipping!.name,
          carrier: quote.selectedShipping!.carrier,
          priceMinor: quote.selectedShipping!.priceMinor,
          estimatedDays: quote.selectedShipping!.estimatedDays,
          type: quote.selectedShipping!.type,
        } as Prisma.InputJsonValue,
        customerNote: input.customerNote || null,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 400) ?? null,
        consents: (input.consents
          ? {
              distanceSales: { version: legalDs.version, acceptedAt: now.toISOString() },
              preInfo: { version: legalPi.version, acceptedAt: now.toISOString() },
              kvkk: { version: legalKvkk.version, acceptedAt: now.toISOString() },
              marketing: marketing ? { acceptedAt: now.toISOString() } : null,
            }
          : { manual: true, createdByUserId: ctx.createdByUserId ?? null, at: now.toISOString() }) as Prisma.InputJsonValue,
        source,
        idempotencyKey: ctx.idempotencyKey,
        placedAt: now,
        items: {
          create: t.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            name: l.name,
            variantLabel: l.variantLabel,
            sku: l.sku,
            imageUrl: l.imageUrl,
            unitPriceMinor: l.unitPriceMinor,
            quantity: l.quantity,
            discountMinor: l.discountMinor,
            taxRateBps: l.taxRateBps,
            taxMinor: l.taxMinor,
            lineTotalMinor: l.netLineMinor,
          })),
        },
        events: {
          create: {
            kind: 'durum-degisti',
            fromStatus: 'taslak',
            toStatus: 'ödeme-bekliyor',
            message: source === 'web' ? 'Sipariş vitrinden oluşturuldu' : 'Sipariş panelden oluşturuldu',
            visibleToCustomer: true,
            userId: ctx.createdByUserId ?? null,
          },
        },
        payments: {
          create: {
            provider: input.paymentMethod === 'kart' ? 'kart' : input.paymentMethod,
            status: 'bekliyor',
            amountMinor: t.grandTotalMinor,
            installment: input.installment ?? 1,
            threeDS: input.paymentMethod === 'kart',
          },
        },
      },
    });

    await reserveStock(
      tx,
      t.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      {
        orderId: order.id,
        expiresAt: new Date(now.getTime() + settings.reservationMinutes * 60_000),
        names: Object.fromEntries(t.lines.map((l) => [l.variantId, l.name])),
      },
    );

    if (quote.coupon?.ok) {
      const coupon = await tx.coupon.findUnique({ where: { store_code: { store, code: quote.coupon.code } } });
      if (coupon) {
        await tx.couponRedemption.create({
          data: {
            couponId: coupon.id,
            orderId: order.id,
            customerId,
            email,
            amountMinor: quote.coupon.discountMinor,
          },
        });
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    await tx.customer.update({ where: { id: customerId }, data: { lastOrderAt: now } });

    return order;
  });

  // Stok düştü: vitrin katalog önbelleği tazelensin (stok rozetleri).
  revalidateCatalog();

  // 5a) Manuel sipariş, ödeme zaten alındı: doğrudan ödendi.
  if (ctx.markPaid && source !== 'web') {
    await db.payment.updateMany({
      where: { orderId: created.id, status: 'bekliyor' },
      data: { status: 'başarılı', capturedAt: now, rawResponse: { manual: true, by: ctx.createdByUserId } as Prisma.InputJsonValue },
    });
    await transitionOrder(created.id, 'ödendi', { userId: ctx.createdByUserId ?? null }, {
      note: 'Manuel sipariş — ödeme alındı olarak işaretlendi',
      skipEmail: true,
    });
  }

  // 5b) Kart: sağlayıcıda ödeme başlat (DEMO_MODE → mock). Yönlendirme adresi döner.
  let cardUrl: string | null = null;
  if (input.paymentMethod === 'kart' && !ctx.markPaid) {
    const started = await startCardPayment(created.id, { installment: input.installment });
    cardUrl = started.url;
  }

  // 5) Kapıda ödeme: ödeme teslimatta; sipariş hemen hazırlığa geçer, stok kesinleşir.
  if (input.paymentMethod === 'kapida' && !ctx.markPaid) {
    await transitionOrder(created.id, 'hazırlanıyor', { system: 'kapida' }, {
      note: 'Kapıda ödeme — hazırlığa alındı, ödeme teslimatta alınacak',
      visibleToCustomer: true,
      skipEmail: true,
    });
  }

  // 6) Bildirimler (transaction dışında; başarısız olsa da sipariş kaydı kalır).
  const info = await getStoreInfo();
  const vars = {
    ...orderEmailVars({ ...created, customer: null }),
    sozlesmeSurumu: legalDs.version,
    odemeTalimati: paymentInstruction(input.paymentMethod, info),
  };
  await queueEmail({ to: email, template: 'siparis-alindi', vars, orderId: created.id });
  if (info.notifyEmail) {
    await queueEmail({ to: info.notifyEmail, template: 'yeni-siparis-yonetici', vars, orderId: created.id });
  }

  return {
    orderId: created.id,
    orderNumber: created.orderNumber,
    status: ctx.markPaid && source !== 'web' ? 'ödendi' : input.paymentMethod === 'kapida' ? 'hazırlanıyor' : created.status,
    paymentMethod: created.paymentMethod,
    grandTotalMinor: created.grandTotalMinor,
    reused: false,
    nextUrl: cardUrl,
    thankYouUrl: thankYouUrl(created.orderNumber, created.id),
  };
}

function paymentInstruction(method: string, info: { legalName: string }): string {
  switch (method) {
    case 'havale':
      return `Havale/EFT ile ödeme için IBAN bilgisi sipariş sayfanızda gösterilir. Açıklama alanına sipariş numaranızı yazın. Ödeme ${info.legalName} tarafından onaylanınca siparişiniz hazırlanır.`;
    case 'kapida':
      return 'Ödemeyi teslimat sırasında kuryeye nakit veya kartla yapabilirsiniz.';
    default:
      return '';
  }
}
