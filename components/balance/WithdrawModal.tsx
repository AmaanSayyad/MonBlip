'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useOverflowStore } from '@/lib/store';
import { useToast } from '@/lib/hooks/useToast';
import { calculateFeeAmount, getFeePercentLabel } from '@/lib/fees/platformFee';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (amount: number, txHash: string) => void;
  onError?: (error: string) => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, onSuccess, onError }) => {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const { address, withdrawFunds, houseBalance, refreshWalletBalance, selectedCurrency, userTier } = useOverflowStore();
  const asset = selectedCurrency === 'MON' ? 'MON' : 'AUSD';
  const toast = useToast();
  const feeLabel = getFeePercentLabel(userTier);
  const parsed = Number(amount);
  const hasAmount = Number.isFinite(parsed) && parsed > 0;
  const overBalance = hasAmount && parsed > houseBalance;
  const fee = hasAmount && !overBalance ? calculateFeeAmount(parsed, userTier) : 0;
  const receive = hasAmount && !overBalance ? Math.max(0, parsed - fee) : 0;

  useEffect(() => {
    if (!isOpen) return;
    let stop = false;
    void fetch('/api/monad/privy', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!stop) setReady(Boolean(data.configured));
      })
      .catch(() => {
        if (!stop) setReady(false);
      });
    return () => {
      stop = true;
    };
  }, [isOpen]);

  const handleWithdraw = async () => {
    const withdrawAmount = Number(amount);
      if (!address) {
      setError('Connect a wallet first.');
      return;
    }
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0 || withdrawAmount > houseBalance) {
      setError('Enter an amount within your house balance.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const signedAt = Date.now();
      const message = `MonBlip withdrawal authorization\naddress:${address}\namount:${withdrawAmount.toFixed(8)}\ncurrency:${asset}\nsignedAt:${signedAt}`;
      toast.info(`Confirm the wallet to withdraw ${asset}.`);
      const { signPlayMessage } = await import('@/lib/monad/playWallet');
      const signature = await signPlayMessage(message);
      const result = await withdrawFunds(address, withdrawAmount, { signature, signedAt });
      refreshWalletBalance();
      toast.success('Withdrawal sent.');
      const queued = result?.status === 'pending';
      onSuccess?.(withdrawAmount, queued ? 'PENDING' : String(result?.txHash || ''));
      onClose();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Withdrawal failed';
      setError(messageText);
      onError?.(messageText);
      toast.error(messageText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Withdraw ${asset}`}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[#070010] px-3 py-3">
          <p className="text-[11px] text-[#E4E4E4]">House balance</p>
          <p className="mt-1 text-2xl font-medium tabular-nums text-[#FCFBFF]">
            {houseBalance.toFixed(4)} <span className="text-base text-[#B781FE]">{asset}</span>
          </p>
          <p className="mt-1 text-[11px] text-[#E4E4E4]">Fee {feeLabel} comes out of this amount.</p>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="withdraw-amount" className="text-[11px] text-[#E4E4E4]">Amount</label>
            <button
              type="button"
              onClick={() => {
                setAmount(String(houseBalance));
                setError(null);
              }}
              className="text-[11px] font-medium text-[#B781FE]"
            >
              Max
            </button>
          </div>
          <div className="flex items-center rounded-xl border border-white/10 bg-[#070010] px-3 focus-within:border-[#7005FC]">
            <input
              id="withdraw-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="h-12 min-w-0 flex-1 bg-transparent text-[#FCFBFF] outline-none"
            />
            <span className="text-xs font-medium text-[#B781FE]">{asset}</span>
          </div>
          {hasAmount && !overBalance ? (
            <p className="mt-2 text-[12px] text-[#E4E4E4]">
              You receive <span className="text-[#FCFBFF]">{receive.toFixed(4)} {asset}</span>
            </p>
          ) : null}
          {overBalance ? (
            <p className="mt-2 text-sm text-[#FF5C7A]">Above the {houseBalance.toFixed(4)} {asset} house balance.</p>
          ) : null}
          {error && !overBalance ? <p className="mt-2 text-sm text-[#FF5C7A]">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={isLoading || !hasAmount || overBalance}
          onClick={() => void handleWithdraw()}
          className="neon-btn h-11 w-full text-sm disabled:opacity-50"
        >
          {isLoading ? 'Sending…' : 'Withdraw'}
        </button>
        <p className="text-[11px] leading-4 text-[#E4E4E4]">
          {ready === false
            ? 'The payout wallet is not ready.'
            : 'Returns to your wallet. A send is capped at 10.'}
        </p>
      </div>
    </Modal>
  );
};
