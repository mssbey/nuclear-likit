// e-Fatura / e-Arşiv sağlayıcı arayüzü — İSKELET, hiçbir yerden ÇAĞRILMAZ.
//
// Türkiye'de e-fatura, GİB (Gelir İdaresi Başkanlığı) onaylı bir özel
// entegratör (Logo, Foriba, Paraşüt, İzibiz, Nesbilgi vb.) üzerinden kesilir.
// Bu, ödeme/kargo sağlayıcılarının aksine üçüncü tarafın herkese açık bir
// REST API'si değildir — entegratörle ticari sözleşme + firma/GİB kaydı
// gerekir ve her entegratörün kendi (genelde SOAP tabanlı) API'si, kendi
// XML şeması ve kendi test/canlı ortam süreci vardır.
//
// Bu yüzden burada GERÇEK bir istek atmak yerine yalnızca sözleşme (interface)
// tanımlıdır — hangi entegratör seçilirse seçilsin panelin geri kalanının
// (sipariş, ödeme, muhasebe) değişmeden çalışması için. Şu an panelde üretilen
// belge (`/admin/siparisler/[id]/yazdir`) bilgi fişi/irsaliyedir, e-Fatura
// YERİNE GEÇMEZ — bu açıkça belirtilir (bkz. `PrintDocument.tsx`).
//
// Gerçek entegrasyon için: seçilen entegratörün API belgesini okuyun, bu
// arayüzü uygulayan bir `adapters/<entegratör>.ts` yazın, `registry.ts`
// ekleyin (ödeme/kargo sağlayıcılarındaki desenin aynısı), ve sipariş
// tamamlandığında (`state-machine.ts` effectsOf) veya panelden manuel
// tetiklenen bir "Fatura kes" aksiyonu ekleyin.

export interface EInvoiceLine {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  totalMinor: number;
}

export interface EInvoiceRequest {
  orderId: string;
  orderNumber: string;
  buyer: {
    isCorporate: boolean;
    fullName: string;
    /** Bireysel: TCKN (11 hane). Kurumsal: VKN (10 hane). */
    identityNumber: string;
    taxOffice?: string;
    address: string;
    city: string;
    email: string;
  };
  lines: EInvoiceLine[];
  grandTotalMinor: number;
}

export type EInvoiceStatus = 'taslak' | 'kesildi' | 'reddedildi' | 'iptal';

export interface EInvoiceResult {
  ok: boolean;
  /** Entegratörün belge kimliği (UUID/ETTN vb.). */
  documentId: string | null;
  status: EInvoiceStatus;
  /** Belgeyi görüntüleme/indirme adresi (varsa). */
  url: string | null;
  errorMessage?: string | null;
  raw: unknown;
}

export interface EInvoiceProvider {
  readonly id: string;
  readonly label: string;
  configured(): boolean;
  issueInvoice(req: EInvoiceRequest): Promise<EInvoiceResult>;
  getStatus(documentId: string): Promise<EInvoiceResult>;
  cancelInvoice(documentId: string, reason: string): Promise<EInvoiceResult>;
}
