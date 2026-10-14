'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import {
  connectPerplKey,
  readMyPerplView,
  setPerplForwarding,
  withdrawPerplCollateral,
  type MyPerplView,
} from '@/lib/monad/perplClient';
import type { PerplActivity } from '@/lib/monad/perplView';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { AnimatedNumber, GlowLayer, trackGlow } from '@/components/ui/Fx';

const EXPLORER = 'https://monadvision.com';
const REFRESH_MS = 20_000;

const TONE: Record<PerplActivity['tone'], string> = {
  ok: 'bg-[#82FF68]',
  warn: 'bg-[#FFC857]',
  muted: 'bg-[#B781FE]',
};

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function when(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
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

function TxLink({ hash, label }: { hash?: string | null; label: string }) {
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

export function MyPerplAccountCard({
  passkeyAddress,
  signingIn,
  onSignIn,
  refreshKey,
  onChanged,
}: {
  passkeyAddress: string | null;
  signingIn: boolean;
  onSignIn: () => void;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [view, setView] = useState<MyPerplView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'key' | 'forwarding' | 'withdraw' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ label: string; hash: string; note?: string } | null>(null);

  const load = useCallback(async () => {
    if (!passkeyAddress) return;
    setLoading(true);
    try {
      setView(await readMyPerplView(passkeyAddress as `0x${string}`));
      setError(null);
    } catch (cause) {
      setError(message(cause, 'Your Perpl account could not be read'));
    } finally {
      setLoading(false);
    }
  }, [passkeyAddress]);

  useEffect(() => {
    setView(null);
    setLastTx(null);
    setActionError(null);
    if (!passkeyAddress) return;
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [passkeyAddress, load]);

  useEffect(() => {
    if (refreshKey > 0) void load();
  }, [refreshKey, load]);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>, fallback: string) => {
    setBusy(kind);
    setActionError(null);
    try {
      await task();
      await load();
      onChanged();
    } catch (cause) {
      setActionError(message(cause, fallback));
    } finally {
      setBusy(null);
    }
  };

  const account = view?.account;
  const free = account ? Math.max(0, account.balance - account.locked) : 0;
  const forwarding = account?.forwarding ?? false;

  const loadKey = () => run('key', async () => {
    await connectPerplKey();
  }, 'Perpl did not approve the key');

  const switchForwarding = () => run('forwarding', async () => {
    const hash = await setPerplForwarding(!forwarding);
    setLastTx({ label: 'Forwarding', hash });
  }, 'Forwarding could not be changed');

  const withdraw = () => run('withdraw', async () => {
    const { hash, amount } = await withdrawPerplCollateral();
    setLastTx({ label: 'Withdraw', hash, note: `${amount.toFixed(2)} AUSD is back in your passkey.` });
  }, 'The withdrawal did not go through');

  return (
    <section data-tour="perpl-account" onMouseMove={trackGlow} className="group/glow relative overflow-hidden rounded-2xl border border-white/10 bg-[#15111B] shadow-[0_24px_48px_-32px_rgba(0,0,0,0.9)] transition-colors hover:border-white/[0.14]">
      <GlowLayer />
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
            <img src="/logos/sponsors/perpl.svg" alt="" className="h-6 w-6 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Your Perpl account</p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-white">
              {account ? `Account #${account.id}` : 'Owned by your passkey'}
              {passkeyAddress ? (
                <a
                  href={`${EXPLORER}/address/${passkeyAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-[#B781FE] transition hover:text-white"
                >
                  {short(passkeyAddress)} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {account && view?.keyed ? (
            <>
              <span className={`rounded-full border px-2.5 py-1 ${account.frozen ? 'border-[#FF5C7A]/40 text-[#FF5C7A]' : 'border-[#82FF68]/40 text-[#82FF68]'}`}>
                {account.frozen ? 'Frozen' : 'Active'}
              </span>
              <span className={`rounded-full border px-2.5 py-1 ${forwarding ? 'border-[#82FF68]/40 text-[#82FF68]' : 'border-[#FFC857]/40 text-[#FFC857]'}`}>
                {forwarding ? 'API orders on' : 'API orders off'}
              </span>
            </>
          ) : null}
          {passkeyAddress ? (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh your Perpl account"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:text-white disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      {!passkeyAddress ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
          <p className="text-sm text-[#DDD7FE]">Sign in with your passkey to see its Perpl account, positions and history.</p>
          <button type="button" onClick={onSignIn} disabled={signingIn} className="neon-btn h-11 px-6 text-sm disabled:opacity-60">
            {signingIn ? 'Waiting for the passkey…' : 'Sign in with passkey'}
          </button>
        </div>
      ) : null}

      {passkeyAddress && error ? <p className="px-5 py-4 text-sm text-[#FF5C7A]">{error}</p> : null}
      {passkeyAddress && !view && !error ? (
        <div className="grid gap-3 p-5 lg:grid-cols-2" aria-busy>
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      ) : null}
      {passkeyAddress && view && !account ? (
        <p className="px-5 py-5 text-sm leading-6 text-[#DDD7FE]">
          This passkey has no Perpl account yet. The first order above opens one with 10 AUSD from the passkey.
        </p>
      ) : null}

      {account ? (
        <div className="relative grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="grid content-start gap-4 p-5 sm:p-6 lg:border-r lg:border-white/[0.06]">
            <div data-tour="perpl-withdraw" className="rounded-2xl border border-[#7005FC]/40 bg-gradient-to-br from-[#7005FC]/20 via-[#7005FC]/[0.06] to-transparent p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#DDD7FE]">On Perpl</p>
              <p className="mt-1.5 flex items-center gap-2.5 font-mono text-3xl text-white">
                <TokenLogo token="AUSD" size={30} />
                <AnimatedNumber value={account.balance} decimals={2} /> <span className="text-base text-[#DDD7FE]/70">AUSD</span>
              </p>
              <p className="mt-1 text-xs text-[#DDD7FE]/80">
                {free.toFixed(2)} free · {account.locked.toFixed(2)} backing positions
              </p>
              <button
                type="button"
                onClick={() => void withdraw()}
                disabled={busy !== null || free < 0.01}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7005FC] text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(112,5,252,0.8)] transition hover:bg-[#8F3BFF] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {busy === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowDownToLine className="h-4 w-4" aria-hidden />}
                {busy === 'withdraw'
                  ? 'Withdrawing to your passkey…'
                  : free < 0.01
                    ? 'Nothing free to withdraw'
                    : `Withdraw ${free.toFixed(2)} AUSD to passkey`}
              </button>
              {lastTx ? (
                <div className="mt-3 rounded-xl border border-[#82FF68]/30 bg-[#82FF68]/[0.06] p-3">
                  {lastTx.note ? (
                    <p className="flex items-center gap-2 text-sm text-white">
                      <CheckCircle2 className="h-4 w-4 text-[#82FF68]" aria-hidden />
                      {lastTx.note}
                    </p>
                  ) : null}
                  <div className={lastTx.note ? 'mt-1.5' : ''}><TxLink hash={lastTx.hash} label={lastTx.label} /></div>
                </div>
              ) : null}
            </div>

            {view?.keyed ? (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Balance" value={account.balance} />
                <Stat label="In use as margin" value={account.locked} />
                <Stat label="Deposited" value={account.deposited} />
                <Stat label="Withdrawn" value={account.withdrawn} />
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-sm text-white">History needs a Perpl key in this browser</p>
                <p className="mt-1 text-xs leading-5 text-[#DDD7FE]/80">
                  The balance above comes straight from the exchange contract. Approve a Perpl key with your passkey to load orders, fills and positions.
                </p>
                <button
                  type="button"
                  onClick={() => void loadKey()}
                  disabled={busy !== null}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-white transition hover:border-[#B781FE]/60 disabled:opacity-60"
                >
                  {busy === 'key' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                  {busy === 'key' ? 'Approving with your passkey…' : 'Load history'}
                </button>
              </div>
            )}

            {view?.keyed ? (
              <div data-tour="perpl-forwarding" className={`rounded-xl border px-3 py-3 ${forwarding ? 'border-[#82FF68]/25 bg-[#82FF68]/[0.04]' : 'border-[#FFC857]/25 bg-[#FFC857]/[0.05]'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white">API orders</p>
                    <p className={`mt-0.5 text-xs leading-5 ${forwarding ? 'text-[#DDD7FE]/80' : 'text-[#FFC857]/90'}`}>
                      {forwarding
                        ? 'Perpl routes MonBlip orders to this account.'
                        : 'Perpl rejects orders sent through its API. The next order turns this on, or switch it here.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={forwarding}
                    aria-label="API order forwarding"
                    onClick={() => void switchForwarding()}
                    disabled={busy !== null}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#B781FE]/70 disabled:cursor-not-allowed disabled:opacity-50 ${forwarding ? 'bg-[#82FF68]/80' : 'bg-white/15'}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform ${forwarding ? 'translate-x-5' : 'translate-x-0'}`}>
                      {busy === 'forwarding' ? <Loader2 className="h-3 w-3 animate-spin text-[#7005FC]" aria-hidden /> : null}
                    </span>
                  </button>
                </div>
                {busy === 'forwarding' ? <p className="mt-2 text-[11px] text-[#DDD7FE]/80">Confirming on Monad…</p> : null}
              </div>
            ) : null}

            {actionError ? <p className="text-xs leading-5 text-[#FF5C7A]">{actionError}</p> : null}

            {view?.keyed ? (
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
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col border-t border-white/[0.06] p-5 sm:p-6 lg:border-t-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">History</p>
              {view ? <p className="text-[11px] text-[#DDD7FE]/50">Updated {when(view.fetchedAt)}</p> : null}
            </div>
            {!view?.keyed ? (
              <p className="mt-3 text-sm text-[#DDD7FE]/70">Load history to see deposits, orders and fills for this account.</p>
            ) : view.activity.length === 0 ? (
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
