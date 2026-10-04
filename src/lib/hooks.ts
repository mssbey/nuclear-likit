'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const subscribeNoop = () => () => {};

/** Hidrasyon sonrası true — localStorage'a bağlı arayüz sunucu HTML'iyle çakışmasın. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Açık katmanda (çekmece, arama) sayfa kaydırmasını kilitler. */
export function useLockBody(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

/** Escape ile kapanma. */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onEscape();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onEscape]);
}
