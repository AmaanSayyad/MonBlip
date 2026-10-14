'use client';

import { useEffect, useState } from 'react';
import { connectMera, meraAddress } from '@/lib/monad/account';
import { placePerplTrade, readAusdBalance, type PerplTradeResult } from '@/lib/monad/perplClient';
import { useStore } from '@/lib/store';
import { PerplTour } from '@/components/tour/PerplTour';

const SEEN_KEY = 'monblip.perpl.guide';

const PATH = [
  { src: '/logos/sponsors/mera.svg', name: 'Mera', detail: 'Passkey signs in' },
  { src: '/logos/sponsors/agora.svg', name: 'AUSD', detail: '10 AUSD opens the account' },
  { src: '/logos/chains/monad.svg', name: 'MON', detail: 'A little MON pays gas' },
  { src: '/logos/sponsors/perpl.svg', name: 'Perpl', detail: 'Holds the 1 MON long' },
];

function Logo({ src, light = false }: { src: string; light?: boolean }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${light ? 'bg-[#FCFBFF]' : 'bg-white/5'}`}>
      <img src={src} alt="" className="h-6 w-6 object-contain" />
    </span>
  );
}

export default function PerplPage() {
  const address = useStore((state) => state.address);
  const isConnected = useStore((state) => state.isConnected);
  const isTourOpen = useStore((state) => state.isTourOpen);
  const setIsTourOpen = useStore((state) => state.setIsTourOpen);
  const setSelectedCurrency = useStore((state) => state.setSelectedCurrency);
  const [walletAusd, setWalletAusd] = useState<string | null>(null);
  const [houseAusd, setHouseAusd] = useState<string | null>(null);
  const [busy, setBusy] = useState<'login' | 'trade' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PerplTradeResult | null>(null);
  const passkey = isConnected && meraAddress()?.toLowerCase() === address?.toLowerCase();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SEEN_KEY) === '1') return;
    setIsTourOpen(true);
  }, [setIsTourOpen]);

  const closeTour = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setIsTourOpen(false);
  };

  useEffect(() => {
    if (!address) {
      setWalletAusd(null);
      return;
    }
    let live = true;
    void readAusdBalance(address as `0x${string}`)
      .then((value) => { if (live) setWalletAusd(value); })
      .catch(() => { if (live) setWalletAusd(null); });
    void fetch(`/api/balance/${address}?currency=AUSD`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (live) setHouseAusd(data ? Number(data.balance || 0).toFixed(2) : null); })
      .catch(() => { if (live) setHouseAusd(null); });
    return () => { live = false; };
  }, [address]);

  const login = async () => {
    setBusy('login');
    setError(null);
    try {
      await connectMera();
      setSelectedCurrency('AUSD');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey sign-in failed');
    } finally {
      setBusy(null);
    }
  };

  const trade = async () => {
    setBusy('trade');
    setError(null);
    setResult(null);
    try {
      setResult(await placePerplTrade());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perpl did not accept the order');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="monad-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <div data-tour="perpl-intro">
          <h1 className="text-3xl font-medium text-white">A MON long on Perpl</h1>
          <p className="mt-3 text-sm leading-6 text-[#E4E4E4]">
            Sign in with a Mera passkey, open a Perpl account with AUSD on Monad, and send a 1 MON market long. Perpl holds the margin. This is separate from the short-chart desk.
          </p>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PATH.map((step, index) => (
            <li key={step.name} className="rounded-2xl border border-white/10 bg-[#15111B] p-4">
              <div className="flex items-center gap-3">
                <Logo src={step.src} light={step.name === 'AUSD'} />
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">{index + 1}</p>
              </div>
              <p className="mt-3 text-sm text-white">{step.name}</p>
              <p className="mt-1 text-xs leading-5 text-[#E4E4E4]">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section data-tour="perpl-passkey" className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
          <div className="flex items-center gap-3">
            <Logo src="/logos/sponsors/mera.svg" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Account</p>
              <p className="text-sm text-white">Mera passkey</p>
            </div>
          </div>
          <p className="mt-4 break-all font-mono text-sm text-white">{passkey ? address : 'Not signed in'}</p>
          <p className="mt-2 text-xs leading-5 text-[#E4E4E4]">The passkey approves the trade key. The desk wallet does not sign this order.</p>
          {!passkey ? (
            <button type="button" onClick={login} disabled={busy !== null} className="neon-btn mt-4 h-11 w-full text-sm disabled:opacity-60">
              {busy === 'login' ? 'Waiting for the passkey' : 'Sign in with passkey'}
            </button>
          ) : (
            <p className="mt-4 text-sm text-[#82FF68]">Passkey is signed in.</p>
          )}
        </section>

        <section data-tour="perpl-balances" className="grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
            <div className="flex items-center gap-3">
              <Logo src="/logos/sponsors/agora.svg" light />
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Wallet AUSD</p>
            </div>
            <p className="mt-3 font-mono text-2xl text-white">{walletAusd ?? '—'}</p>
            <p className="mt-1 text-xs leading-5 text-[#E4E4E4]">In the passkey on Monad. Perpl takes 10 AUSD from here.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
            <div className="flex items-center gap-3">
              <Logo src="/logos/chains/monad.svg" />
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">House AUSD</p>
            </div>
            <p className="mt-3 font-mono text-2xl text-white">{houseAusd ?? '—'}</p>
            <p className="mt-1 text-xs leading-5 text-[#E4E4E4]">Short-chart balance. Perpl does not spend it.</p>
          </div>
        </section>

      <section data-tour="perpl-order" className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Logo src="/logos/chains/monad.svg" />
          <Logo src="/logos/sponsors/perpl.svg" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Order</p>
            <p className="text-sm text-white">Long 1 MON · market · 1×</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#E4E4E4]">
          The first order opens the Perpl account with 10 AUSD from the passkey and a little MON for gas on Monad. Later orders reuse that account. Perpl accepts the long or declines it.
        </p>
        <button type="button" onClick={trade} disabled={!passkey || busy !== null} className="neon-btn mt-4 h-11 w-full text-sm disabled:opacity-60 sm:w-auto sm:px-6">
          {busy === 'trade' ? 'Sending to Perpl' : 'Place Perpl trade'}
        </button>
        {error ? <p className="mt-3 text-sm leading-relaxed text-[#FF5C7A]">{error}</p> : null}
        {result ? (
          <div className="mt-3 text-sm leading-relaxed text-[#E4E4E4]">
            <p className="text-white">{result.detail}</p>
            <p className="mt-1 font-mono text-xs text-[#B781FE]">
              {result.market} {result.side} {result.size}
              {result.accountId != null ? ` · account ${result.accountId}` : ''}
              {result.requestId != null ? ` · request ${result.requestId}` : ''}
            </p>
          </div>
        ) : null}
      </section>
      </div>
      <PerplTour isOpen={isTourOpen} onClose={closeTour} />
    </main>
  );
}
