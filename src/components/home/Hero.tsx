'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductCardData } from '@/lib/product';
import { formatMinor } from '@/lib/money';

/** Marka paleti: lime vurgu, yeşil, uyarı sarısı ve nane. */
const LIME = '#B6FF3B';
const GREEN = '#46E08A';
const HAZARD = '#FFC53D';
const MINT = '#5CFFC1';
const PALE = '#CBFF70';

interface Slide {
  kicker: string;
  title: [string, string];
  c: string;
  c2: string;
  href: string;
  cta: string;
  lead?: string;
  price?: { now: number; was: number | null };
  art: 'bottle' | 'pod';
  label: string;
  bottles: { color: string; width: number }[];
}

const AUTOPLAY_MS = 6500;

export function Hero({ spotlight, flavors }: { spotlight: ProductCardData | undefined; flavors: string[] }) {
  const slides: Slide[] = [
    {
      kicker: 'NUCLEAR LIKIT · SEÇİLMİŞ KOLEKSİYON',
      title: ['Yoğun Aroma', 'Sıfır Taviz'],
      c: LIME,
      c2: GREEN,
      href: spotlight ? `/urun/${spotlight.slug}` : '/urunler',
      cta: spotlight ? 'Öne Çıkanı İncele' : 'Koleksiyonu Keşfet',
      price: spotlight ? { now: spotlight.priceMinor, was: spotlight.compareAtMinor ?? null } : undefined,
      lead: spotlight ? undefined : 'Karakteri olan aromalar, özenle seçilmiş seriler.',
      art: 'bottle',
      label: 'NUCLEAR',
      bottles: [
        { color: GREEN, width: 84 },
        { color: LIME, width: 110 },
        { color: PALE, width: 140 },
        { color: HAZARD, width: 110 },
        { color: MINT, width: 84 },
      ],
    },
    {
      kicker: 'KAMPANYALAR · SINIRLI STOK',
      title: ['Radyoaktif', 'Fırsatlar'],
      c: HAZARD,
      c2: LIME,
      href: '/kampanyalar',
      cta: 'Kampanyaları Gör',
      lead: 'Seçili serilerde indirimli fiyatlar. Stoklar tükenmeden yerini al.',
      art: 'bottle',
      label: 'SALE',
      bottles: [
        { color: LIME, width: 78 },
        { color: HAZARD, width: 104 },
        { color: PALE, width: 132 },
        { color: GREEN, width: 104 },
        { color: HAZARD, width: 78 },
      ],
    },
    {
      kicker: 'HIZLI VE GÜVENLİ GÖNDERİM',
      title: ['1–3 İş Gününde', 'Kapında'],
      c: MINT,
      c2: LIME,
      href: '/urunler?sirala=cok-satan',
      cta: 'Çok Satanlara Göz At',
      lead: 'Orijinal ürün, özenli paketleme ve takip edilebilir kargo.',
      art: 'pod',
      label: '',
      bottles: [
        { color: LIME, width: 86 },
        { color: MINT, width: 108 },
        { color: HAZARD, width: 108 },
        { color: GREEN, width: 86 },
      ],
    },
  ];

  const count = slides.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback((i: number) => setActive(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(() => go(active + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [active, paused, go]);

  const ticker = flavors.length > 0 ? flavors : ['Meyveli Aromalar', 'Tütün Aromaları', 'Fresh Seriler', 'Tatlı Aromalar'];
  const tickerItems = [...ticker, 'Nuclear Likit · Orijinal Ürün'];
  const tickerColors = [LIME, HAZARD, MINT, GREEN, PALE];

  return (
    <>
      <section
        className="nl-hero"
        aria-roledescription="carousel"
        aria-label="Öne çıkanlar"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 50) go(active + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        <div className="nl-hero__track" style={{ transform: `translateX(-${active * 100}%)` }}>
          {slides.map((s, i) => {
            const Title = i === 0 ? 'h1' : 'h2';
            const isActive = i === active;
            return (
              <div
                key={s.kicker}
                className={`nl-slide${isActive ? ' is-active' : ''}`}
                style={{ '--c': s.c, '--c2': s.c2 } as CSSProperties}
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${count}`}
                aria-hidden={!isActive}
                inert={!isActive}
              >
                <span className="nl-blob nl-blob--a" aria-hidden="true" />
                <span className="nl-blob nl-blob--b" aria-hidden="true" />
                <div className="container-page nl-slide__grid">
                  <div className="nl-slide__text">
                    <span className="nl-kicker">{s.kicker}</span>
                    <Title className="nl-slide__title">
                      {s.title[0]}
                      <br />
                      <span>{s.title[1]}</span>
                    </Title>
                    {s.price ? (
                      <p className="nl-slide__price">
                        <strong>{formatMinor(s.price.now)}</strong>
                        {s.price.was ? (
                          <del>
                            <span className="sr-only">İndirimsiz fiyat: </span>
                            {formatMinor(s.price.was)}
                          </del>
                        ) : null}
                      </p>
                    ) : null}
                    {s.lead ? <p className="nl-slide__lead">{s.lead}</p> : null}
                    <Link className="nl-btn" href={s.href}>
                      {s.cta}
                    </Link>
                  </div>
                  <div className="nl-slide__art" aria-hidden="true">
                    {s.bottles.map((b, j) => (
                      <span key={j} className="nl-float" style={{ animationDelay: `-${(j * 0.9).toFixed(1)}s` }}>
                        {s.art === 'pod' ? (
                          <>
                            <span className="nl-puff" style={{ '--c': b.color, animationDelay: `-${(j * 0.8).toFixed(1)}s` } as CSSProperties} />
                            <PodSvg color={b.color} width={b.width} />
                          </>
                        ) : (
                          <BottleSvg color={b.color} width={b.width} label={s.label} />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button className="nl-hero__arrow nl-hero__arrow--prev" type="button" aria-label="Önceki slayt" onClick={() => go(active - 1)}>
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <button className="nl-hero__arrow nl-hero__arrow--next" type="button" aria-label="Sonraki slayt" onClick={() => go(active + 1)}>
          <ChevronRight size={24} aria-hidden="true" />
        </button>
        <div className="nl-hero__dots">
          {slides.map((s, i) => (
            <button
              key={s.kicker}
              type="button"
              aria-label={`${i + 1}. slayta git`}
              aria-current={i === active}
              className={i === active ? 'is-on' : undefined}
              style={{ '--c': s.c } as CSSProperties}
              onClick={() => go(i)}
            >
              <span />
            </button>
          ))}
        </div>
      </section>

      <div className="nl-ticker" role="region" aria-label="Öne çıkan aromalar">
        <div className="nl-marquee">
          {[0, 1].map((k) => (
            <div key={k} className="nl-marquee__seq" aria-hidden={k === 1}>
              {[...tickerItems, ...tickerItems].map((t, i) => (
                <span key={i} className="nl-ticker__group">
                  <span className="nl-ticker__item" style={{ '--c': tickerColors[i % tickerColors.length] } as CSSProperties}>
                    {t}
                  </span>
                  <span className="nl-ticker__sep">☢</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function BottleSvg({ color, width, label }: { color: string; width: number; label: string }) {
  return (
    <svg className="nl-bottle" width={width} viewBox="0 0 60 140" aria-hidden="true" focusable="false">
      <rect x="20" y="0" width="20" height="22" rx="4" fill="#161A1F" stroke={color} strokeWidth="2" />
      <rect x="24" y="20" width="12" height="12" fill="#1E232A" />
      <rect x="6" y="30" width="48" height="106" rx="12" fill={color} fillOpacity=".18" stroke={color} strokeWidth="2" />
      <rect x="9" y="56" width="42" height="77" rx="10" fill={color} />
      <circle className="nl-bubble" cx="18" cy="126" r="2.5" fill="#fff" opacity=".8" />
      <circle className="nl-bubble nl-bubble--late" cx="42" cy="120" r="2" fill="#fff" opacity=".8" />
      <rect x="11" y="78" width="38" height="30" rx="5" fill="#07080A" fillOpacity=".85" />
      <text x="30" y="97" textAnchor="middle" fontFamily="var(--font-display), sans-serif" fontWeight="700" fontSize={label.length > 4 ? 6.5 : 9} fill={color}>
        {label}
      </text>
      <rect x="12" y="36" width="5" height="92" rx="2.5" fill="#fff" opacity=".3" />
    </svg>
  );
}

function PodSvg({ color, width }: { color: string; width: number }) {
  return (
    <svg className="nl-bottle" width={width} viewBox="0 0 80 200" aria-hidden="true" focusable="false">
      <rect x="26" y="0" width="28" height="30" rx="10" fill="#161A1F" />
      <rect x="14" y="24" width="52" height="48" rx="12" fill={color} fillOpacity=".25" stroke={color} strokeWidth="2" />
      <rect x="18" y="44" width="44" height="24" rx="8" fill={color} fillOpacity=".8" />
      <rect x="10" y="68" width="60" height="130" rx="22" fill={color} />
      <rect x="18" y="80" width="6" height="104" rx="3" fill="#fff" opacity=".3" />
      <rect x="32" y="108" width="16" height="28" rx="8" fill="#07080A" fillOpacity=".45" />
      <circle className="nl-led" cx="40" cy="172" r="5" fill="#fff" />
    </svg>
  );
}
