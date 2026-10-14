'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Address } from 'viem';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { useOverflowStore } from '@/lib/store';
import { useToast } from '@/lib/hooks/useToast';
import { calculateFeeAmount, getFeePercent, getFeePercentLabel } from '@/lib/fees/platformFee';
import { consumeDepositCredit } from '@/lib/ui/depositPrompt';
import { hasInjectedWallet, metaMaskActive, topUpFromMetaMask } from '@/lib/monad/injectedWallet';
import { friendlyTxError } from '@/lib/monad/txError';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (amount: number, txHash: string) => void;
  onError?: (error: string) => void;
}

type Asset = 'MON' | 'AUSD';

const MON_GAS_RESERVE = 0.02;
const GAS_TOP_UP = 0.05;
const TOP_UP_PRESETS: Record<Asset, number[]> = { MON: [1, 5, 10], AUSD: [1, 10, 25, 50] };

async function readTreasury(): Promise<string> {
  const response = await fetch('/api/treasury?network=MONAD');
  if (!response.ok) return '';
  const data = await response.json();
  return String(data.address || '').trim();
}

async function readGasBalance(address: string) {
  const { readEvmWalletBalance } = await import('@/lib/chains/evmTreasury');
  return readEvmWalletBalance('MONAD', address, 'MON');
}

function trim(value: number, digits = 4) {
  return Number(value.toFixed(digits)).toString();
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const TOP_UP_LABEL = {
  connect: 'Opening MetaMask…',
  send: 'Confirm in MetaMask…',
  confirm: 'Waiting for Monad…',
  gas: 'Sending MON for gas…',
} as const;

const chip = (active: boolean) =>
  `h-8 rounded-lg border px-3 text-xs font-medium tabular-nums transition ${
    active ? 'border-[#7005FC] bg-[#7005FC]/25 text-white' : 'border-white/10 bg-white/[0.04] text-[#E4E4E4] hover:border-white/25'
  }`;

function Steps({ funded }: { funded: boolean }) {
  const dot = (done: boolean, active: boolean) =>
    `grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
      done ? 'bg-[#82FF68] text-[#070010]' : active ? 'bg-[#7005FC] text-white' : 'bg-white/10 text-white/50'
    }`;
  return (
    <ol className="flex items-center gap-2 text-[11px]">
      <li className="flex items-center gap-1.5">
        <span className={dot(funded, !funded)}>{funded ? <Check className="h-3 w-3" strokeWidth={3} /> : '1'}</span>
        <span className={funded ? 'text-white/50' : 'text-white'}>Fund wallet</span>
      </li>
      <span className="h-px flex-1 bg-white/10" aria-hidden />
      <li className="flex items-center gap-1.5">
        <span className={dot(false, funded)}>2</span>
        <span className={funded ? 'text-white' : 'text-white/50'}>Deposit to play</span>
      </li>
    </ol>
  );
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess, onError }) => {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [topUpStep, setTopUpStep] = useState<keyof typeof TOP_UP_LABEL | null>(null);
  const [topUpPick, setTopUpPick] = useState<number | null>(null);
  const [gasBalance, setGasBalance] = useState<number | null>(null);
  const [arrived, setArrived] = useState<number | null>(null);
  const [isPasskey, setIsPasskey] = useState(false);
  const [canUseMetaMask, setCanUseMetaMask] = useState(false);
  const lastBalance = useRef<number | null>(null);
  const { depositFunds, address, walletBalance, selectedCurrency, userTier, refreshWalletBalance } = useOverflowStore();
  const asset: Asset = selectedCurrency === 'MON' ? 'MON' : 'AUSD';
  const toast = useToast();
  const feeLabel = getFeePercentLabel(userTier);

  const parsed = Number(amount);
  const hasAmount = Number.isFinite(parsed) && parsed > 0;
  const spendable = asset === 'MON' ? Math.max(0, walletBalance - MON_GAS_RESERVE) : walletBalance;
  const overWallet = hasAmount && parsed > spendable;
  const needsGas = asset === 'AUSD' && gasBalance != null && gasBalance < MON_GAS_RESERVE;
  const fee = hasAmount && !overWallet ? calculateFeeAmount(parsed, userTier) : 0;
  const credited = hasAmount && !overWallet ? Math.max(0, parsed - fee) : 0;
  const shortfall = overWallet ? parsed - spendable + (asset === 'MON' ? MON_GAS_RESERVE : 0) : 0;
  const empty = spendable <= 0;
  const gasOnly = needsGas && !empty && !overWallet;
  const fundAsset: Asset = gasOnly ? 'MON' : asset;
  const showFunding = isPasskey && (empty || overWallet || needsGas);
  const presets = TOP_UP_PRESETS[asset];
  const topUpAmount = gasOnly ? GAS_TOP_UP : topUpPick ?? (shortfall > 0 ? Number(trim(shortfall, asset === 'MON' ? 4 : 2)) : presets[1]);

  useEffect(() => {
    if (!isOpen) return;
    setIsPasskey(!metaMaskActive());
    setCanUseMetaMask(hasInjectedWallet());
    setError(null);
    setArrived(null);
    setTopUpPick(null);
    lastBalance.current = null;
    const credit = consumeDepositCredit();
    if (credit) setAmount(trim(Math.ceil((credit / (1 - getFeePercent(userTier))) * 10_000) / 10_000));
    else if (spendable > 0) setAmount((current) => current || trim(Math.floor(spendable * 10_000) / 10_000));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill once per open, not on every balance tick
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !address) return;
    let live = true;
    const tick = () => {
      void refreshWalletBalance();
      if (asset === 'AUSD') {
        void readGasBalance(address).then((value) => { if (live) setGasBalance(value); }).catch(() => {});
      } else {
        setGasBalance(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 6000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [isOpen, address, asset, refreshWalletBalance]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = lastBalance.current;
    lastBalance.current = walletBalance;
    if (previous == null || walletBalance <= previous + 1e-9) return;
    setArrived(walletBalance - previous);
    const nextSpendable = asset === 'MON' ? Math.max(0, walletBalance - MON_GAS_RESERVE) : walletBalance;
    setAmount((current) => (current && Number(current) <= nextSpendable ? current : trim(Math.floor(nextSpendable * 10_000) / 10_000)));
    const timer = window.setTimeout(() => setArrived(null), 5000);
    return () => window.clearTimeout(timer);
  }, [walletBalance, isOpen, asset]);

  const pickShare = (share: number) => {
    setAmount(trim(Math.floor(spendable * share * 10_000) / 10_000));
    setError(null);
  };

  const handleDeposit = async () => {
    const depositAmount = Number(amount);
    if (!address) {
      setError('Connect a wallet first.');
      return;
    }
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      setError(`Enter a ${asset} amount.`);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const treasury = await readTreasury();
      if (!treasury) throw new Error('Monad treasury is not configured.');
      const { sendPlayDeposit } = await import('@/lib/monad/playWallet');
      toast.info(`Confirm the wallet to send ${asset}.`);
      const txHash = await sendPlayDeposit(asset, depositAmount, treasury as `0x${string}`);
      await depositFunds(address, depositAmount, txHash);
      toast.success(`${asset} deposited.`);
      onSuccess?.(depositAmount, txHash);
      onClose();
    } catch (err) {
      const message = friendlyTxError(err, 'The deposit did not go through. Try again.');
      setError(message);
      onError?.(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTopUp = async () => {
    if (!address) return;
    setError(null);
    try {
      await topUpFromMetaMask(fundAsset, topUpAmount, address as Address, setTopUpStep);
      await refreshWalletBalance();
      toast.success(`${trim(topUpAmount)} ${fundAsset} arrived in your passkey wallet.`);
    } catch (err) {
      const message = friendlyTxError(err, 'The MetaMask transfer did not go through. Try again.');
      setError(message);
      toast.error(message);
    } finally {
      setTopUpStep(null);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const funding = (
    <div className="rounded-xl border border-[#7005FC]/35 bg-gradient-to-b from-[#7005FC]/15 to-[#7005FC]/5 p-3.5">
      <p className="text-sm font-medium text-white">
        {gasOnly ? 'Add a little MON for gas' : overWallet ? `Add ${trim(shortfall)} ${asset} to cover this deposit` : `Add ${asset} to your passkey wallet`}
      </p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[#DDD7FE]/80">
        {gasOnly ? 'The AUSD transfer pays its fee in MON.' : 'It lands in a few seconds, then you deposit it to play.'}
      </p>

      {canUseMetaMask ? (
        <div className="mt-3">
          {gasOnly ? null : (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {shortfall > 0 && !presets.includes(Number(trim(shortfall, 2))) ? (
                <button type="button" onClick={() => setTopUpPick(null)} className={chip(topUpPick == null)}>
                  {trim(shortfall, asset === 'MON' ? 4 : 2)} {asset}
                </button>
              ) : null}
              {presets.map((value) => (
                <button key={value} type="button" onClick={() => setTopUpPick(value)} className={chip(topUpAmount === value)}>
                  {value} {asset}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={topUpStep != null}
            onClick={() => void handleTopUp()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7005FC] text-sm font-medium text-white transition hover:bg-[#8F3BFF] disabled:opacity-60"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-white/15">
              <img src="/logos/sponsors/metamask.svg" alt="" className="h-4 w-4" />
            </span>
            {topUpStep ? TOP_UP_LABEL[topUpStep] : `Send ${trim(topUpAmount)} ${fundAsset} from MetaMask`}
          </button>
          <div className="my-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-white/35" aria-hidden>
            <span className="h-px flex-1 bg-white/10" />
            or send it yourself
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      ) : (
        <p className="mb-2 mt-3 text-[11px] uppercase tracking-[0.14em] text-white/40">Send it from any wallet or exchange</p>
      )}

      <button
        type="button"
        onClick={() => void copyAddress()}
        className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#070010] px-3 py-2.5 text-left transition hover:border-white/25"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] text-white/90">{address}</span>
          <span className="mt-0.5 block text-[11px] text-white/45">{fundAsset} on Monad · chain 143</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#B781FE]">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>

      {gasOnly ? null : (
        <Link
          href="/fund"
          onClick={onClose}
          className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-[12px] text-[#E4E4E4] transition hover:bg-white/5"
        >
          <span>
            On Ethereum or NEAR? <span className="font-medium text-[#B781FE]">Bridge with Aurora</span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-[#B781FE]" />
        </Link>
      )}

      <p className="mt-2 flex items-center gap-2 text-[11px] text-white/50" aria-live="polite">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#B781FE]/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#B781FE]" />
        </span>
        Watching for incoming {fundAsset}
      </p>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Deposit ${asset}`}>
      <div className="space-y-4">
        {isPasskey ? <Steps funded={!empty && !needsGas} /> : null}

        <div className="rounded-xl border border-white/10 bg-[#070010] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-white/60">
              {isPasskey ? 'Passkey wallet' : 'Wallet'}
              {address ? <span className="ml-1.5 font-mono text-white/40">{shortAddress(address)}</span> : null}
            </p>
            {arrived ? (
              <span className="rounded-full bg-[#82FF68]/15 px-2 py-0.5 text-[10px] font-medium text-[#82FF68]">
                +{trim(arrived)} {asset} arrived
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] text-white/45">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#82FF68]" />
                Live
              </span>
            )}
          </div>
          <p className="mt-1.5 flex items-center gap-2 text-[28px] font-medium leading-tight tabular-nums text-[#FCFBFF]">
            <TokenLogo token={asset} size={26} />
            {trim(walletBalance)} <span className="text-base text-[#B781FE]">{asset}</span>
          </p>
          {asset === 'AUSD' && gasBalance != null ? (
            <p className={`mt-1 flex items-center gap-1.5 text-[11px] ${needsGas ? 'text-[#FFB547]' : 'text-white/45'}`}>
              <TokenLogo token="MON" size={12} />
              {trim(gasBalance)} MON for gas
            </p>
          ) : null}
        </div>

        {isPasskey && empty ? null : (
          <div>
            <label htmlFor="deposit-amount" className="mb-1.5 block text-[11px] text-white/60">
              Amount to deposit
            </label>
            <div className="flex items-center rounded-xl border border-white/10 bg-[#070010] px-3.5 focus-within:border-[#7005FC]">
              <input
                id="deposit-amount"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value.replace(',', '.'));
                  setError(null);
                }}
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 min-w-0 flex-1 bg-transparent text-lg tabular-nums text-[#FCFBFF] outline-none placeholder:text-white/25"
              />
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#B781FE]">
                <TokenLogo token={asset} size={16} />
                {asset}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              {[
                { label: '25%', share: 0.25 },
                { label: '50%', share: 0.5 },
                { label: 'Max', share: 1 },
              ].map(({ label, share }) => (
                <button
                  key={label}
                  type="button"
                  disabled={spendable <= 0}
                  onClick={() => pickShare(share)}
                  className={`${chip(hasAmount && Math.abs(parsed - Math.floor(spendable * share * 10_000) / 10_000) < 1e-9)} flex-1 disabled:opacity-40`}
                >
                  {label}
                </button>
              ))}
            </div>

            {hasAmount && !overWallet ? (
              <dl className="mt-3 space-y-1.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-[12px]">
                <div className="flex justify-between text-white/60">
                  <dt>Fee {feeLabel}</dt>
                  <dd className="tabular-nums">−{trim(fee)} {asset}</dd>
                </div>
                <div className="flex justify-between text-[#FCFBFF]">
                  <dt>House balance gets</dt>
                  <dd className="font-medium tabular-nums">{trim(credited)} {asset}</dd>
                </div>
                {asset === 'MON' ? <p className="pt-0.5 text-[11px] text-white/40">{MON_GAS_RESERVE} MON stays in the wallet for gas.</p> : null}
              </dl>
            ) : null}
            {overWallet && !isPasskey ? (
              <p className="mt-2 text-sm text-[#FFB547]">
                This wallet can send {trim(spendable)} {asset}.
              </p>
            ) : null}
          </div>
        )}

        {showFunding ? funding : null}

        {error ? <p className="text-sm text-[#FF5C7A]">{error}</p> : null}

        {isPasskey && empty ? null : (
          <button
            type="button"
            disabled={isLoading || !hasAmount || overWallet || needsGas}
            onClick={() => void handleDeposit()}
            className="neon-btn h-11 w-full text-sm disabled:opacity-50"
          >
            {isLoading
              ? 'Sending…'
              : overWallet
                ? `Add ${asset} to deposit ${trim(parsed)}`
                : hasAmount
                  ? `Deposit ${trim(parsed)} ${asset}`
                  : 'Enter an amount'}
          </button>
        )}
      </div>
    </Modal>
  );
};
