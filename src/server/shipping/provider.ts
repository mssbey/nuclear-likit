// Kargo sağlayıcı arayüzü.
//
// Her firma (Yurtiçi, Aras, MNG, Sürat, PTT, manuel) bu sözleşmeyi uygular;
// panel ve sipariş akışı sağlayıcıyı bilmez. `manuel` her zaman çalışır: takip
// numarası panelden elle girilir. Diğerleri gerçek taşıyıcı API'sine bağlanmak
// İÇİNDİR — bu sürümde yapılandırılmadıkları için `configured() === false`
// döner ve panel otomatik olarak manuel moda düşer (ödeme sağlayıcılarındaki
// DEMO_MODE deseninin aynısı).
//
// Saf modül: yalnız tipler. Adaptörler `adapters/` altında.

import type { Carrier, ShipmentStatus } from './carriers';

/** Sağlayıcıya iletilen sevkiyat bilgisi — etiket/takip no üretimi için. */
export interface ShippingCreateRequest {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
  from: { name: string; phone: string; city: string; addressLine: string };
  to: { name: string; phone: string; city: string; district: string; addressLine: string; postalCode?: string };
  weightGrams: number | null;
  desi: number | null;
  codAmountMinor: number | null;
  itemCount: number;
}

export interface ShippingCreateResult {
  trackingNumber: string;
  trackingUrl: string | null;
  /** Sağlayıcı gerçek bir etiket PDF/URL üretiyorsa. Yoksa panel kendi etiketini basar. */
  labelUrl: string | null;
  raw: unknown;
}

export interface TrackEvent {
  at: string;
  code: string;
  description: string;
}

export interface TrackResult {
  status: ShipmentStatus;
  events: TrackEvent[];
  deliveredAt: string | null;
  raw: unknown;
}

export class ShippingProviderError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 | 422 | 501 = 422,
  ) {
    super(message);
    this.name = 'ShippingProviderError';
  }
}

export interface ShippingProvider {
  readonly id: Carrier;
  readonly label: string;
  /** Bu istekte sağlayıcı API'si kullanılabilir mi (anahtar tanımlı + etkin). */
  configured(): boolean;
  /** Sağlayıcıda sevkiyat açar ve takip no/etiket döner. Yapılandırılmamışsa fırlatır. */
  createShipment(req: ShippingCreateRequest): Promise<ShippingCreateResult>;
  /** Takip no ile son durumu sorgular. Yapılandırılmamışsa fırlatır. */
  track(trackingNumber: string): Promise<TrackResult>;
  /** Sevkiyatı iptal eder (henüz kargoya verilmediyse). */
  cancel(trackingNumber: string): Promise<void>;
}
