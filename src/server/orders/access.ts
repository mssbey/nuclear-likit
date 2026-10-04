// Sipariş erişim jetonu — teşekkür sayfası için.
//
// /siparis/tamamlandi yalnızca sipariş numarasıyla açılsaydı numaralar sıralı
// olduğu için (NA-2026-000123) başkasının siparişi tahminle görülebilirdi.
// Sipariş oluşturulunca HMAC ile bir jeton üretilir; sayfa jetonsuz açılırsa
// yalnız "siparişiniz alındı" der, detay göstermez.

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  return process.env.SESSION_SECRET ?? 'demo';
}

export function orderAccessToken(orderId: string): string {
  return createHmac('sha256', secret()).update(`siparis-erisim:${orderId}`).digest('base64url');
}

export function verifyOrderAccessToken(orderId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(orderAccessToken(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function thankYouUrl(orderNumber: string, orderId: string): string {
  return `/siparis/tamamlandi?no=${encodeURIComponent(orderNumber)}&t=${orderAccessToken(orderId)}`;
}
