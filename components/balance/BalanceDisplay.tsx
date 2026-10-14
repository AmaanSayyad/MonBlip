'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, Check, Copy } from 'lucide-react';
import { useOverflowStore } from '@/lib/store';
import { getFeePercent } from '@/lib/fees/platformFee';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { ReceiptDrawer, type ReceiptData } from './ReceiptDrawer';
import { useToast } from '@/lib/hooks/useToast';
import { OPEN_DEPOSIT_EVENT, OPEN_WITHDRAW_EVENT, consumeDepositRequest, consumeWithdrawRequest } from '@/lib/ui/depositPrompt';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { SendOut } from './SendOut';

/**
 * BalanceDisplay Component
 * 
 * Displays the user's house balance with controls for deposit and withdrawal
 * 
 * Task: 8.1 Create BalanceDisplay component
 * Requirements: 8.1
 * 
 * Features:
 * - Display current house balance with chain-appropriate symbol
 * - Refresh button to fetch latest balance
 * - Deposit and Withdraw buttons with modals
 * - Show loading state while fetching
 * - Format balance to 4 decimal places
 */
interface BalanceDisplayProps {
  /** On-chain wallet balance shown above the house balance, so the deposit path reads top to bottom. */
  wallet?: { balance: number; loading?: boolean };
}

export const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ wallet }) => {
  const houseBalance = useOverflowStore(state => state.houseBalance);
  const demoBalance = useOverflowStore(state => state.demoBalance);
  const accountType = useOverflowStore(state => state.accountType);
  const network = useOverflowStore(state => state.network);
  const selectedCurrency = useOverflowStore(state => state.selectedCurrency);
  const toggleAccountType = useOverflowStore(state => state.toggleAccountType);
  const isLoading = useOverflowStore(state => state.isLoading);
  const address = useOverflowStore(state => state.address);
  const userTier = useOverflowStore(state => state.userTier);
  const fetchBalance = useOverflowStore(state => state.fetchBalance);
  const updateBalance = useOverflowStore(state => state.updateBalance);
  const toast = useToast();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [copied, setCopied] = useState(false);
  const [walletKind, setWalletKind] = useState<'Passkey wallet' | 'MetaMask'>('Passkey wallet');
  useEffect(() => {
    void import('@/lib/monad/injectedWallet').then(({ metaMaskActive }) => setWalletKind(metaMaskActive() ? 'MetaMask' : 'Passkey wallet'));
  }, [address]);
  useEffect(() => {
    if (accountType !== 'real') return;
    if (consumeDepositRequest()) setIsDepositModalOpen(true);
    if (consumeWithdrawRequest()) setIsWithdrawModalOpen(true);
    const open = () => {
      if (consumeDepositRequest()) setIsDepositModalOpen(true);
    };
    const openWithdraw = () => {
      if (consumeWithdrawRequest()) setIsWithdrawModalOpen(true);
    };
    window.addEventListener(OPEN_DEPOSIT_EVENT, open);
    window.addEventListener(OPEN_WITHDRAW_EVENT, openWithdraw);
    return () => {
      window.removeEventListener(OPEN_DEPOSIT_EVENT, open);
      window.removeEventListener(OPEN_WITHDRAW_EVENT, openWithdraw);
    };
  }, [accountType]);
  const feePercent = getFeePercent(userTier);

  // House credits: sync when this panel mounts or wallet / ledger currency changes.
  // WalletSync only refreshed on-chain balance; fetchBalance loads Supabase house balance.
  useEffect(() => {
    if (accountType === 'demo' || !address || !network) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (!cancelled) void fetchBalance(address);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [accountType, address, network, selectedCurrency, fetchBalance]);

  // Actions from other slices (using the unified store)
  const setAddress = useOverflowStore(state => state.setAddress);
  const setIsConnected = useOverflowStore(state => state.setIsConnected);

  /**
   * Exit demo mode and reset demo credentials
   */
  const handleExitDemo = () => {
    toggleAccountType(); // Switch back to 'real'
    setAddress(null);    // Clear 0xDEMO address
    setIsConnected(false); // Logout from demo session
    toast.info('Returned to real account');
  };

  /**
   * Handle refresh button click
   * Fetches the latest balance from the API
   */
  const handleRefresh = async () => {
    if (!address || isLoading) return;

    setIsRefreshing(true);
    try {
      await Promise.all([fetchBalance(address), useOverflowStore.getState().refreshWalletBalance()]);
      toast.success('Balance refreshed');
    } catch (error) {
      console.error('Error refreshing balance:', error);
      toast.error('Failed to refresh balance');
    } finally {
      setIsRefreshing(false);
    }
  };

  /**
   * Handle deposit button click
   * Opens the deposit modal
   */
  const handleDeposit = () => {
    setIsDepositModalOpen(true);
  };

  /**
   * Handle withdraw button click
   * Opens the withdraw modal
   */
  const handleWithdraw = () => {
    setIsWithdrawModalOpen(true);
  };

  /**
   * Handle successful deposit
   * Refreshes balance and shows success message
   */
  const handleDepositSuccess = async (amount: number, txHash: string) => {
    const fee = amount * feePercent;
    setReceipt({
      kind: 'deposit',
      amount,
      fee,
      net: amount - fee,
      chain: network || 'BNB',
      currency: currentSymbol,
      txHash,
      createdAt: Date.now(),
      status: 'confirmed',
    });
    setIsReceiptOpen(true);
  };

  /**
   * Handle successful withdrawal
   * Refreshes balance and shows success message
   */
  const handleWithdrawSuccess = async (amount: number, txHash: string) => {
    const fee = amount * feePercent;
    setReceipt({
      kind: 'withdrawal',
      amount,
      fee,
      net: amount - fee,
      chain: network || 'BNB',
      currency: currentSymbol,
      txHash,
      createdAt: Date.now(),
      status: txHash === 'PENDING' ? 'pending' : 'confirmed',
    });
    setIsReceiptOpen(true);
  };

  // Choose balance based on account type
  const activeBalance = accountType === 'real' ? houseBalance : demoBalance;
  const formattedBalance = activeBalance.toFixed(4);

  const suiLedgerSymbol = selectedCurrency === 'USDC' ? 'USDC' : 'SUI';

  // Current symbol for display (Sui: native SUI vs USDC ledger row)
  const currentSymbol = network === 'MONAD' ? (selectedCurrency === 'MON' ? 'MON' : 'AUSD')
    : network === 'ROBINHOOD' || network === 'ARB' ? 'ETH'
    : network === 'BASE' ? 'USDC'
    : network === 'TEMPO' ? 'OUSD'
    : network === 'SUI' ? suiLedgerSymbol
    : network === 'SOL' ? 'SOL'
    : network === 'XLM' ? 'XLM'
    : network === 'XTZ' ? 'XTZ'
    : network === 'NEAR' ? 'NEAR'
    : network === 'STRK' ? 'STRK'
    : network === 'PUSH' ? 'PC'
    : network === 'SOMNIA' ? 'STT'
    : network === 'OCT' ? 'OCT'
    : network === 'ZG' ? '0G'
    : network === 'INIT' ? 'INIT'
    : network === 'APT' ? 'APT'
    : 'ETH';

  const chainLogo =
    network === 'MONAD' ? '/logos/chains/monad.svg'
      : network === 'ROBINHOOD' ? '/partners/robinhood.svg'
      : network === 'SOL' ? '/logos/chains/solana.png'
        : network === 'BASE' ? '/logos/chains/base.png'
          : network === 'ARB' ? '/logos/chains/arbitrum.png'
            : network === 'TEMPO' ? '/logos/chains/tempo.png'
              : currentSymbol === 'ETH' ? '/logos/ticker/eth.svg'
                : null;

  const showWallet = Boolean(wallet) && accountType === 'real';
  const walletBalance = wallet?.balance ?? 0;
  const walletFormatted = Number(walletBalance.toFixed(4)).toString();
  const walletWaiting = showWallet && !wallet?.loading && walletBalance > 0 && houseBalance <= 0;
  const hint = !showWallet || isLoading
    ? null
    : walletWaiting
      ? `${walletFormatted} ${currentSymbol} is waiting in your wallet. Deposit it to play; rounds are paid from the house balance.`
      : houseBalance <= 0 && walletBalance <= 0 && !wallet?.loading
        ? `Add ${currentSymbol} to your wallet, then deposit it here. Deposit shows every way to fund it.`
        : null;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#141414]">
        {accountType === 'demo' && (
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-3 py-2.5">
            <span className="text-xs font-medium text-[#7005FC]">Practice mode</span>
            <button
              type="button"
              onClick={handleExitDemo}
              className="rounded-full border border-[#2a2a2a] px-2.5 py-1 text-[11px] text-[#DDD7FE] transition hover:border-[#7005FC] hover:text-white"
            >
              Exit
            </button>
          </div>
        )}

        {showWallet && address ? (
          <div className="relative border-b border-[#2a2a2a] px-3 pb-4 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#DDD7FE]">{walletKind}</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(address);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 font-mono text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white"
                title="Copy address"
              >
                {address.slice(0, 6)}…{address.slice(-4)}
                {copied ? <Check className="h-3 w-3 text-[#82FF68]" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-base font-medium tabular-nums text-white">
              {network === 'MONAD' ? <TokenLogo token={currentSymbol === 'MON' ? 'MON' : 'AUSD'} size={16} /> : null}
              {wallet?.loading ? '…' : walletFormatted} <span className="text-xs text-[#B781FE]">{currentSymbol}</span>
            </p>
            {network === 'MONAD' && walletKind === 'Passkey wallet' ? <SendOut /> : null}
            <span
              className={`absolute -bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                walletWaiting ? 'border-[#7005FC]/60 bg-[#1D1030] text-[#DDD7FE]' : 'border-[#2a2a2a] bg-[#141414] text-white/45'
              }`}
              aria-hidden
            >
              <ArrowDown className="h-3 w-3" />
              Deposit
            </span>
          </div>
        ) : null}

        <div className={`space-y-2 p-2.5 ${showWallet && address ? 'pt-4' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[#DDD7FE]">
              {accountType === 'demo' ? 'Practice balance' : 'House balance'}            </p>

            <div className="flex items-center gap-2">
              {accountType === 'real' && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={!address || isLoading || isRefreshing}
                  className="text-[#DDD7FE] transition hover:text-white disabled:opacity-40"
                  title="Refresh balance"
                >
                  <svg
                    className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {isLoading && accountType === 'real' ? (
            <div className="h-8 w-28 animate-pulse rounded-lg bg-white/10" />
          ) : (
            <div className="flex items-baseline gap-2">
              {network === 'MONAD' ? (
                <TokenLogo token={currentSymbol === 'MON' ? 'MON' : 'AUSD'} size={20} className="self-center" />
              ) : chainLogo ? (
                <img src={chainLogo} alt="" className="h-5 w-5 self-center rounded-md bg-black object-contain p-0.5" />
              ) : null}
              <p className="text-xl font-medium tabular-nums text-white">{formattedBalance}</p>
              <span className="text-sm font-medium text-[#7005FC]">{currentSymbol}</span>
            </div>
          )}

          {accountType === 'demo' ? (
            <button
              type="button"
              onClick={() => updateBalance(10000 - demoBalance, 'add')}
              className="h-10 w-full rounded-xl border border-[#2a2a2a] text-sm text-white transition hover:border-[#7005FC]"
            >
              Reset to 10,000
            </button>
          ) : (
            <>
            {hint ? (
              <p className={`rounded-xl px-3 py-2 text-[12px] leading-5 ${walletWaiting ? 'bg-[#7005FC]/15 text-white' : 'bg-white/[0.04] text-[#DDD7FE]'}`}>
                {hint}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDeposit}
                disabled={!address || isLoading}
                className={`h-10 rounded-full bg-[#7005FC] text-sm font-medium text-white transition hover:bg-[#8F3BFF] disabled:cursor-not-allowed disabled:opacity-40 ${
                  walletWaiting ? 'shadow-[0_0_0_3px_rgba(112,5,252,0.35)]' : ''
                }`}
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={!address || isLoading || houseBalance <= 0}
                className="h-10 rounded-full border border-[#2a2a2a] text-sm font-medium text-white transition hover:border-[#7005FC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Withdraw
              </button>
            </div>
            </>
          )}

          {!address && (
            <p className="text-center text-xs text-[#DDD7FE]">Connect a wallet to see your balance.</p>
          )}
        </div>
      </div>

      {/* Deposit Modal */}
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        onSuccess={handleDepositSuccess}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        onSuccess={handleWithdrawSuccess}
      />

      <ReceiptDrawer
        open={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        receipt={receipt}
      />
    </>
  );
};
