'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Copy, ExternalLink, X } from 'lucide-react';

export interface ReceiptData {
  kind: 'deposit' | 'withdrawal';
  amount: number;
  fee: number;
  net: number;
  chain: string;
  currency: string;
  txHash?: string;
  createdAt: number;
  status?: 'confirmed' | 'pending';
}

function explorerUrl(_chain: string, txHash?: string) {
  if (!txHash || txHash === 'PENDING') return null;
  return `https://monadvision.com/tx/${txHash}`;
}

function chainLabel(chain: string) {
  const c = chain.toUpperCase();
  if (c === 'MONAD' || c === 'AUSD' || c === 'MON') return 'Monad';
  if (c === 'ARB') return 'Arbitrum';
  if (c === 'BASE' || c === 'USDC_BASE') return 'Base';
  if (c === 'TEMPO' || c === 'OUSD') return 'Tempo';
  if (c === 'SOL') return 'Solana';
  return chain;
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return '0.0000';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toFixed(4);
}

function maskHash(hash: string) {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export const ReceiptDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
}> = ({ open, onClose, receipt }) => {
  const [copied, setCopied] = useState(false);
  const tx = useMemo(() => {
    if (!receipt?.txHash) return null;
    return receipt.txHash.split('|')[0];
  }, [receipt?.txHash]);

  if (!open || !receipt) return null;

  const link = explorerUrl(receipt.chain, tx || undefined);
  const isPending = receipt.status === 'pending';
  const title = receipt.kind === 'deposit' ? 'Deposit' : 'Withdrawal';
  const StatusIcon = isPending ? Clock3 : CheckCircle2;

  return (
    /* Full-screen backdrop */
    <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
      {/* Dim backdrop — click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card — centered, fixed max-width, no overflow issues */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#101010] shadow-[0_32px_80px_rgba(0,0,0,0.8)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#232323] px-4 py-4">
          <div className="flex items-center gap-3">
            <StatusIcon className={`h-5 w-5 ${isPending ? 'text-[#e6c200]' : 'text-[#7005FC]'}`} />
            <div>
              <p className="text-sm text-white">{title} {isPending ? 'pending' : 'confirmed'}</p>
              <p className="mt-1 text-xs text-[#DDD7FE]">
                {chainLabel(receipt.chain)} · {new Date(receipt.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#DDD7FE] transition hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pt-4">
          <p className="text-xs text-[#DDD7FE]">Amount</p>
          <p className="mt-1 text-3xl font-medium tabular-nums text-white">
            {formatAmount(receipt.amount)} <span className="text-base text-[#7005FC]">{receipt.currency}</span>
          </p>
          {receipt.fee > 0.00005 && (
            <p className="mt-2 text-xs text-[#DDD7FE]">
              Fee {formatAmount(receipt.fee)} · credited {formatAmount(receipt.net)}
            </p>
          )}
        </div>

        {isPending && (
          <div className="mx-4 mt-4 rounded-2xl border border-[#2a2a2a] bg-black px-3 py-3">
            <p className="text-sm text-white">Waiting for approval</p>
            <p className="mt-1 text-xs leading-5 text-[#DDD7FE]">
              Withdrawals over $10 are sent after they are approved. Your house balance stays the same until then.
            </p>
          </div>
        )}

        {tx && tx !== 'PENDING' && (
          <div className="mx-4 mt-4 rounded-2xl border border-[#2a2a2a] bg-black px-3 py-3">
            <p className="text-xs text-[#DDD7FE]">Transaction</p>
            <p className="mt-1 break-all font-mono text-sm leading-6 text-white">{maskHash(tx)}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tx);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  } catch { /* ignore */ }
                }}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#2a2a2a] text-xs text-white transition hover:border-[#7005FC]"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#2a2a2a] text-xs text-white transition hover:border-[#7005FC]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </a>
              )}
            </div>
          </div>
        )}

        <div className="px-4 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-full bg-[#7005FC] text-sm font-medium text-white"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
