'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useOverflowStore } from '@/lib/store';
import { useToast } from '@/lib/hooks/useToast';
import { calculateFeeAmount, getFeePercentLabel } from '@/lib/fees/platformFee';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (amount: number, txHash: string) => void;
  onError?: (error: string) => void;
}

async function readTreasury(): Promise<string> {
  const response = await fetch('/api/treasury?network=MONAD');
  if (!response.ok) return '';
  const data = await response.json();
  return String(data.address || '').trim();
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess, onError }) => {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { depositFunds, address, walletBalance, selectedCurrency, userTier } = useOverflowStore();
  const asset = selectedCurrency === 'MON' ? 'MON' : 'AUSD';
  const toast = useToast();
  const feeLabel = getFeePercentLabel(userTier);
  const parsed = Number(amount);
  const hasAmount = Number.isFinite(parsed) && parsed > 0;
  const overWallet = hasAmount && parsed > walletBalance;
  const fee = hasAmount && !overWallet ? calculateFeeAmount(parsed, userTier) : 0;
  const credited = hasAmount && !overWallet ? Math.max(0, parsed - fee) : 0;

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
      toast.info(asset === 'MON' ? 'Confirm the wallet to send MON.' : 'Confirm the wallet to send AUSD.');
      const txHash = await sendPlayDeposit(asset, depositAmount, treasury as `0x${string}`);
      await depositFunds(address, depositAmount, txHash);
      toast.success(`${asset} deposited.`);
      onSuccess?.(depositAmount, txHash);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed';
      setError(message);
      onError?.(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Deposit ${asset}`}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-[#070010] px-3 py-3">
          <p className="text-[11px] text-[#E4E4E4]">In this wallet</p>
          <p className="mt-1 text-2xl font-medium tabular-nums text-[#FCFBFF]">
            {walletBalance.toFixed(4)} <span className="text-base text-[#B781FE]">{asset}</span>
          </p>
          <p className="mt-1 text-[11px] text-[#E4E4E4]">
            Fee {feeLabel} comes out of this amount.
            {asset === 'MON' ? ' Leave a little MON for gas.' : ''}
          </p>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="deposit-amount" className="text-[11px] text-[#E4E4E4]">Amount</label>
            <button
              type="button"
              onClick={() => {
                setAmount(String(walletBalance));
                setError(null);
              }}
              className="text-[11px] font-medium text-[#B781FE]"
            >
              Max
            </button>
          </div>
          <div className="flex items-center rounded-xl border border-white/10 bg-[#070010] px-3 focus-within:border-[#7005FC]">
            <input
              id="deposit-amount"
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
          {hasAmount && !overWallet ? (
            <p className="mt-2 text-[12px] text-[#E4E4E4]">
              House receives <span className="text-[#FCFBFF]">{credited.toFixed(4)} {asset}</span>
            </p>
          ) : null}
          {overWallet ? (
            <p className="mt-2 text-sm text-[#FF5C7A]">Above the {walletBalance.toFixed(4)} {asset} in this wallet.</p>
          ) : null}
          {error && !overWallet ? <p className="mt-2 text-sm text-[#FF5C7A]">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={isLoading || !hasAmount || overWallet}
          onClick={() => void handleDeposit()}
          className="neon-btn h-11 w-full text-sm disabled:opacity-50"
        >
          {isLoading ? 'Sending…' : 'Deposit'}
        </button>
      </div>
    </Modal>
  );
};
