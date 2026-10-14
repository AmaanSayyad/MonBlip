'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, ClipboardPaste, KeyRound, Loader2, X } from 'lucide-react';
import { createPublicClient, erc20Abi, formatEther, formatUnits, http, isAddress, type Address } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { confirmMeraSpend, meraAddress, meraWalletClient } from '@/lib/monad/account';
import { useOverflowStore } from '@/lib/store';
import { useToast } from '@/lib/hooks/useToast';
import { TokenLogo } from '@/components/ui/TokenLogo';

const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
// Smart-account recipients (EIP-7702 delegated) need more than 21,000 to receive MON.
const MON_GAS = 21_000n;
const FALLBACK_GAS = 40_000n;
const AUSD_GAS = 80_000n;

const shortError = (error: unknown) =>
  (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message.split('\n')[0] : 'Could not read balances');

type Asset = 'AUSD' | 'MON';
type Plan = {
  ausd: bigint;
  mon: bigint;
  reserve: bigint;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};
type Step = { asset: Asset; amount: string; state: 'sending' | 'sent' | 'failed'; hash?: string };

const ausdText = (value: bigint) => Number(formatUnits(value, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const monText = (value: bigint) => Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 4 });

async function planFor(from: Address, to: Address): Promise<Plan> {
  const [ausd, fees, estimate, balance] = await Promise.all([
    publicClient.readContract({ address: MONAD_AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [from] }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({ account: from, to, value: 0n }).catch(() => FALLBACK_GAS),
    publicClient.getBalance({ address: from }),
  ]);
  const gas = estimate > MON_GAS ? (estimate * 12n) / 10n : MON_GAS;
  const maxFeePerGas = fees.maxFeePerGas * 2n;
  const ausdFee = ausd > 0n ? AUSD_GAS * maxFeePerGas : 0n;
  const reserve = gas * maxFeePerGas + ausdFee;
  const mon = balance > reserve ? balance - reserve : 0n;
  return { ausd, mon, reserve, gas, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
}

export function SendOutButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition ${
        open ? 'border-[#7005FC] bg-[#7005FC]/15 text-white' : 'border-[#2a2a2a] text-[#DDD7FE] hover:border-[#7005FC] hover:text-white'
      }`}
    >
      <ArrowUpRight className="h-3.5 w-3.5" />
      Send
    </button>
  );
}

/** Moves every AUSD and all MON except the gas for these sends out of the passkey wallet. */
export function SendOutPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState<'passkey' | 'sending' | null>(null);

  const from = meraAddress();
  const recipient = to.trim();
  const valid = isAddress(recipient);
  const self = valid && from != null && recipient.toLowerCase() === from.toLowerCase();
  const ready = valid && !self;
  const done = steps.length > 0 && steps.every((step) => step.state !== 'sending');
  const failed = steps.some((step) => step.state === 'failed');
  const idle = steps.length === 0;

  useEffect(() => {
    if (!idle) return;
    if (!ready || !from) {
      setPlan(null);
      setPlanError(null);
      return;
    }
    let cancelled = false;
    setPlan(null);
    planFor(from, recipient as Address)
      .then((next) => !cancelled && (setPlan(next), setPlanError(null)))
      .catch((error) => !cancelled && setPlanError(shortError(error)));
    return () => {
      cancelled = true;
    };
  }, [ready, from, recipient, idle]);

  async function paste() {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (text) setTo(text.trim());
  }

  function update(asset: Asset, patch: Partial<Step>) {
    setSteps((rows) => rows.map((row) => (row.asset === asset ? { ...row, ...patch } : row)));
  }

  async function sendAll() {
    if (!from || !ready) return;
    const target = recipient as Address;
    try {
      setBusy('passkey');
      await confirmMeraSpend();
      setBusy('sending');
      const fresh = await planFor(from, target);
      setPlan(fresh);
      const queue: Step[] = [];
      if (fresh.ausd > 0n) queue.push({ asset: 'AUSD', amount: `${ausdText(fresh.ausd)} AUSD`, state: 'sending' });
      if (fresh.mon > 0n) queue.push({ asset: 'MON', amount: `${monText(fresh.mon)} MON`, state: 'sending' });
      if (!queue.length) {
        toast.info('Nothing to send beyond the gas reserve.');
        return;
      }
      setSteps(queue);
      const wallet = meraWalletClient();

      if (fresh.ausd > 0n) {
        try {
          const hash = await wallet.writeContract({
            address: MONAD_AUSD,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [target, fresh.ausd],
            gas: AUSD_GAS,
          });
          update('AUSD', { hash });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          update('AUSD', { state: receipt.status === 'success' ? 'sent' : 'failed' });
        } catch {
          update('AUSD', { state: 'failed' });
        }
      }

      if (fresh.mon > 0n) {
        const { gas, maxFeePerGas, maxPriorityFeePerGas } = fresh;
        const balance = await publicClient.getBalance({ address: from });
        const value = balance - gas * maxFeePerGas;
        if (value <= 0n) {
          update('MON', { state: 'failed' });
        } else {
          try {
            update('MON', { amount: `${monText(value)} MON` });
            const hash = await wallet.sendTransaction({ to: target, value, gas, maxFeePerGas, maxPriorityFeePerGas });
            update('MON', { hash });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            update('MON', { state: receipt.status === 'success' ? 'sent' : 'failed' });
          } catch {
            update('MON', { state: 'failed' });
          }
        }
      }
    } catch (error) {
      toast.error(shortError(error));
    } finally {
      setBusy(null);
      void useOverflowStore.getState().refreshWalletBalance();
    }
  }

  const nothing = plan != null && plan.ausd === 0n && plan.mon === 0n;
  const label =
    busy === 'passkey' ? 'Confirm with your passkey…'
      : busy === 'sending' ? 'Sending…'
        : !plan ? 'Send all'
          : `Send ${[plan.ausd > 0n ? `${ausdText(plan.ausd)} AUSD` : '', plan.mon > 0n ? `${monText(plan.mon)} MON` : ''].filter(Boolean).join(' + ') || 'all'}`;

  return (
    <div className="mt-3 rounded-xl border border-[#7005FC]/40 bg-[#0d0716] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-white">Send out</p>
        <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-md p-0.5 text-white/45 transition hover:text-white disabled:opacity-40" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {done ? null : (
        <>
          <label className="mt-2.5 block text-[10px] uppercase tracking-wide text-white/45" htmlFor="send-out-to">To</label>
          <div className={`mt-1 flex h-9 items-center gap-1 rounded-lg border bg-black/40 pl-2.5 pr-1 ${
            recipient && (!valid || self) ? 'border-[#FF5C7A]/60' : ready ? 'border-[#82FF68]/40' : 'border-[#2a2a2a] focus-within:border-[#7005FC]'
          }`}>
            <input
              id="send-out-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="0x… Monad address"
              spellCheck={false}
              autoComplete="off"
              disabled={Boolean(busy)}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/30"
            />
            {ready ? <Check className="h-3.5 w-3.5 shrink-0 text-[#82FF68]" /> : null}
            {!to ? (
              <button type="button" onClick={() => void paste()} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-[#DDD7FE] transition hover:bg-white/5 hover:text-white">
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste
              </button>
            ) : null}
          </div>
          {recipient && !valid ? <p className="mt-1 text-[11px] text-[#FF8FA3]">That is not a Monad address.</p> : null}
          {self ? <p className="mt-1 text-[11px] text-[#FF8FA3]">That is this passkey wallet.</p> : null}

          {ready ? (
            <div className="mt-3 space-y-1.5 rounded-lg bg-white/[0.03] p-2.5">
              {planError ? (
                <p className="text-[11px] text-[#FF8FA3]">{planError}</p>
              ) : !plan ? (
                <p className="flex items-center gap-1.5 text-[11px] text-white/45"><Loader2 className="h-3 w-3 animate-spin" /> Reading balances…</p>
              ) : (
                <>
                  <PreviewRow asset="AUSD" value={plan.ausd > 0n ? `${ausdText(plan.ausd)} AUSD` : 'None'} muted={plan.ausd === 0n} />
                  <PreviewRow asset="MON" value={plan.mon > 0n ? `${monText(plan.mon)} MON` : 'None'} muted={plan.mon === 0n} />
                  <p className="border-t border-white/5 pt-1.5 text-[10px] leading-4 text-white/45">
                    Up to {monText(plan.reserve)} MON stays behind for gas. Unused gas remains in this wallet.
                  </p>
                </>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void sendAll()}
            disabled={!ready || !plan || nothing || Boolean(busy)}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#7005FC] px-3 text-xs font-medium text-white transition hover:bg-[#8F3BFF] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            <span className="truncate">{nothing ? 'Nothing to send' : label}</span>
          </button>
          {!busy && ready && plan && !nothing ? (
            <p className="mt-1.5 text-center text-[10px] text-white/45">One passkey prompt approves both sends.</p>
          ) : null}
        </>
      )}

      {steps.length ? (
        <ul className="mt-3 space-y-1.5">
          {steps.map((step) => (
            <li key={step.asset} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-white">
                {step.state === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B781FE]" />
                  : step.state === 'sent' ? <Check className="h-3.5 w-3.5 text-[#82FF68]" />
                    : <X className="h-3.5 w-3.5 text-[#FF5C7A]" />}
                {step.amount}
              </span>
              <span className="flex items-center gap-2">
                <span className={step.state === 'failed' ? 'text-[#FF8FA3]' : step.state === 'sent' ? 'text-[#82FF68]' : 'text-white/45'}>
                  {step.state === 'sending' ? 'Sending' : step.state === 'sent' ? 'Sent' : 'Failed'}
                </span>
                {step.hash ? (
                  <a href={`https://monadvision.com/tx/${step.hash}`} target="_blank" rel="noreferrer" className="text-[#B781FE] hover:text-white" aria-label="View transaction">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {done ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-4 text-[#DDD7FE]">
            {failed ? 'Some funds did not move and are still in this wallet. You can try again.' : `Sent to ${recipient.slice(0, 6)}…${recipient.slice(-4)}.`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {failed ? (
              <button type="button" onClick={() => setSteps([])} className="h-9 rounded-full bg-[#7005FC] text-xs font-medium text-white transition hover:bg-[#8F3BFF]">
                Try again
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={`h-9 rounded-full border border-[#2a2a2a] text-xs text-white transition hover:border-[#7005FC] ${failed ? '' : 'col-span-2'}`}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewRow({ asset, value, muted }: { asset: Asset; value: string; muted: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-1.5 text-[#DDD7FE]">
        <TokenLogo token={asset} size={14} />
        {asset}
      </span>
      <span className={`tabular-nums ${muted ? 'text-white/35' : 'text-white'}`}>{value}</span>
    </div>
  );
}
