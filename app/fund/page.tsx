'use client';

import { useEffect, useState } from 'react';
import { parseUnits } from 'viem';
import { useStore } from '@/lib/store';
import { FundTour } from '@/components/tour/FundTour';

const SEEN_KEY = 'monblip.fund.guide';

const SOURCES = [
  { id: 'eth', label: 'ETH', chain: 'Ethereum', asset: 'nep141:eth.omft.near', decimals: 18, logo: '/logos/ticker/eth.svg', refundHint: 'Ethereum address for a refund' },
  { id: 'usdt', label: 'USDT', chain: 'Ethereum', asset: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', decimals: 6, logo: '/logos/ticker/usdt.svg', refundHint: 'Ethereum address for a refund' },
  { id: 'near', label: 'NEAR', chain: 'NEAR', asset: 'nep141:wrap.near', decimals: 24, logo: '/logos/ticker/near.svg', refundHint: 'NEAR account for a refund' },
] as const;

const PATH = [
  { src: '/logos/ticker/eth.svg', name: 'Origin', detail: 'ETH, USDT, or NEAR' },
  { src: '/logos/sponsors/aurora.svg', name: 'Aurora', detail: 'Swaps at the deposit address' },
  { src: '/logos/chains/monad.svg', name: 'MON', detail: 'Arrives on Monad' },
  { src: '/brand/monblip-mark.png', name: 'Desk', detail: 'Deposit it on Trade' },
];

type QuoteView = {
  depositAddress: string;
  depositMemo?: string;
  amountIn?: string;
  amountOut?: string;
  symbol?: string;
  status?: string;
  destinationTx?: string;
};

function readQuote(payload: Record<string, unknown>): QuoteView | null {
  const quote = (payload.quote || payload) as Record<string, unknown>;
  const depositAddress = String(quote.depositAddress || '');
  if (!depositAddress) return null;
  return {
    depositAddress,
    depositMemo: quote.depositMemo ? String(quote.depositMemo) : undefined,
    amountIn: quote.amountInFormatted ? String(quote.amountInFormatted) : undefined,
    amountOut: quote.amountOutFormatted ? String(quote.amountOutFormatted) : undefined,
    symbol: payload.destinationSymbol ? String(payload.destinationSymbol) : undefined,
    destinationTx: payload.destinationTx ? String(payload.destinationTx) : undefined,
  };
}

function Logo({ src, light = false }: { src: string; light?: boolean }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${light ? 'bg-[#FCFBFF]' : 'bg-white/5'}`}>
      <img src={src} alt="" className="h-6 w-6 object-contain" />
    </span>
  );
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
  const [sourceId, setSourceId] = useState<(typeof SOURCES)[number]['id']>('eth');
  const [amount, setAmount] = useState('0.01');
  const [refundTo, setRefundTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const source = SOURCES.find((item) => item.id === sourceId) || SOURCES[0];
  const ready = Boolean(isConnected && address);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SEEN_KEY) === '1') return;
    setIsTourOpen(true);
  }, [setIsTourOpen]);

  useEffect(() => {
    let live = true;
    void fetch('/api/monad/aurora?latest=1')
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!live || !body?.quote) return;
        const next = readQuote(body.quote as Record<string, unknown>);
        const status = body.status?.status ? String(body.status.status) : undefined;
        if (next) setQuote((current) => current || { ...next, status: status || 'PENDING_DEPOSIT' });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const closeTour = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setIsTourOpen(false);
  };

  useEffect(() => {
    if (address && source.id !== 'near') setRefundTo(address);
  }, [address, source.id]);

  useEffect(() => {
    if (!quote?.depositAddress) return;
    const params = new URLSearchParams({ depositAddress: quote.depositAddress });
    if (quote.depositMemo) params.set('depositMemo', quote.depositMemo);
    let live = true;
    const tick = () => {
      void fetch(`/api/monad/aurora?${params}`)
        .then((response) => response.ok ? response.json() : null)
        .then((body) => {
          if (!live || !body?.status) return;
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

  const requestQuote = async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    setQuote(null);
    try {
      const response = await fetch('/api/monad/aurora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: address,
          originAsset: source.asset,
          amount: parseUnits(amount, source.decimals).toString(),
          refundTo,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Aurora did not return a deposit address');
      }
      const next = readQuote(payload);
      if (!next) throw new Error(payload.message || 'Aurora did not return a deposit address');
      setQuote({ ...next, status: 'PENDING_DEPOSIT' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aurora did not return a deposit address');
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!quote?.depositAddress) return;
    await navigator.clipboard.writeText(quote.depositAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="monad-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <div data-tour="fund-intro">
          <h1 className="text-3xl font-medium text-white">Fund MON from another chain</h1>
          <p className="mt-3 text-sm leading-6 text-[#E4E4E4]">
            Send ETH, USDT, or NEAR to one deposit address. Aurora swaps it and delivers MON to this Monad wallet. AUSD is not on Aurora’s Monad list, so the asset that arrives is MON. If the swap fails, the origin asset goes back to the refund address.
          </p>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PATH.map((step, index) => (
            <li key={step.name} className="rounded-2xl border border-white/10 bg-[#15111B] p-4">
              <div className="flex items-center gap-3">
                <Logo src={step.src} light={step.name === 'Origin'} />
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">{index + 1}</p>
              </div>
              <p className="mt-3 text-sm text-white">{step.name}</p>
              <p className="mt-1 text-xs leading-5 text-[#E4E4E4]">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section data-tour="fund-wallet" className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
          <div className="flex items-center gap-3">
            <Logo src="/logos/chains/monad.svg" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Recipient</p>
              <p className="text-sm text-white">MON arrives here</p>
            </div>
          </div>
          <p className="mt-4 break-all font-mono text-sm text-white">{ready ? address : 'Connect a wallet'}</p>
          <p className="mt-2 text-xs leading-5 text-[#E4E4E4]">Aurora sends MON to this address on Monad. The house balance updates after you deposit it on Trade.</p>
        </section>

        <section data-tour="fund-source" className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Pay with</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SOURCES.map((item) => {
              const selected = item.id === source.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSourceId(item.id)}
                  className={`rounded-xl border px-2 py-3 text-left ${selected ? 'border-[#7005FC] bg-[#7005FC]/15' : 'border-white/10 bg-[#070010]'}`}
                >
                  <img src={item.logo} alt="" className="h-6 w-6 object-contain" />
                  <p className="mt-2 text-sm text-white">{item.label}</p>
                  <p className="text-[11px] text-[#E4E4E4]">{item.id === 'near' ? 'Native' : item.chain}</p>
                </button>
              );
            })}
          </div>
          <label className="mt-4 block text-xs text-[#E4E4E4]">
            Amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#070010] px-3 text-sm text-white"
            />
          </label>
          <label className="mt-3 block text-xs text-[#E4E4E4]">
            {source.refundHint}
            <input
              value={refundTo}
              onChange={(event) => setRefundTo(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#070010] px-3 text-sm text-white"
            />
          </label>
        </section>

      <section data-tour="fund-quote" className="rounded-2xl border border-white/10 bg-[#15111B] p-5">
        <div className="flex items-center gap-3">
          <Logo src="/logos/sponsors/aurora.svg" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Deposit</p>
            <p className="text-sm text-white">Send {source.label} on {source.chain}</p>
          </div>
        </div>
        {quote ? (
          <div className="mt-4">
            <p className="text-xs text-[#E4E4E4]">Send {quote.amountIn || amount} {source.label} to</p>
            <p className="mt-2 break-all font-mono text-sm text-white">{quote.depositAddress}</p>
            <button type="button" onClick={copyAddress} className="mt-2 text-sm text-[#B781FE]">{copied ? 'Copied' : 'Copy address'}</button>
            {quote.depositMemo ? <p className="mt-2 text-xs text-[#E4E4E4]">Memo {quote.depositMemo}</p> : null}
            <p className="mt-3 text-sm text-white">
              {quote.amountOut ? `About ${quote.amountOut} ${quote.symbol || 'MON'} on Monad. ` : ''}
              <span className={statusTone(quote.status)}>{quote.status || 'PENDING_DEPOSIT'}</span>
            </p>
            {quote.status === 'SUCCESS' ? (
              <p className="mt-2 break-all text-sm text-[#82FF68]">
                {quote.symbol || 'MON'} arrived on Monad.
                {quote.destinationTx ? ` ${quote.destinationTx}` : ''} Deposit it on Trade to play.
              </p>
            ) : null}
            {quote.status === 'REFUNDED' || quote.status === 'FAILED' ? (
              <p className="mt-2 text-sm text-[#FF5C7A]">Aurora did not deliver {quote.symbol || 'MON'}. The refund goes to the address you set.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[#E4E4E4]">
            Aurora returns one deposit address for this amount. You send {source.label} there from {source.chain}. MON shows up on Monad, and this card follows the status.
          </p>
        )}
        {ready ? (
          <button
            type="button"
            onClick={requestQuote}
            disabled={busy || !refundTo || !Number(amount)}
            className="neon-btn mt-4 h-11 w-full text-sm disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {busy ? 'Asking Aurora' : 'Get deposit address'}
          </button>
        ) : (
          <button type="button" onClick={() => setConnectModalOpen(true)} className="neon-btn mt-4 h-11 w-full text-sm sm:w-auto sm:px-6">
            Connect a wallet
          </button>
        )}
        {error ? <p className="mt-3 text-sm leading-relaxed text-[#FF5C7A]">{error}</p> : null}
      </section>
      </div>
      <FundTour isOpen={isTourOpen} onClose={closeTour} />
    </main>
  );
}
