'use client';

import { useEffect } from 'react';
import { useCart } from '@/store/cart';

/** Sipariş oluştuysa sepet boşaltılır (ör. kartla ödemede doğrulama sonrası dönüş). */
export function ClearCartOnMount() {
  const clear = useCart((s) => s.clear);
  useEffect(() => clear(), [clear]);
  return null;
}
