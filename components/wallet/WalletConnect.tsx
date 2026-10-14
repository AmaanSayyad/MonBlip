'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useOverflowStore } from '@/lib/store';
import { meraPhase, subscribeMera } from '@/lib/monad/account';
import { TokenLogo } from '@/components/ui/TokenLogo';

const CHAIN_MARK = {
  name: 'Monad',
  asset: 'AUSD',
  logo: '/logos/chains/monad.svg',
};

export function chainMark(network: string | null | undefined) {
  if (network !== 'MONAD') return null;
  return CHAIN_MARK;
}

function formatHouseBalance(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function useMonBlipDisconnect() {
  const { disconnect: disconnectStore, setPreferredNetwork } = useOverflowStore();
  return () => {
    void import('@/lib/monad/playWallet').then(({ disconnectPlaySession }) => disconnectPlaySession());
    disconnectStore();
    setPreferredNetwork('MONAD');
  };
}

export const WalletConnect: React.FC = () => {
  const handleDisconnect = useMonBlipDisconnect();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { network, address, setConnectModalOpen, houseBalance, demoBalance, accountType, selectedCurrency, setSelectedCurrency } = useOverflowStore();
  const chain = chainMark(network) ?? CHAIN_MARK;
  const asset = selectedCurrency === 'MON' ? 'MON' : 'AUSD';
  const houseAmount = accountType === 'demo' ? demoBalance : houseBalance;
  const houseLabel = `${formatHouseBalance(houseAmount)} ${asset}`;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const [phase, setPhase] = useState<'new' | 'locked' | 'live'>('new');
  useEffect(() => {
    setPhase(meraPhase());
    return subscribeMera(() => setPhase(meraPhase()));
  }, []);

  const [walletAmount, setWalletAmount] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !address) return;
    let live = true;
    setWalletAmount(null);
    void import('@/lib/chains/evmTreasury')
      .then(({ readEvmWalletBalance }) => readEvmWalletBalance('MONAD', address, asset))
      .then((value) => { if (live) setWalletAmount(value); })
      .catch(() => { if (live) setWalletAmount(null); });
    return () => { live = false; };
  }, [open, address, asset]);

  const isConnected = !!address;
  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '';

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={() => setConnectModalOpen(true)}
        data-tour="connect-button"
        className="neon-btn inline-flex h-9 px-3.5 text-sm sm:h-10 sm:px-5"
      >
        {phase === 'locked' ? 'Unlock' : 'Connect'}
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        data-tour="connect-button"
        aria-expanded={open}
        aria-label={`MonBlip balance ${houseLabel} on ${chain.name}`}
        onClick={() => setOpen((value) => !value)}
        className="teal-btn h-9 max-w-[9.5rem] gap-2 pl-1 pr-2.5 text-sm sm:h-10 sm:max-w-none sm:pr-3"
      >
        <TokenLogo token={asset} size={28} />
        <span className="min-w-0 truncate tabular-nums text-white">
          {formatHouseBalance(houseAmount)}
          <span className="ml-1 text-[#DDD7FE]">{asset}</span>
        </span>
        <span className="hidden h-4 w-px bg-[#2a2a2a] sm:block" aria-hidden />
        <span className="hidden font-mono text-[13px] text-[#DDD7FE] sm:inline">{short}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[140] w-60 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-2 shadow-[0_16px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-black">
              <img src={chain.logo} alt="" className="h-6 w-6 object-contain" />
            </span>
            <span>
              <span className="block text-sm text-white">{chain.name}</span>
              <span className="block text-xs text-[#DDD7FE]">{asset} · {short}</span>
            </span>
          </div>
          <div className="mx-2 mb-1 rounded-xl bg-black px-3 py-2">
            <p className="flex items-center justify-between gap-2 text-[11px] text-[#DDD7FE]">
              MonBlip balance
              {phase === 'live' ? <span className="text-[#DDD7FE]/50">Session · 15 min</span> : null}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm tabular-nums text-white">
              <TokenLogo token={asset} size={18} />
              {houseLabel}
            </p>
            <p className="mt-0.5 text-[11px] text-[#DDD7FE]/50">For rounds on Trade</p>
            <div className="my-2 h-px bg-white/10" />
            <p className="text-[11px] text-[#DDD7FE]">In your wallet</p>
            <p className="mt-1 flex items-center gap-2 text-sm tabular-nums text-white">
              <TokenLogo token={asset} size={18} />
              {walletAmount == null ? '…' : `${formatHouseBalance(walletAmount)} ${asset}`}
            </p>
            <p className="mt-0.5 text-[11px] text-[#DDD7FE]/50">On Monad · deposit it to play</p>
          </div>
          <div className="mx-2 mb-1 grid grid-cols-2 gap-1 rounded-xl bg-black p-1">
            {(['AUSD', 'MON'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setSelectedCurrency(choice)}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs ${asset === choice ? 'bg-[#7005FC] text-white' : 'text-[#DDD7FE] hover:bg-white/5'}`}
              >
                <TokenLogo token={choice} size={14} />
                {choice}
              </button>
            ))}
          </div>
          {accountType !== 'demo' ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void import('@/lib/ui/depositPrompt').then(({ requestDeposit }) => requestDeposit());
                if (pathname !== '/trade') router.push('/trade');
              }}
              className="mt-1 flex h-10 w-full items-center rounded-xl px-3 text-left text-sm text-white hover:bg-white/5"
            >
              Deposit {asset}
            </button>
          ) : null}
          {accountType !== 'demo' ? (
            <button
              type="button"
              disabled={houseAmount <= 0}
              onClick={() => {
                setOpen(false);
                void import('@/lib/ui/depositPrompt').then(({ requestWithdraw }) => requestWithdraw());
                if (pathname !== '/trade') router.push('/trade');
              }}
              className="group flex w-full flex-col items-start justify-center rounded-xl px-3 py-2 text-left hover:bg-white/5 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <span className="whitespace-nowrap text-sm text-white group-disabled:text-white/40">Withdraw {asset}</span>
              {houseAmount <= 0 ? (
                <span className="mt-0.5 whitespace-nowrap text-[11px] text-[#DDD7FE]/45">Deposit first to have a balance</span>
              ) : null}
            </button>
          ) : null}
          <Link href="/profile" onClick={() => setOpen(false)} className="mt-1 flex h-10 items-center rounded-xl px-3 text-sm text-white hover:bg-white/5">
            Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              handleDisconnect();
              setOpen(false);
            }}
            className="flex h-10 w-full items-center rounded-xl px-3 text-left text-sm text-[#ff5c5c] hover:bg-[#ff5c5c]/10"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};
