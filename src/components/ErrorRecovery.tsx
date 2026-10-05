'use client';

// Sunucu hatasında (çoğunlukla veritabanına anlık bağlanamama) gösterilen
// ekran. Önce kendiliğinden birkaç kez yeniden dener; olmazsa kullanıcıya
// "Tekrar dene" sunar. Siyah "This page couldn't load" ekranının yerine geçer.

import { useEffect, useState } from 'react';

const AUTO_RETRY_DELAYS_MS = [1_500, 4_000];
// Son otomatik denemeden bu kadar süre geçtiyse sayaç sıfırlanır.
const RESET_AFTER_MS = 30_000;

declare global {
  interface Window {
    __errorRetry?: { count: number; at: number };
  }
}

export function ErrorRecovery({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    console.error(error);
    const now = Date.now();
    const state = window.__errorRetry && now - window.__errorRetry.at < RESET_AFTER_MS ? window.__errorRetry : { count: 0, at: now };
    const delay = AUTO_RETRY_DELAYS_MS[state.count];
    if (delay === undefined) {
      setWaiting(false);
      return;
    }
    const t = setTimeout(() => {
      window.__errorRetry = { count: state.count + 1, at: Date.now() };
      retry();
    }, delay);
    return () => clearTimeout(t);
  }, [error, retry]);

  const manual = () => {
    window.__errorRetry = undefined;
    window.location.reload();
  };

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 380, textAlign: 'center', color: '#1f2937' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
          {waiting ? 'Sayfa yükleniyor…' : 'Sayfa şu an yüklenemedi'}
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>
          {waiting ? 'Sunucu yoğun, otomatik olarak tekrar deneniyor.' : 'Sunucuya ulaşılamadı. Birkaç saniye sonra tekrar deneyin.'}
        </p>
        {!waiting && (
          <button
            type="button"
            onClick={manual}
            style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#e11d2a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Tekrar dene
          </button>
        )}
      </div>
    </div>
  );
}
