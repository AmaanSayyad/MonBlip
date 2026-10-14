'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowDownToLine, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import type { HouseAccountView, HouseClaim } from '@/lib/monad/perplHouse';
import { perplClaimMessage, perplForwardingMessage } from '@/lib/monad/perplClaim';
import { TokenLogo } from '@/components/ui/TokenLogo';

const EXPLORER = 'https://monadvision.com';
const REFRESH_MS = 20_000;

const TONE: Record<HouseAccountView['activity'][number]['tone'], string> = {
  ok: 'bg-[#82FF68]',
  warn: 'bg-[#FFC857]',
  muted: 'bg-[#B781FE]',
};

type ClaimStep = 'idle' | 'signing' | 'sending' | 'done';

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function when(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[11px] text-[#DDD7FE]/70">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-white">
        <TokenLogo token="AUSD" size={16} />
        {value.toFixed(2)} <span className="text-[11px] text-[#DDD7FE]/60">AUSD</span>
      </p>
    </div>
  );
}

function TxLink({ hash, label }: { hash?: string; label: string }) {
  if (!hash) return null;
  return (
    <a
      href={`${EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[11px] text-[#B781FE] transition hover:text-white"
    >
      {label} {short(hash)} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

export function HouseAccountCard({
  passkeyAddress,
  signingIn,
  onSignIn,
  onClaimed,
}: {
  passkeyAddress: string | null;
  signingIn: boolean;
  onSignIn: () => void;
  onClaimed: () => void;
}) {
  const [view, setView] = useState<HouseAccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [step, setStep] = useState<ClaimStep>('idle');
  const [claim, setClaim] = useState<HouseClaim | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [forwardingSet, setForwardingSet] = useState<boolean | null>(null);
  const [forwardingBusy, setForwardingBusy] = useState(false);
  const [forwardingError, setForwardingError] = useState<string | null>(null);
  const [forwardingTx, setForwardingTx] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/monad/perpl', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Perpl account could not be read');
      setView(body as HouseAccountView);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perpl account could not be read');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!passkeyAddress) {
      setAllowed(null);
      return;
    }
    let live = true;
    fetch(`/api/monad/perpl/claim?address=${passkeyAddress}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (live) setAllowed(Boolean(body?.allowed)); })
      .catch(() => { if (live) setAllowed(false); });
    return () => { live = false; };
  }, [passkeyAddress]);

  const account = view?.account;
  const forwarding = forwardingSet ?? account?.forwarding ?? false;

  useEffect(() => {
    if (forwardingSet != null && account?.forwarding === forwardingSet) setForwardingSet(null);
  }, [account?.forwarding, forwardingSet]);

  const switchForwarding = async () => {
    if (!passkeyAddress) return;
    const allow = !forwarding;
    setForwardingBusy(true);
    setForwardingError(null);
    setForwardingTx(null);
    try {
      const { signMeraMessage } = await import('@/lib/monad/account');
      const issuedAt = Date.now();
      const signature = await signMeraMessage(perplForwardingMessage(passkeyAddress, allow, issuedAt));
      const response = await fetch('/api/monad/perpl/forwarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: passkeyAddress, allow, issuedAt, signature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Forwarding could not be changed');
      setForwardingSet(allow);
      setForwardingTx(body.tx);
      void load();
    } catch (cause) {
      setForwardingError(cause instanceof Error ? cause.message : 'Forwarding could not be changed');
    } finally {
      setForwardingBusy(false);
    }
  };

  const onPerpl = account ? Math.max(0, account.balance - account.locked) : 0;
  const idle = view?.walletAusd ?? 0;
  const claimable = onPerpl + idle;
  const busy = step === 'signing' || step === 'sending';

  const runClaim = async () => {
    if (!passkeyAddress) return;
    setClaimError(null);
    setClaim(null);
    setStep('signing');
    try {
      const { signMeraMessage } = await import('@/lib/monad/account');
      const issuedAt = Date.now();
      const signature = await signMeraMessage(perplClaimMessage(passkeyAddress, issuedAt));
      setStep('sending');
      const response = await fetch('/api/monad/perpl/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: passkeyAddress, issuedAt, signature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'The claim could not be sent');
      setClaim(body as HouseClaim);
      setStep('done');
      onClaimed();
      void load();
    } catch (cause) {
      setClaimError(cause instanceof Error ? cause.message : 'The claim could not be sent');
      setStep('idle');
    }
  };

  let action: ReactNode;
  if (!passkeyAddress) {
    action = (
      <button type="button" onClick={onSignIn} disabled={signingIn} className="neon-btn h-11 w-full text-sm disabled:opacity-60">
        {signingIn ? 'Waiting for the passkey…' : 'Sign in with passkey to claim'}
      </button>
    );
  } else if (allowed === false) {
    action = (
      <p className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-5 text-[#DDD7FE]">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FFC857]" aria-hidden />
        This passkey can view the account. Claims go to the passkeys the operator lists in PERPL_CLAIM_ADDRESSES.
      </p>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={() => void runClaim()}
        disabled={busy || allowed !== true || claimable < 0.01}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7005FC] text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(112,5,252,0.8)] transition hover:bg-[#8F3BFF] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowDownToLine className="h-4 w-4" aria-hidden />}
        {step === 'signing'
          ? 'Signing with your passkey…'
          : step === 'sending'
            ? 'Withdrawing from Perpl and sending…'
            : claimable < 0.01
              ? 'Nothing to claim'
              : `Claim ${claimable.toFixed(2)} AUSD`}
      </button>
    );
  }

  return (
    <section data-tour="perpl-house" className="overflow-hidden rounded-2xl border border-white/10 bg-[#15111B] xl:col-span-3">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
            <img src="/logos/sponsors/perpl.svg" alt="" className="h-6 w-6 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">House account on Perpl</p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-white">
              {account ? `Account #${account.id}` : 'House hedge'}
              {view?.address ? (
                <a
                  href={`${EXPLORER}/address/${view.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-[#B781FE] transition hover:text-white"
                >
                  {short(view.address)} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {account ? (
            <>
              <span className={`rounded-full border px-2.5 py-1 ${account.frozen ? 'border-[#FF5C7A]/40 text-[#FF5C7A]' : 'border-[#82FF68]/40 text-[#82FF68]'}`}>
                {account.frozen ? 'Frozen' : 'Active'}
              </span>
              <span className={`rounded-full border px-2.5 py-1 ${forwarding ? 'border-[#82FF68]/40 text-[#82FF68]' : 'border-[#FFC857]/40 text-[#FFC857]'}`}>
                {forwarding ? 'API orders on' : 'API orders off'}
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh the house account"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:text-white disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </header>

      {error ? <p className="px-5 py-4 text-sm text-[#FF5C7A]">{error}</p> : null}
      {!view && !error ? (
        <div className="grid gap-3 p-5 lg:grid-cols-2" aria-busy>
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      ) : null}
      {view && !account ? <p className="px-5 py-4 text-sm text-[#DDD7FE]">{view.detail}</p> : null}

      {account ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4 p-5 lg:border-r lg:border-white/10">
            <div data-tour="perpl-claim" className="rounded-2xl border border-[#7005FC]/40 bg-gradient-to-br from-[#7005FC]/20 via-[#7005FC]/[0.06] to-transparent p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#DDD7FE]">Claimable</p>
              <p className="mt-1.5 flex items-center gap-2.5 font-mono text-3xl text-white">
                <TokenLogo token="AUSD" size={30} />
                {claimable.toFixed(2)} <span className="text-base text-[#DDD7FE]/70">AUSD</span>
              </p>
              <p className="mt-1 text-xs text-[#DDD7FE]/80">
                {onPerpl.toFixed(2)} free on Perpl · {idle.toFixed(2)} in the hedge wallet
              </p>
              {passkeyAddress ? (
                <p className="mt-3 text-xs text-[#DDD7FE]">
                  Sends to your passkey <span className="font-mono text-white">{short(passkeyAddress)}</span>
                </p>
              ) : null}
              <div className="mt-3">{action}</div>
              {account.locked > 0 ? (
                <p className="mt-2 text-[11px] leading-5 text-[#DDD7FE]/70">
                  {account.locked.toFixed(2)} AUSD backs an open position and stays on Perpl until it closes.
                </p>
              ) : null}
              {claimError ? <p className="mt-2 text-xs leading-5 text-[#FF5C7A]">{claimError}</p> : null}
              {claim ? (
                <div className="mt-3 rounded-xl border border-[#82FF68]/30 bg-[#82FF68]/[0.06] p-3">
                  <p className="flex items-center gap-2 text-sm text-white">
                    <CheckCircle2 className="h-4 w-4 text-[#82FF68]" aria-hidden />
                    <TokenLogo token="AUSD" size={16} />
                    {claim.sent.toFixed(2)} AUSD is in your passkey.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    <TxLink hash={claim.withdrawTx} label="Perpl withdraw" />
                    <TxLink hash={claim.transferTx} label="Transfer" />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Stat label="Balance" value={account.balance} />
              <Stat label="In use as margin" value={account.locked} />
              <Stat label="Deposited" value={account.deposited} />
              <Stat label="Withdrawn" value={account.withdrawn} />
            </div>

            <div data-tour="perpl-forwarding" className={`rounded-xl border px-3 py-3 ${forwarding ? 'border-[#82FF68]/25 bg-[#82FF68]/[0.04]' : 'border-[#FFC857]/25 bg-[#FFC857]/[0.05]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white">API orders</p>
                  <p className={`mt-0.5 text-xs leading-5 ${forwarding ? 'text-[#DDD7FE]/80' : 'text-[#FFC857]/90'}`}>
                    {forwarding
                      ? 'Perpl accepts the house hedge sent through its API.'
                      : 'Perpl rejects API orders. The balance waits as idle collateral and can be claimed.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={forwarding}
                  aria-label="API order forwarding"
                  onClick={() => void switchForwarding()}
                  disabled={!passkeyAddress || allowed !== true || forwardingBusy}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#B781FE]/70 disabled:cursor-not-allowed disabled:opacity-50 ${forwarding ? 'bg-[#82FF68]/80' : 'bg-white/15'}`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform ${forwarding ? 'translate-x-5' : 'translate-x-0'}`}
                  >
                    {forwardingBusy ? <Loader2 className="h-3 w-3 animate-spin text-[#7005FC]" aria-hidden /> : null}
                  </span>
                </button>
              </div>
              {forwardingBusy ? <p className="mt-2 text-[11px] text-[#DDD7FE]/80">Confirming on Monad…</p> : null}
              {!passkeyAddress ? (
                <p className="mt-2 text-[11px] text-[#DDD7FE]/60">Sign in with an operator passkey to change this.</p>
              ) : allowed === false ? (
                <p className="mt-2 text-[11px] text-[#DDD7FE]/60">Only passkeys on the operator list can change this.</p>
              ) : null}
              {forwardingError ? <p className="mt-2 text-xs leading-5 text-[#FF5C7A]">{forwardingError}</p> : null}
              {forwardingTx ? <div className="mt-2"><TxLink hash={forwardingTx} label="Updated" /></div> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Open positions</p>
                {view.positions.length === 0 ? (
                  <p className="mt-2 text-sm text-[#DDD7FE]/70">None open.</p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {view.positions.map((position) => {
                      const pnl = position.mark != null ? (position.mark - position.entry) * position.size * (position.side === 'Long' ? 1 : -1) : null;
                      return (
                        <li key={position.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                          <p className="text-white">{position.side} {position.size} {position.market} · {position.leverage}×</p>
                          <p className="mt-0.5 font-mono text-xs text-[#DDD7FE]/80">
                            Entry ${position.entry} · {position.collateral.toFixed(2)} AUSD
                            {pnl != null ? ` · PnL ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(4)}` : ''}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Open orders</p>
                {view.openOrders.length === 0 ? (
                  <p className="mt-2 text-sm text-[#DDD7FE]/70">None waiting.</p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {view.openOrders.map((order) => (
                      <li key={order.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white">
                        {order.title}
                        <span className="ml-2 text-xs text-[#B781FE]">{order.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col border-t border-white/10 p-5 lg:border-t-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">History</p>
              <p className="text-[11px] text-[#DDD7FE]/50">Updated {when(view.fetchedAt)}</p>
            </div>
            {view.activity.length === 0 ? (
              <p className="mt-3 text-sm text-[#DDD7FE]/70">Nothing has happened on this account yet.</p>
            ) : (
              <ol className="relative mt-4 grid max-h-[460px] gap-3 overflow-y-auto pr-1">
                {view.activity.map((item, index) => (
                  <li key={`${item.kind}-${item.at}-${index}`} className="relative pl-6">
                    {index < view.activity.length - 1 ? (
                      <span className="absolute bottom-[-12px] left-[4px] top-4 w-px bg-white/10" aria-hidden />
                    ) : null}
                    <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${TONE[item.tone]}`} aria-hidden />
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="flex items-center gap-2 text-sm text-white">
                          {item.kind === 'account' ? <TokenLogo token="AUSD" size={16} /> : null}
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[#DDD7FE]/60">{when(item.at)}</p>
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-[#DDD7FE]/85">{item.detail}</p>
                      {item.tx ? <div className="mt-1"><TxLink hash={item.tx} label="Tx" /></div> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
