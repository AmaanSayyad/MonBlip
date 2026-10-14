'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { WalletConnect } from './wallet';
import { useStore } from '@/lib/store';

const links = [
  { href: '/trade', label: 'Trade' },
  { href: '/litepaper', label: 'Litepaper' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/profile', label: 'Profile' },
  { href: '/referrals', label: 'Rewards' },
  { href: '/perpl', label: 'Perpl' },
  { href: '/fund', label: 'Fund' },
];

export function Header() {
  const [demoActivated, setDemoActivated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname === '/';
  const onTrade = pathname === '/trade' || pathname?.startsWith('/trade/');

  const {
    setAddress,
    setBalance,
    setIsConnected,
    toggleAccountType,
    accountType,
    accessCode,
    setIsTourOpen,
  } = useStore();

  const activateDemoMode = () => {
    if (accountType === 'demo') {
      toggleAccountType();
      setAddress(null);
      setIsConnected(false);
      return;
    }
    setAddress('0xDEMO_1234567890');
    setBalance(5000);
    setIsConnected(true);
    if (accountType === 'real') toggleAccountType();
    setDemoActivated(true);
    setTimeout(() => setDemoActivated(false), 2000);
  };

  const startGuide = () => {
    setIsTourOpen(true);
    if (pathname !== '/trade' && pathname !== '/perpl' && pathname !== '/fund') router.push('/trade');
  };

  const closeMenu = () => setMenuOpen(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const open = () => setMenuOpen(true);
    const close = () => setMenuOpen(false);
    window.addEventListener('monblip-tour-menu', open);
    window.addEventListener('monblip-tour-menu-close', close);
    return () => {
      window.removeEventListener('monblip-tour-menu', open);
      window.removeEventListener('monblip-tour-menu-close', close);
    };
  }, []);

  const nav = links;

  return (
    <header className={`site-header sticky top-0 w-full max-w-full shrink-0 border-b border-white/10 bg-[#070010] pt-[env(safe-area-inset-top)] backdrop-blur ${menuOpen ? 'z-[130]' : 'z-[100]'}`}>
      <div className="flex h-14 w-full min-w-0 max-w-full items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" onClick={closeMenu}>
          <img src="/brand/monblip-mark.png" alt="" className="h-7 w-7 rounded-[7px]" />
          <span className="theme-ink hidden text-[15px] font-medium text-white sm:inline">MonBlip</span>
        </Link>

        <nav className="hidden min-w-0 items-center gap-0.5 lg:flex sm:gap-1">
          {nav.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            const className = `rounded-full px-2.5 py-2 text-sm font-medium transition sm:px-3.5 ${
              active
                ? 'bg-[#7005FC] text-white'
                : 'theme-muted text-[#E4E4E4] hover:bg-white/10 hover:text-white'
            }`;
            return (
              <Link
                key={link.href}
                href={link.href}
                data-tour={link.href === '/leaderboard' ? 'board-link' : undefined}
                className={className}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        </div>

        <div className="flex min-w-0 shrink items-center justify-end gap-1.5 sm:gap-2">
          {demoActivated && (
            <span className="text-[11px] font-medium text-[#7005FC]">Demo on</span>
          )}
          <button
            type="button"
            onClick={startGuide}
            className="theme-muted hidden h-10 items-center rounded-full px-3 text-sm text-[#E4E4E4] transition hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            Guide
          </button>
          {!onHome && accessCode !== null && (
            <button
              type="button"
              onClick={activateDemoMode}
              className="theme-muted hidden h-10 items-center rounded-full px-3 text-sm text-[#E4E4E4] transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              {accountType === 'demo' ? 'Exit demo' : 'Demo'}
            </button>
          )}
          <WalletConnect />
          {pathname !== '/trade' && (
            <Link href="/trade" className="neon-btn inline-flex h-9 shrink-0 px-3 text-sm sm:h-10 sm:px-4">
              Launch
            </Link>
          )}
          <button
            type="button"
            data-tour="nav-menu"
            className="theme-burger inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="flex w-3.5 flex-col gap-1" aria-hidden>
              <span className={`block h-0.5 w-full origin-center rounded-full bg-white transition ${menuOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
              <span className={`block h-0.5 w-full rounded-full bg-white transition ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-full origin-center rounded-full bg-white transition ${menuOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="site-menu absolute inset-x-0 top-full z-[120] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain border-t border-white/10 bg-[#070010] px-3 py-2 shadow-lg lg:hidden">
          {nav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-tour={link.href === '/leaderboard' ? 'board-link' : undefined}
              className="theme-muted block rounded-xl px-3 py-3 text-[15px] text-[#E4E4E4] hover:bg-white/10 hover:text-white"
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            className="theme-muted block w-full rounded-xl px-3 py-3 text-left text-[15px] text-[#E4E4E4] hover:bg-white/10 hover:text-white"
            onClick={() => { closeMenu(); startGuide(); }}
          >
            Guide
          </button>
        </nav>
      )}
    </header>
  );
}
