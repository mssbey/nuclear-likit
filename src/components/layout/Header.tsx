'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useCart, cartCount } from '@/store/cart';
import { useEscape, useLockBody, useMounted } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SearchOverlay } from './SearchOverlay';

export interface NavLink {
  label: string;
  href: string;
  emphasis?: boolean;
}

export function Header({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const mounted = useMounted();
  const count = useCart((s) => cartCount(s.lines));
  const openCart = useCart((s) => s.openDrawer);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Sayfa değişince mobil menü kapanır.
  useEffect(() => setMenuOpen(false), [pathname]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useLockBody(menuOpen);
  useEscape(menuOpen, closeMenu);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href.split('?')[0]));

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-40 border-b transition-colors duration-300',
          scrolled ? 'border-line bg-bg/85 backdrop-blur-xl' : 'border-transparent bg-bg',
        )}
      >
        <div className="container-page flex h-16 items-center gap-3">
          <button
            type="button"
            className="btn-ghost -ml-2 w-11 px-0 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Menüyü aç"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <Menu size={22} aria-hidden="true" />
          </button>

          <Link href="/" className="shrink-0" aria-label="Nuclear Likit ana sayfa">
            <Logo />
          </Link>

          <nav aria-label="Ana menü" className="ml-6 hidden flex-1 lg:block">
            <ul className="flex items-center gap-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={isActive(l.href) ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      isActive(l.href) ? 'text-fg' : 'text-muted hover:text-fg',
                      l.emphasis && 'text-hazard hover:text-hazard',
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="btn-ghost w-11 px-0" onClick={() => setSearchOpen(true)} aria-label="Ürün ara">
              <Search size={20} aria-hidden="true" />
            </button>
            <Link href="/hesabim" className="btn-ghost hidden w-11 px-0 sm:inline-flex" aria-label="Hesabım">
              <User size={20} aria-hidden="true" />
            </Link>
            <button type="button" onClick={openCart} className="btn-ghost relative w-11 px-0" aria-label={`Sepet, ${mounted ? count : 0} ürün`}>
              <ShoppingBag size={20} aria-hidden="true" />
              {mounted && count > 0 && (
                <span className="tabular absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobil menü çekmecesi */}
      <div
        className={cn('fixed inset-0 z-50 lg:hidden', menuOpen ? 'visible' : 'invisible')}
        aria-hidden={!menuOpen}
      >
        <div
          className={cn('absolute inset-0 bg-black/60 transition-opacity duration-300', menuOpen ? 'opacity-100' : 'opacity-0')}
          onClick={closeMenu}
        />
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
          className={cn(
            'absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col border-r border-line bg-surface transition-transform duration-300 ease-out',
            menuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <Logo />
            <button type="button" className="btn-ghost w-11 px-0" onClick={closeMenu} aria-label="Menüyü kapat">
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Mobil menü" className="flex-1 overflow-y-auto p-3">
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={cn(
                      'flex min-h-12 items-center rounded-xl px-3 text-base font-medium',
                      isActive(l.href) ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                      l.emphasis && 'text-hazard',
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="grid gap-2 border-t border-line p-4">
            <Link href="/hesabim" className="btn-secondary">
              <User size={18} aria-hidden="true" /> Hesabım
            </Link>
            <Link href="/siparis-takibi" className="btn-ghost">
              Sipariş takibi
            </Link>
          </div>
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
