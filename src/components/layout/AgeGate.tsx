'use client';

// 18+ yaş kapısı — ilk ziyarette tam ekran sorulur; onay tarayıcıda saklanır.
// "Hayır" diyen ziyaretçi siteden çıkarılır. Yasal metinler (/yasal/…) ve
// ödeme dönüş sayfaları kapı arkasında kalmaz ki bağlantılar çalışsın.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { site } from '@/lib/site';

const KEY = 'nuclear-yas-onay';
const OPEN_PATHS = ['/yasal', '/odeme/dogrulama', '/siparis/tamamlandi'];

function readConfirmed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function AgeGate() {
  const pathname = usePathname();
  // Sunucu HTML'inde kapı yoktur (SEO ve ilk boyama); hidrasyondan sonra karar verilir.
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return;
    setNeeded(!readConfirmed());
  }, [pathname]);

  useEffect(() => {
    if (!needed) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [needed]);

  if (!needed) return null;

  const confirm = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Gizli sekmede depolama kapalı olabilir; bu oturum için yine de kapat.
    }
    setNeeded(false);
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-bg/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-desc">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
      <div className="relative w-full max-w-md animate-fade-up rounded-3xl border border-line-strong bg-surface p-8 text-center shadow-lift">
        <LogoMark className="mx-auto h-14 w-14" />
        <p className="eyebrow mt-6 justify-center">
          <ShieldAlert size={14} aria-hidden="true" /> Yaş doğrulaması
        </p>
        <h2 id="age-title" className="mt-3 text-display-sm">
          {site.minimumAge} yaşından büyük müsün?
        </h2>
        <p id="age-desc" className="mt-3 text-sm leading-6 text-muted">
          Bu sitedeki ürünler nikotin içerebilir ve yalnızca {site.minimumAge} yaş ve üzeri yetişkinlere yöneliktir. Nikotin bağımlılık yapan bir maddedir.
        </p>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={confirm} autoFocus>
            Evet, {site.minimumAge}+ yaşındayım
          </button>
          <a href="https://www.google.com" className="btn-secondary">
            Hayır, çıkış yap
          </a>
        </div>
      </div>
    </div>
  );
}
