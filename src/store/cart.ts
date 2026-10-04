'use client';

// Sepet — tarayıcıda (localStorage) tutulur.
//
// Satırdaki ad/fiyat/görsel yalnız GÖSTERİM içindir (anlık görüntü). Gerçek
// tutar, stok ve indirim her zaman sunucuda `/api/checkout/quote` ile
// hesaplanır; sepet ve ödeme sayfası teklifi oradan alır.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const MAX_QTY = 20;

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string;
  image: string;
  priceMinor: number;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  couponCode: string;
  /** Sepet çekmecesi (header ikonu ve "sepete ekle" sonrası açılır). */
  drawerOpen: boolean;
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setCoupon: (code: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(n) || 1));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      couponCode: '',
      drawerOpen: false,
      add: (line, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === line.variantId);
          const lines = existing
            ? s.lines.map((l) => (l.variantId === line.variantId ? { ...l, ...line, quantity: clampQty(l.quantity + quantity) } : l))
            : [...s.lines, { ...line, quantity: clampQty(quantity) }];
          return { lines, drawerOpen: true };
        }),
      setQuantity: (variantId, quantity) =>
        set((s) => ({ lines: s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: clampQty(quantity) } : l)) })),
      remove: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [], couponCode: '' }),
      setCoupon: (code) => set({ couponCode: code.trim().toUpperCase() }),
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
    }),
    {
      name: 'nuclear-sepet',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, couponCode: s.couponCode }),
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotalMinor = (lines: CartLine[]) => lines.reduce((n, l) => n + l.priceMinor * l.quantity, 0);
