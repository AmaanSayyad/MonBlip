'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Check, CheckCircle2, ChevronDown, Clock3, Coins, Copy, ExternalLink, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { useStore } from '@/lib/store';
import { FundTour } from '@/components/tour/FundTour';
import { StepFlow, type FlowStep } from '@/components/ui/StepFlow';
import { NoteList, PageHero, Panel, Reveal } from '@/components/ui/PagePanel';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { AnimatedNumber, celebrate } from '@/components/ui/Fx';
import { TokenAvatar } from '@/components/fund/TokenAvatar';
import { TokenPicker, formatPrice } from '@/components/fund/TokenPicker';
import {
  FALLBACK_TOKENS,
  QUICK_PICKS,
  chainInfo,
  displaySymbol,
  isValidRefund,
  sortTokens,
  suggestedAmounts,
  tokenLogo,
  type AuroraToken,
} from '@/lib/aurora/catalog';
import { connectPayingWallet, payDeposit, walletChainSupported, walletFor, type WalletPayment } from '@/lib/aurora/walletPay';

const SEEN_KEY = 'monblip.fund.guide';

type Source = AuroraToken;
type PayStep = 'idle' | 'connecting' | 'quoting' | 'approving';

function roundUp(raw: bigint, decimals: number) {
  const keep = decimals >= 18 ? 6 : 2;
  if (decimals <= keep) return formatUnits(raw, decimals);
  const step = 10n ** BigInt(decimals - keep);
  return formatUnits(((raw + step - 1n) / step) * step, decimals);
}

/** Aurora reports minimums in base units and route gaps in its own words. */
function readAuroraError(message: string, source: Source): { text: string; minimum?: string } {
  const label = displaySymbol(source);
  const floor = message.match(/try at least (\d+)/i);
  if (floor) {
    const minimum = roundUp(BigInt(floor[1]), source.decimals);
    return { text: `Aurora needs at least ${minimum} ${label} on this route.`, minimum };
  }
  if (/no liquidity/i.test(message)) {
    return { text: `Aurora has no solver for this ${label} amount right now. Try a different amount or again in a minute.` };
  }
  if (/refund/i.test(message)) {
    return { text: `Aurora needs a ${chainInfo(source.blockchain).name} address it can refund, such as ${chainInfo(source.blockchain).placeholder}.` };
  }
  return { text: message };
}

type QuoteView = {
  depositAddress: string;
  depositMemo?: string;
  amountIn?: string;
  /** Exact amount Aurora expects, in the origin token's smallest unit. */
  amountInRaw?: string;
  amountOut?: string;
  symbol?: string;
  status?: string;
  destinationTx?: string;
  originAsset?: string;
  refundTo?: string;
  deadline?: string;
};

function readQuote(payload: Record<string, unknown>): QuoteView | null {
  const quote = (payload.quote || payload) as Record<string, unknown>;
  const depositAddress = String(quote.depositAddress || '');
  if (!depositAddress) return null;
  const request = payload.quoteRequest as { originAsset?: string; refundTo?: string } | undefined;
  const originAsset = String(payload.originAsset || request?.originAsset || '');
  return {
    originAsset: originAsset || undefined,
    refundTo: request?.refundTo || undefined,
    deadline: quote.deadline ? String(quote.deadline) : undefined,
    depositAddress,
    depositMemo: quote.depositMemo ? String(quote.depositMemo) : undefined,
    amountIn: quote.amountInFormatted ? String(quote.amountInFormatted) : undefined,
    amountInRaw: quote.amountIn ? String(quote.amountIn) : undefined,
    amountOut: quote.amountOutFormatted ? String(quote.amountOutFormatted) : undefined,
    symbol: payload.destinationSymbol ? String(payload.destinationSymbol) : undefined,
    destinationTx: payload.destinationTx ? String(payload.destinationTx) : undefined,
  };
}

const FADE = {
  initial: { opacity: 0, y: 6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
  transition: { duration: 0.25 },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_DEPOSIT: 'Waiting for your deposit',
  KNOWN_DEPOSIT_TX: 'Deposit seen',
  PROCESSING: 'Swapping',
  SUCCESS: 'Delivered',
  INCOMPLETE_DEPOSIT: 'Deposit below the quote',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
};

const SENT_AT_KEY = 'monblip.fund.sentAt.';

function readSentAt(depositAddress: string) {
  const value = Number(localStorage.getItem(SENT_AT_KEY + depositAddress));
  return value > 0 ? value : null;
}

function markSent(depositAddress: string, at: number) {
  const known = readSentAt(depositAddress);
  if (known) return known;
  localStorage.setItem(SENT_AT_KEY + depositAddress, String(at));
  return at;
}

/** Typical end-to-end time from the origin transfer to MON on Monad. */
function swapWindow(blockchain: string) {
  if (blockchain === 'btc') return { label: '20 to 60 minutes', maxMs: 60 * 60_000, why: 'Bitcoin needs block confirmations first.' };
  if (blockchain === 'eth') return { label: '2 to 10 minutes', maxMs: 10 * 60_000, why: 'Ethereum needs a few block confirmations first.' };
  return { label: '1 to 10 minutes', maxMs: 10 * 60_000, why: 'Aurora confirms the deposit, swaps it, then sends MON to Monad.' };
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}:${seconds}`;
}

function statusTone(status?: string) {
  if (status === 'SUCCESS') return 'text-[#82FF68]';
  if (status === 'REFUNDED' || status === 'FAILED') return 'text-[#FF5C7A]';
  return 'text-[#B781FE]';
}

export default function FundPage() {
  const address = useStore((state) => state.address);
  const isConnected = useStore((state) => state.isConnected);
  const isTourOpen = useStore((state) => state.isTourOpen);
  const setIsTourOpen = useStore((state) => state.setIsTourOpen);
  const setConnectModalOpen = useStore((state) => state.setConnectModalOpen);
  const [tokens, setTokens] = useState<AuroraToken[]>(FALLBACK_TOKENS);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [monPrice, setMonPrice] = useState<number | null>(null);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceAsset, setSourceAsset] = useState<string>(FALLBACK_TOKENS[0].assetId);
  const [amount, setAmount] = useState<string>(suggestedAmounts(FALLBACK_TOKENS[0]).start);
  const [refundInput, setRefundInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<{ text: string; minimum?: string } | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [payStep, setPayStep] = useState<PayStep>('idle');
  const [payment, setPayment] = useState<WalletPayment | null>(null);
  const [payWallet, setPayWallet] = useState<{ name: string } | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const findToken = useCallback(
    (assetId?: string) => (assetId ? tokens.find((item) => item.assetId === assetId) ?? FALLBACK_TOKENS.find((item) => item.assetId === assetId) : undefined),
    [tokens],
  );
  const source = findToken(sourceAsset) ?? FALLBACK_TOKENS[0];
  const sourceLabel = displaySymbol(source);
  const sourceChain = chainInfo(source.blockchain);
  const amounts = suggestedAmounts(source);
  const refundTo = refundInput ?? (sourceChain.evm && address ? address : '');
  const refundValid = isValidRefund(source.blockchain, refundTo);
  const quickPicks = useMemo(
    () => QUICK_PICKS
      .map((pick) => tokens.find((item) => item.blockchain === pick.blockchain && item.symbol === pick.symbol))
      .filter((item): item is AuroraToken => Boolean(item)),
    [tokens],
  );
  const quoteOrigin = findToken(quote?.originAsset) ?? source;
  const quoteIsEarlier = Boolean(quote && quoteOrigin.assetId !== source.assetId);
  const canPayFromWallet = walletChainSupported(source);

  useEffect(() => {
    setPayWallet(walletFor(source));
  }, [source]);
  const ready = Boolean(isConnected && address);

  useEffect(() => {
    let live = true;
    void fetch('/api/monad/aurora/tokens')
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!live) return;
        if (!response.ok || !Array.isArray(body.tokens)) {
          setTokensError(body.error || 'Aurora’s token list is unavailable right now.');
          return;
        }
        setTokens(sortTokens(body.tokens as AuroraToken[]));
        if (typeof body.monPrice === 'number') setMonPrice(body.monPrice);
      })
      .catch(() => { if (live) setTokensError('Aurora’s token list is unavailable right now.'); })
      .finally(() => { if (live) setTokensLoading(false); });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SEEN_KEY) === '1') return;
    setIsTourOpen(true);
  }, [setIsTourOpen]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    void fetch(`/api/monad/aurora?latest=1&recipient=${address}`)
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!live || !body?.quote) return;
        const next = readQuote(body.quote as Record<string, unknown>);
        const status = body.status?.status ? String(body.status.status) : undefined;
        const finished = status === 'SUCCESS' || status === 'REFUNDED' || status === 'FAILED';
        if (next && !finished) setQuote((current) => current || { ...next, status: status || 'PENDING_DEPOSIT' });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [address]);

  const closeTour = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setIsTourOpen(false);
  };

  const pickSource = (next: AuroraToken) => {
    setPickerOpen(false);
    if (next.assetId === sourceAsset) return;
    const sameFamily = next.blockchain === source.blockchain || (chainInfo(next.blockchain).evm && sourceChain.evm);
    if (!sameFamily) setRefundInput(null);
    setSourceAsset(next.assetId);
    setAmount(suggestedAmounts(next).start);
    setError(null);
  };
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const amountUnits = (() => {
    try {
      return Number(amount) > 0 ? parseUnits(amount, source.decimals) : null;
    } catch {
      return null;
    }
  })();
  const belowFloor = amountUnits != null && amounts.floor != null && amountUnits < parseUnits(amounts.floor, source.decimals);
  const usdValue = source.price && Number(amount) > 0 ? Number(amount) * source.price : null;

  useEffect(() => {
    if (!quote?.depositAddress) return;
    const depositAddress = quote.depositAddress;
    setSentAt(readSentAt(depositAddress));
    const params = new URLSearchParams({ depositAddress });
    if (quote.depositMemo) params.set('depositMemo', quote.depositMemo);
    let live = true;
    const tick = () => {
      void fetch(`/api/monad/aurora?${params}`)
        .then((response) => response.ok ? response.json() : null)
        .then((body) => {
          if (!live || !body?.status) return;
          if (body.status !== 'PENDING_DEPOSIT') {
            setSentAt(markSent(depositAddress, Date.parse(body.updatedAt) || Date.now()));
          }
          const hashes = body.swapDetails?.destinationChainTxHashes;
          const destinationTx = Array.isArray(hashes) && hashes[0]?.hash ? String(hashes[0].hash) : undefined;
          setQuote((current) => current ? { ...current, status: String(body.status), destinationTx: destinationTx || current.destinationTx } : current);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 8000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [quote?.depositAddress, quote?.depositMemo]);

  const fetchQuote = async (refund: string): Promise<QuoteView> => {
    const response = await fetch('/api/monad/aurora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: address,
        originAsset: source.assetId,
        amount: amountUnits!.toString(),
        refundTo: refund.trim(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || 'Aurora did not return a deposit address');
    }
    const next = readQuote(payload);
    if (!next) throw new Error(payload.message || 'Aurora did not return a deposit address');
    const view = { ...next, originAsset: next.originAsset || source.assetId, status: 'PENDING_DEPOSIT' };
    setQuote(view);
    return view;
  };

  const requestQuote = async () => {
    if (!address || amountUnits == null) return;
    setBusy(true);
    setError(null);
    setQuote(null);
    setPayment(null);
    try {
      await fetchQuote(refundTo);
    } catch (cause) {
      setError(readAuroraError(cause instanceof Error ? cause.message : 'Aurora did not return a deposit address', source));
    } finally {
      setBusy(false);
    }
  };

  const depositWithWallet = async () => {
    if (!address || amountUnits == null) return;
    setError(null);
    setPayment(null);
    let stage: PayStep = 'connecting';
    setPayStep(stage);
    try {
      const sender = await connectPayingWallet(source);
      const refund = refundInput?.trim() || sender.address;
      if (!refundInput) setRefundInput(sender.address);
      const reusable = quote
        && !quoteIsEarlier
        && quote.status === 'PENDING_DEPOSIT'
        && quote.amountInRaw === amountUnits.toString();
      stage = 'quoting';
      setPayStep(stage);
      const target = reusable ? quote : await fetchQuote(refund);
      stage = 'approving';
      setPayStep(stage);
      const sent = await payDeposit(source, target.amountInRaw || amountUnits.toString(), target.depositAddress, target.depositMemo);
      setPayment(sent);
      setSentAt(markSent(target.depositAddress, Date.now()));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'The wallet did not send the deposit';
      setError(stage === 'quoting' ? readAuroraError(text, source) : { text });
    } finally {
      setPayStep('idle');
    }
  };

  const startNewDeposit = () => {
    setQuote(null);
    setPayment(null);
    setSentAt(null);
    setError(null);
  };

  const copyAddress = async () => {
    if (!quote?.depositAddress) return;
    await navigator.clipboard.writeText(quote.depositAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const status = quote?.status;
  const sent = Boolean(payment) || (status != null && status !== 'PENDING_DEPOSIT');
  const swapped = status === 'SUCCESS';
  const refunded = status === 'REFUNDED' || status === 'FAILED';
  const moneyOut = quote?.amountOut ? Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 4 }) : null;
  const receiveAmount = quote?.amountOut && !quoteIsEarlier
    ? Number(quote.amountOut)
    : usdValue != null && monPrice
      ? usdValue / monPrice
      : null;
  const waiting = sent && !swapped && !refunded;
  const expected = swapWindow(quoteOrigin.blockchain);
  const elapsed = waiting && sentAt ? now - sentAt : null;
  const overdue = elapsed != null && elapsed > expected.maxMs;
  const refundShort = quote?.refundTo ? `${quote.refundTo.slice(0, 6)}…${quote.refundTo.slice(-4)}` : 'your refund address';
  const deadlineText = quote?.deadline ? new Date(quote.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previous = lastStatus.current;
    lastStatus.current = status;
    if (status === 'SUCCESS' && previous && previous !== 'SUCCESS') void celebrate();
  }, [status]);

  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);
  const originReady = ready && amountUnits != null && !belowFloor;
  const flowReady = [originReady || sent, sent && !refunded, swapped, false];
  const firstOpen = flowReady.indexOf(false);
  const flow: FlowStep[] = [
    {
      key: 'origin',
      logo: (sent ? tokenLogo(quoteOrigin.symbol) ?? chainInfo(quoteOrigin.blockchain).logo : tokenLogo(source.symbol) ?? sourceChain.logo) ?? '/logos/sponsors/aurora.svg',
      name: sent
        ? `${displaySymbol(quoteOrigin)} on ${chainInfo(quoteOrigin.blockchain).name}`
        : `${sourceLabel} on ${sourceChain.name}`,
      detail: 'Any token Aurora lists',
      status: sent
        ? `${quote?.amountIn ?? ''} ${displaySymbol(quoteOrigin)} sent`.trim()
        : !ready
        ? 'Connect a wallet first'
        : amountUnits == null
          ? 'Enter an amount'
          : belowFloor
            ? `From ${amounts.floor} ${sourceLabel}`
            : `${amount} ${sourceLabel}${usdValue != null ? ` · $${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}`,
      target: 'fund-source',
    },
    {
      key: 'aurora',
      logo: '/logos/sponsors/aurora.svg',
      name: 'Aurora',
      detail: 'Swaps at the deposit address',
      status: refunded
        ? 'Refunded'
        : swapped
          ? 'Swapped'
          : status === 'PROCESSING'
            ? `Swapping${elapsed != null ? ` · ${clock(elapsed)}` : '…'}`
            : status === 'KNOWN_DEPOSIT_TX' || payment
              ? `Deposit seen${elapsed != null ? ` · ${clock(elapsed)}` : ''}`
              : quote
                ? 'Waiting for your deposit'
                : payStep !== 'idle'
                  ? 'Opening MetaMask…'
                  : 'Deposit to start',
      target: 'fund-quote',
    },
    {
      key: 'mon',
      logo: '/logos/chains/monad.svg',
      name: 'MON on Monad',
      detail: 'Arrives in the recipient wallet',
      status: swapped
        ? `${moneyOut ?? ''} MON arrived`.trim()
        : moneyOut
          ? `About ${moneyOut} MON`
          : 'Lands after the swap',
      target: 'fund-wallet',
    },
    {
      key: 'trade',
      logo: '/brand/monblip-mark.png',
      name: 'Play on Trade',
      detail: 'Deposit the MON to play',
      status: swapped ? 'Deposit it on Trade' : 'After MON arrives',
      target: 'fund-quote',
    },
  ].map((step, index) => ({
    ...step,
    state: flowReady[index] ? 'done' : index === firstOpen ? 'current' : 'waiting',
  }));

  return (
    <main className="monad-page mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHero
        tour="fund-intro"
        eyebrow="Aurora Intents · MetaMask"
        logos={[{ src: '/logos/sponsors/aurora.svg' }, { src: '/logos/sponsors/metamask.svg' }, { src: '/logos/chains/monad.svg' }]}
        title="Fund MON from another chain"
        onGuide={() => setIsTourOpen(true)}
      >
        Send a token from any chain Aurora lists. Aurora swaps it and MON lands in your Monad wallet, usually within minutes. If a swap fails, the token goes back to your refund address.
      </PageHero>

      <Reveal delay={0.05}>
        <StepFlow steps={flow} title="Path to MON" tour="fund-flow" />
      </Reveal>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
        <div className="grid gap-2">
          <Panel
            tour="fund-source"
            eyebrow="You send"
            title={`${sourceLabel} on ${sourceChain.name}`}
            delay={0.1}
            action={
              <span className="text-[11px] text-white/45">
                {tokensLoading ? 'Loading tokens…' : tokensError ? 'Showing the basics' : `${tokens.length} tokens`}
              </span>
            }
          >
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-[#7005FC]/60 bg-[#7005FC]/10 px-3.5 py-3 text-left transition hover:border-[#B781FE] hover:bg-[#7005FC]/15"
              aria-haspopup="dialog"
            >
              <motion.span
                key={source.assetId}
                initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="shrink-0"
              >
                <TokenAvatar token={source} size={40} />
              </motion.span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-white">{sourceLabel}</span>
                <span className="block truncate text-xs text-[#DDD7FE]/70">
                  on {sourceChain.name}{source.price ? ` · ${formatPrice(source.price)}` : ''}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#DDD7FE]">
                Change
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            </button>
            {quickPicks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {quickPicks.map((item) => {
                  const selected = item.assetId === source.assetId;
                  return (
                    <button
                      key={item.assetId}
                      type="button"
                      onClick={() => pickSource(item)}
                      title={`${displaySymbol(item)} on ${chainInfo(item.blockchain).name}`}
                      className={`relative inline-flex items-center rounded-full border py-1 pl-1 pr-2.5 text-xs transition ${selected ? 'border-transparent text-white' : 'border-white/10 bg-[#070010] text-[#DDD7FE] hover:border-white/25 hover:text-white'}`}
                    >
                      {selected ? (
                        <motion.span
                          layoutId="fund-quick-pick"
                          transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                          className="absolute inset-0 rounded-full border border-[#7005FC] bg-[#7005FC]/20"
                          aria-hidden
                        />
                      ) : null}
                      <span className="relative inline-flex items-center gap-1.5">
                        <TokenAvatar token={item} size={18} />
                        {displaySymbol(item)}
                        {item.symbol === 'USDC' || item.symbol === 'USDT' ? (
                          <span className="text-white/40">{chainInfo(item.blockchain).name}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block text-xs text-[#E4E4E4]">
                <span className="flex items-center justify-between">
                  <span>Amount</span>
                  {amounts.floor ? <span className="text-white/45">From {amounts.floor} {sourceLabel}</span> : null}
                </span>
                <span className={`mt-1.5 flex h-14 items-center rounded-xl border bg-[#070010] pr-3 transition focus-within:border-[#7005FC]/70 ${belowFloor ? 'border-[#FFB547]/50' : 'border-white/10'}`}>
                  <input
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value.replace(',', '.'));
                      setError(null);
                    }}
                    inputMode="decimal"
                    aria-label="Amount"
                    className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-xl text-white outline-none"
                  />
                  <span className="text-sm text-[#B781FE]">{sourceLabel}</span>
                </span>
                <span className="mt-1.5 flex items-center justify-between text-[11px]">
                  {belowFloor ? (
                    <span className="text-[#FFB547]">Aurora routes start near {amounts.floor} {sourceLabel}.</span>
                  ) : (
                    <span className="tabular-nums text-white/45">
                      {usdValue != null ? `≈ $${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '\u00a0'}
                    </span>
                  )}
                </span>
              </label>
              <label className="block text-xs text-[#E4E4E4]">
                <span>Refund address on {sourceChain.name}</span>
                <input
                  value={refundTo}
                  onChange={(event) => setRefundInput(event.target.value)}
                  placeholder={sourceChain.placeholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  className={`mt-1.5 h-14 w-full rounded-xl border bg-[#070010] px-3.5 font-mono text-sm text-white outline-none transition placeholder:font-sans placeholder:text-white/30 focus:border-[#7005FC]/70 ${refundTo.trim() && !refundValid ? 'border-[#FF5C7A]/60' : 'border-white/10'}`}
                />
                <span className="mt-1.5 block text-[11px] leading-5">
                  {refundTo.trim() && !refundValid ? (
                    <span className="text-[#FF8FA3]">That does not look like a {sourceChain.name} address.</span>
                  ) : !sourceChain.evm && !refundTo.trim() ? (
                    <span className="text-white/45">MetaMask fills this in, or paste your own {sourceChain.name} wallet.</span>
                  ) : (
                    <span className="text-white/45">A failed swap returns the {sourceLabel} here.</span>
                  )}
                </span>
              </label>
            </div>
          </Panel>

          <div className="relative z-10 h-0" aria-hidden>
            <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border border-white/10 bg-[#070010] text-[#B781FE] shadow-[0_8px_24px_-8px_rgba(112,5,252,0.6)]">
              <ArrowDown className="h-4 w-4" />
            </span>
          </div>

          <Panel tour="fund-wallet" eyebrow="You receive" title="MON on Monad" logo="/logos/chains/monad.svg" delay={0.15}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[#E4E4E4]">{quote?.amountOut && !quoteIsEarlier ? 'Quoted by Aurora' : 'Estimate'}</p>
                <p className="mt-1.5 flex items-center gap-2 font-mono text-2xl text-white">
                  <TokenLogo token="MON" size={24} />
                  {receiveAmount != null ? <AnimatedNumber value={receiveAmount} decimals={2} /> : '—'}
                  <span className="text-sm text-[#DDD7FE]/60">MON</span>
                </p>
                <p className="mt-1 text-[11px] text-white/45">
                  {quote?.amountOut && !quoteIsEarlier ? 'Final amount can move slightly with the swap.' : 'From live prices. Aurora quotes the exact amount.'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#E4E4E4]">Recipient</p>
                {ready && address ? (
                  <a
                    href={`https://monadvision.com/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 flex items-center gap-1.5 font-mono text-sm text-white transition hover:text-[#B781FE]"
                  >
                    <span className="truncate">{address.slice(0, 10)}…{address.slice(-8)}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <button type="button" onClick={() => setConnectModalOpen(true)} className="mt-1.5 text-sm text-[#B781FE] hover:text-white">
                    Connect a wallet
                  </button>
                )}
                <p className="mt-1 text-[11px] leading-5 text-white/45">Your connected Monad wallet. Deposit the MON on Trade to play.</p>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="grid gap-6 lg:sticky lg:top-24">
          <Panel
            tour="fund-quote"
            eyebrow="Deposit"
            logo="/logos/sponsors/aurora.svg"
            delay={0.2}
            title={
              <span className="flex items-center gap-1.5">
                Send
                <TokenAvatar token={quote ? quoteOrigin : source} size={16} />
                {displaySymbol(quote ? quoteOrigin : source)} on {chainInfo((quote ? quoteOrigin : source).blockchain).name}
              </span>
            }
          >
            {quote ? (
              <div className="grid gap-4">
                {quoteIsEarlier ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-[#DDD7FE]">
                {waiting
                  ? `Tracking your ${displaySymbol(quoteOrigin)} deposit. A new ${sourceLabel} deposit opens once it lands.`
                  : sent
                  ? `This was your ${displaySymbol(quoteOrigin)} deposit. Start a new one below to pay with ${sourceLabel}.`
                      : `This is your earlier ${displaySymbol(quoteOrigin)} request, still open. Get a new address below to pay with ${sourceLabel} instead.`}
                  </p>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${swapped ? 'bg-[#82FF68]' : refunded ? 'bg-[#FF5C7A]' : 'animate-pulse bg-[#B781FE]'}`} />
                    <span className={statusTone(quote.status)}>{STATUS_LABEL[quote.status || 'PENDING_DEPOSIT'] || quote.status}</span>
                  </span>
                  {quote.amountOut ? (
                    <span className="font-mono text-sm text-white">
                      ≈ {Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 4 })} {quote.symbol || 'MON'}
                    </span>
                  ) : null}
                </div>

                <AnimatePresence initial={false} mode="popLayout">
                  {waiting ? (
                    <motion.div
                      key="wait"
                      {...FADE}
                      data-tour="fund-wait"
                      className={`rounded-xl border p-3.5 ${overdue ? 'border-[#FFB547]/30 bg-[#FFB547]/[0.06]' : 'border-[#B781FE]/25 bg-[#B781FE]/[0.06]'}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm text-white">{overdue ? 'Taking longer than usual' : `Usually ${expected.label}`}</p>
                        {elapsed != null ? <p className="font-mono text-sm tabular-nums text-[#DDD7FE]">{clock(elapsed)}</p> : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-[width] duration-1000 ${overdue ? 'animate-pulse bg-[#FFB547]' : 'bg-gradient-to-r from-[#7005FC] to-[#B781FE]'}`}
                          style={{ width: `${elapsed != null ? Math.min(100, Math.max(4, (elapsed / expected.maxMs) * 100)) : 4}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/60">
                        {overdue
                          ? `Your ${displaySymbol(quoteOrigin)} stays safe with Aurora. It either delivers ${quote.symbol || 'MON'} here or refunds the ${displaySymbol(quoteOrigin)} to ${refundShort}${deadlineText ? ` by ${deadlineText}` : ''}.`
                          : `${expected.why} You can leave this page. The swap keeps going and this card picks it up when you return.`}
                      </p>
                    </motion.div>
                  ) : swapped ? (
                    <motion.div key="done" {...FADE} className="rounded-xl border border-[#82FF68]/25 bg-[#82FF68]/[0.06] p-3.5">
                      <p className="flex items-center gap-2 text-sm text-white">
                        <CheckCircle2 className="h-4 w-4 text-[#82FF68]" aria-hidden />
                        {quote.symbol || 'MON'} arrived in your Monad wallet.
                      </p>
                      {quote.destinationTx ? (
                        <a
                          href={`https://monadvision.com/tx/${quote.destinationTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs text-[#B781FE] hover:text-white"
                        >
                          {quote.destinationTx.slice(0, 10)}…{quote.destinationTx.slice(-8)}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                      <Link href="/trade" className="neon-btn monblip-shine mt-3 flex h-10 w-full items-center justify-center text-sm">
                        Deposit it on Trade
                      </Link>
                    </motion.div>
                  ) : refunded ? (
                    <motion.p key="refund" {...FADE} className="rounded-xl border border-[#FF5C7A]/25 bg-[#FF5C7A]/10 p-3.5 text-sm text-[#FF8FA3]">
                      Aurora did not deliver {quote.symbol || 'MON'}. The refund goes to {refundShort}.
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                {payment ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                    <p className="text-xs text-[#DDD7FE]">Sent from {payment.wallet}</p>
                    <a
                      href={payment.explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-[#B781FE] hover:text-white"
                    >
                      {payment.txHash.slice(0, 8)}…{payment.txHash.slice(-6)}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </div>
                ) : null}

                {!sent ? (
                <div className="rounded-xl border border-white/10 bg-[#070010] p-3.5">
                  <p className="text-[11px] text-white/50">
                    Send {quote.amountIn || amount} {displaySymbol(quoteOrigin)} on {chainInfo(quoteOrigin.blockchain).name} to
                  </p>
                  <div className="mt-1.5 flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-all font-mono text-[13px] leading-5 text-white">{quote.depositAddress}</p>
                    <button
                      type="button"
                      onClick={copyAddress}
                      aria-label="Copy deposit address"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:text-white"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-[#82FF68]" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {quote.depositMemo ? <p className="mt-2 text-xs text-[#E4E4E4]">Memo {quote.depositMemo}</p> : null}
                </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[#DDD7FE]/85">
                {canPayFromWallet
                  ? `Deposit opens MetaMask with the ${sourceLabel} transfer filled in. Prefer an exchange or another wallet? Get the address and send it yourself.`
                  : `Aurora gives you one deposit address for this amount. Send ${sourceLabel} there from any ${sourceChain.name} wallet or exchange.`}
              </p>
            )}

            {ready && waiting ? (
              <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-center text-xs leading-5 text-white/50">
                One deposit at a time. The deposit buttons come back once this one lands.
              </p>
            ) : ready && (swapped || refunded) ? (
              <button
                type="button"
                onClick={startNewDeposit}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-sm text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Start a new deposit
              </button>
            ) : ready ? (
              <div className="mt-5 grid gap-2">
                {canPayFromWallet ? (
                  <button
                    type="button"
                    onClick={() => void depositWithWallet()}
                    disabled={payStep !== 'idle' || busy || !payWallet || amountUnits == null || Boolean(refundInput?.trim() && !refundValid)}
                    className="neon-btn monblip-shine flex h-12 w-full items-center justify-center gap-2 text-sm disabled:opacity-60"
                  >
                    {payStep !== 'idle' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-white/15">
                        <img src="/logos/sponsors/metamask.svg" alt="" className="h-4 w-4" />
                      </span>
                    )}
                    {payStep === 'connecting'
                      ? 'Connecting MetaMask…'
                      : payStep === 'quoting'
                        ? 'Getting the deposit address…'
                        : payStep === 'approving'
                          ? 'Approve in MetaMask…'
                          : `Deposit ${amount || ''} ${sourceLabel} with MetaMask`}
                  </button>
                ) : null}
                {canPayFromWallet && !payWallet ? (
                  <p className="text-xs leading-5 text-white/55">
                    {source.blockchain === 'sol' ? 'Turn on Solana in MetaMask' : 'Install MetaMask'} to deposit in one click, or get the address below.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={requestQuote}
                  disabled={busy || payStep !== 'idle' || !refundValid || amountUnits == null}
                  className={canPayFromWallet
                    ? 'h-11 w-full rounded-xl border border-white/15 text-sm text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:text-white disabled:opacity-50'
                    : 'neon-btn monblip-shine h-12 w-full text-sm disabled:opacity-60'}
                >
                  {busy ? 'Asking Aurora…' : canPayFromWallet ? 'Send it myself · get the address' : quoteIsEarlier ? `Get a ${sourceLabel} address` : 'Get deposit address'}
                </button>
                {!waiting ? (
                  <p className="mt-1 text-center text-[11px] text-white/45">
                    MON usually lands {swapWindow(source.blockchain).label} after you send.
                  </p>
                ) : null}
              </div>
            ) : (
              <button type="button" onClick={() => setConnectModalOpen(true)} className="neon-btn monblip-shine mt-5 h-12 w-full text-sm">
                Connect a wallet
              </button>
            )}

            <AnimatePresence initial={false}>
              {error ? (
                <motion.div key="error" {...FADE} className="mt-3 rounded-xl border border-[#FF5C7A]/25 bg-[#FF5C7A]/10 p-3">
                  <p className="text-sm leading-relaxed text-[#FF8FA3]">{error.text}</p>
                  {error.minimum ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAmount(error.minimum!);
                        setError(null);
                      }}
                      className="mt-2 text-sm font-medium text-white underline decoration-[#B781FE] underline-offset-4"
                    >
                      Use {error.minimum} {sourceLabel}
                    </button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Panel>

          <Reveal delay={0.25} className="rounded-2xl border border-white/10 bg-[#15111B]/60 p-5 sm:p-6">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Good to know</p>
            <NoteList
              items={[
                { icon: <Clock3 className="h-3.5 w-3.5" />, text: 'Most chains land in 1 to 10 minutes. Bitcoin waits for block confirmations, so it takes longer.' },
                { icon: <ShieldCheck className="h-3.5 w-3.5" />, text: 'If Aurora cannot finish the swap, it refunds the token to your refund address.' },
                { icon: <Coins className="h-3.5 w-3.5" />, text: 'MON arrives in your wallet. Deposit it on Trade to play rounds.' },
              ]}
            />
          </Reveal>
        </aside>
      </div>

      {pickerOpen ? (
        <TokenPicker
          tokens={tokens}
          loading={tokensLoading}
          error={tokensError}
          selected={source.assetId}
          onPick={pickSource}
          onClose={closePicker}
        />
      ) : null}
      <FundTour isOpen={isTourOpen} onClose={closeTour} />
    </main>
  );
}
