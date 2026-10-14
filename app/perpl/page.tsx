'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, TrendingUp } from 'lucide-react';
import { connectMera, meraAddress } from '@/lib/monad/account';
import { placePerplTrade, readAusdBalance, readPerplAccount, type PerplAccountView, type PerplTradeResult } from '@/lib/monad/perplClient';
import { hasInjectedWallet, topUpFromMetaMask } from '@/lib/monad/injectedWallet';
import { useStore } from '@/lib/store';
import { PerplTour } from '@/components/tour/PerplTour';
import { MyPerplAccountCard } from '@/components/perpl/MyPerplAccountCard';
import { PriceChart } from '@/components/perpl/PriceChart';
import { StepFlow, type FlowStep } from '@/components/ui/StepFlow';
import { PageHero, Panel, Reveal } from '@/components/ui/PagePanel';
import { AnimatedNumber, celebrate } from '@/components/ui/Fx';
import { TokenLogo } from '@/components/ui/TokenLogo';

const SEEN_KEY = 'monblip.perpl.guide.v2';
const MIN_GAS_MON = 0.01;

const FADE = {
  initial: { opacity: 0, y: 6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
  transition: { duration: 0.25 },
};

export default function PerplPage() {
  const address = useStore((state) => state.address);
  const isConnected = useStore((state) => state.isConnected);
  const isTourOpen = useStore((state) => state.isTourOpen);
  const setIsTourOpen = useStore((state) => state.setIsTourOpen);
  const setSelectedCurrency = useStore((state) => state.setSelectedCurrency);
  const [walletAusd, setWalletAusd] = useState<string | null>(null);
  const [walletMon, setWalletMon] = useState<number | null>(null);
  const [perplAccount, setPerplAccount] = useState<PerplAccountView | null>(null);
  const [busy, setBusy] = useState<'login' | 'trade' | 'topup' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PerplTradeResult | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [canUseMetaMask, setCanUseMetaMask] = useState(false);
  const passkey = isConnected && meraAddress()?.toLowerCase() === address?.toLowerCase();
  const shortAusd = walletAusd != null && Number(walletAusd) < 10;

  useEffect(() => {
    setCanUseMetaMask(hasInjectedWallet());
  }, []);

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
      setPerplAccount(null);
      return;
    }
    let live = true;
    void readPerplAccount(address as `0x${string}`)
      .then((value) => { if (live) setPerplAccount(value); })
      .catch(() => { if (live) setPerplAccount(null); });
    void readAusdBalance(address as `0x${string}`)
      .then((value) => { if (live) setWalletAusd(value); })
      .catch(() => { if (live) setWalletAusd(null); });
    void import('@/lib/chains/evmTreasury')
      .then(({ readEvmWalletBalance }) => readEvmWalletBalance('MONAD', address, 'MON'))
      .then((value) => { if (live) setWalletMon(value); })
      .catch(() => { if (live) setWalletMon(null); });
    return () => { live = false; };
  }, [address, refresh]);

  const topUp = async () => {
    if (!address) return;
    setBusy('topup');
    setError(null);
    try {
      const need = Math.max(0.01, 10 - Number(walletAusd || 0));
      await topUpFromMetaMask('AUSD', Number(need.toFixed(2)), address as `0x${string}`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MetaMask transfer failed');
    } finally {
      setBusy(null);
    }
  };

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
      const next = await placePerplTrade();
      setResult(next);
      if (next.filled) void celebrate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perpl did not accept the order');
    } finally {
      setBusy(null);
      setRefresh((value) => value + 1);
    }
  };

  const ausd = walletAusd != null ? Number(walletAusd) : null;
  const accountId = perplAccount?.accountId ?? result?.accountId ?? null;
  const longOpen = Boolean(perplAccount?.hasPosition || result?.filled);
  const ready = [
    passkey,
    passkey && (accountId != null || (ausd ?? 0) >= 10),
    passkey && (walletMon ?? 0) >= MIN_GAS_MON,
    longOpen,
  ];
  const firstOpen = ready.indexOf(false);
  const flow: FlowStep[] = [
    {
      key: 'mera',
      logo: '/logos/sponsors/mera.svg',
      name: 'Mera passkey',
      detail: 'Signs you in on Monad',
      status: passkey ? 'Signed in' : busy === 'login' ? 'Waiting for the passkey' : 'Sign in to start',
      target: 'perpl-passkey',
    },
    {
      key: 'ausd',
      logo: '/logos/sponsors/agora.svg',
      light: true,
      name: 'AUSD',
      detail: '10 AUSD opens the account',
      status: !passkey
        ? 'After sign-in'
        : accountId != null
          ? `Account #${accountId} open`
          : ausd == null ? 'Reading balance…' : `${ausd.toFixed(2)} of 10 AUSD`,
      target: 'perpl-balances',
    },
    {
      key: 'mon',
      logo: '/logos/chains/monad.svg',
      name: 'MON gas',
      detail: 'A little MON pays gas',
      status: !passkey
        ? 'After sign-in'
        : walletMon == null ? 'Reading balance…' : `${walletMon.toFixed(3)} MON`,
      target: 'perpl-balances',
    },
    {
      key: 'perpl',
      logo: '/logos/sponsors/perpl.svg',
      name: 'Perpl long',
      detail: 'Holds the 1 MON long',
      status: busy === 'trade'
        ? 'Sending to Perpl…'
        : longOpen
          ? 'Long open'
          : result?.pending
            ? 'Waiting on Perpl'
            : result
              ? 'Not filled · try again'
              : 'Place the long',
      target: 'perpl-order',
    },
  ].map((step, index) => ({
    ...step,
    state: ready[index] ? 'done' : index === firstOpen ? 'current' : 'waiting',
  }));

  const newAccount = accountId == null;
  const lowGas = passkey && walletMon != null && walletMon < MIN_GAS_MON;

  return (
    <main className="monad-page mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHero
        tour="perpl-intro"
        eyebrow="Perpl · Mera · AUSD on Monad"
        logos={[{ src: '/logos/sponsors/perpl.svg' }, { src: '/logos/sponsors/mera.svg' }, { src: '/logos/sponsors/agora.svg', light: true }]}
        title="A MON long on Perpl"
        onGuide={() => setIsTourOpen(true)}
      >
        Sign in with a Mera passkey, open a Perpl account with AUSD on Monad, and send a 1 MON market long. Perpl holds the margin, separate from the short-chart desk.
      </PageHero>

      <Reveal delay={0.05}>
        <StepFlow steps={flow} title="Path to the long" tour="perpl-flow" />
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <Reveal delay={0.1} className="flex min-w-0">
          <PriceChart />
        </Reveal>

        <aside className="flex min-w-0">
          <Panel
            eyebrow="Order ticket"
            title="MON-PERP on Perpl"
            logo="/logos/sponsors/perpl.svg"
            delay={0.12}
            action={<span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-[#DDD7FE]">Market</span>}
            className="flex w-full flex-col"
            bodyClassName="flex flex-1 flex-col gap-5"
          >
            <div data-tour="perpl-passkey" className="rounded-xl border border-white/10 bg-[#070010] p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5">
                  <img src="/logos/sponsors/mera.svg" alt="" className="h-5 w-5 object-contain" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-white/50">Mera passkey</p>
                  {passkey && address ? (
                    <a
                      href={`https://monadvision.com/address/${address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-sm text-white transition hover:text-[#B781FE]"
                    >
                      <span className="truncate">{address.slice(0, 8)}…{address.slice(-6)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <p className="text-sm text-white">Not signed in</p>
                  )}
                </div>
                {passkey ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#82FF68]/30 bg-[#82FF68]/10 px-2.5 py-1 text-[11px] text-[#82FF68]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#82FF68]" aria-hidden />
                    Signed in
                  </span>
                ) : null}
              </div>
              {!passkey ? (
                <button type="button" onClick={login} disabled={busy !== null} className="neon-btn monblip-shine mt-3 flex h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-60">
                  {busy === 'login' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                  {busy === 'login' ? 'Waiting for the passkey…' : 'Sign in with passkey'}
                </button>
              ) : (
                <p className="mt-2.5 text-[11px] leading-5 text-white/45">The passkey approves the Perpl trade key. The desk wallet does not sign this order.</p>
              )}
            </div>

            <div data-tour="perpl-balances">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                  <p className="text-[11px] text-white/50">Wallet AUSD</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-lg text-white">
                    <TokenLogo token="AUSD" size={18} />
                    {ausd != null ? <AnimatedNumber value={ausd} decimals={2} /> : '—'}
                  </p>
                </div>
                <div className={`rounded-xl border px-3.5 py-3 ${lowGas ? 'border-[#FFB547]/40 bg-[#FFB547]/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
                  <p className="text-[11px] text-white/50">MON for gas</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-lg text-white">
                    <TokenLogo token="MON" size={18} />
                    {walletMon != null ? <AnimatedNumber value={walletMon} decimals={3} /> : '—'}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-white/45">
                {!passkey
                  ? 'Balances of the passkey on Monad show after sign-in.'
                  : newAccount
                    ? 'The first order takes 10 AUSD from the passkey to open the Perpl account.'
                    : `Perpl account #${accountId} holds your collateral. Wallet AUSD stays in the passkey.`}
                {lowGas ? ' Add a little MON for gas, for example from Fund.' : ''}
              </p>
              <AnimatePresence initial={false}>
                {passkey && shortAusd && newAccount ? (
                  <motion.div key="topup" {...FADE} className="mt-3 rounded-xl border border-[#7005FC]/35 bg-[#7005FC]/10 p-3.5">
                    <p className="text-xs leading-5 text-[#DDD7FE]">
                      A new Perpl account needs 10 AUSD in this passkey. Send it from MetaMask or any Monad wallet.
                    </p>
                    {canUseMetaMask ? (
                      <button
                        type="button"
                        onClick={() => void topUp()}
                        disabled={busy !== null}
                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#7005FC] text-sm font-medium text-white transition hover:bg-[#8F3BFF] disabled:opacity-60"
                      >
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-white/15">
                          <img src="/logos/sponsors/metamask.svg" alt="" className="h-4 w-4" />
                        </span>
                        {busy === 'topup' ? 'Confirm in MetaMask…' : `Send ${Math.max(0.01, 10 - Number(walletAusd || 0)).toFixed(2)} AUSD from MetaMask`}
                      </button>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div data-tour="perpl-order" className="mt-auto">
              <dl className="grid gap-2 rounded-xl border border-white/10 bg-[#070010] p-3.5 text-sm">
                {[
                  ['Side', <span key="side" className="inline-flex items-center gap-1 text-[#82FF68]"><TrendingUp className="h-3.5 w-3.5" aria-hidden />Long</span>],
                  ['Size', '1 MON'],
                  ['Type', 'Market'],
                  ['Leverage', '1×'],
                  ['Collateral', newAccount ? '10 AUSD opens the account' : `Account #${accountId}`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-3">
                    <dt className="text-white/50">{label}</dt>
                    <dd className="text-right text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={trade}
                disabled={!passkey || busy !== null}
                className="neon-btn monblip-shine mt-4 flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-60"
              >
                {busy === 'trade' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />}
                {busy === 'trade' ? 'Sending to Perpl…' : passkey ? 'Place 1 MON long' : 'Sign in to place the long'}
              </button>
              <p className="mt-2 text-center text-[11px] leading-5 text-white/45">
                {newAccount
                  ? 'Opens the account, turns on API orders, then sends the long. Each step uses a little MON for gas.'
                  : 'Perpl fills it at market. The result shows below.'}
              </p>

              <AnimatePresence initial={false} mode="popLayout">
                {error ? (
                  <motion.p key="error" {...FADE} className="mt-3 rounded-xl border border-[#FF5C7A]/25 bg-[#FF5C7A]/10 p-3 text-sm leading-relaxed text-[#FF8FA3]">
                    {error}
                  </motion.p>
                ) : result ? (
                  <motion.div
                    key="result"
                    {...FADE}
                    className={`mt-3 rounded-xl border p-3.5 text-sm ${result.filled ? 'border-[#82FF68]/30 bg-[#82FF68]/[0.06]' : result.pending ? 'border-white/10 bg-white/[0.03]' : 'border-[#FFB86B]/30 bg-[#FFB86B]/[0.06]'}`}
                  >
                    <p className={`flex items-start gap-2 ${result.filled ? 'text-white' : result.pending ? 'text-white' : 'text-[#FFB86B]'}`}>
                      {result.filled ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#82FF68]" aria-hidden /> : null}
                      {result.detail}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-[#B781FE]">
                      {result.market} {result.side} {result.size}
                      {result.accountId != null ? ` · account ${result.accountId}` : ''}
                      {result.requestId != null ? ` · request ${result.requestId}` : ''}
                      {result.status ? ` · ${result.status.toLowerCase()}` : ''}
                    </p>
                    {result.forwardingTx ? (
                      <a
                        href={`https://monadvision.com/tx/${result.forwardingTx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[#B781FE] hover:text-white"
                      >
                        API orders turned on · view transaction
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </Panel>
        </aside>
      </div>

      <Reveal delay={0.15} className="mt-6">
        <MyPerplAccountCard
          passkeyAddress={passkey && address ? address : null}
          signingIn={busy === 'login'}
          onSignIn={() => void login()}
          refreshKey={refresh}
          onChanged={() => setRefresh((value) => value + 1)}
        />
      </Reveal>
      <PerplTour isOpen={isTourOpen} onClose={closeTour} />
    </main>
  );
}
