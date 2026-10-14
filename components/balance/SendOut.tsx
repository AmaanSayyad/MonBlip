'use client';

import { useState } from 'react';
import { createPublicClient, erc20Abi, formatEther, formatUnits, http, isAddress, type Address } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { confirmMeraSpend, meraAddress, meraWalletClient } from '@/lib/monad/account';
import { useOverflowStore } from '@/lib/store';
import { useToast } from '@/lib/hooks/useToast';

const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
// Smart-account recipients (EIP-7702 delegated) need more than 21,000 to receive MON.
const MON_GAS = 21_000n;
const AUSD_GAS = 80_000n;

/** Moves every AUSD and all MON except the gas for this send out of the passkey wallet. */
export function SendOut() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Array<{ label: string; hash: string }>>([]);

  const valid = isAddress(to.trim());

  async function sendAll() {
    const from = meraAddress();
    if (!from || !valid) return;
    const recipient = to.trim() as Address;
    const done: Array<{ label: string; hash: string }> = [];
    try {
      setBusy('Confirm with your passkey…');
      await confirmMeraSpend();
      const wallet = meraWalletClient();

      const ausd = await publicClient.readContract({ address: MONAD_AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [from] });
      if (ausd > 0n) {
        setBusy(`Sending ${formatUnits(ausd, 6)} AUSD…`);
        const hash = await wallet.writeContract({
          address: MONAD_AUSD,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient, ausd],
          gas: AUSD_GAS,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        done.push({ label: `${formatUnits(ausd, 6)} AUSD`, hash });
      }

      const fees = await publicClient.estimateFeesPerGas();
      const maxFeePerGas = fees.maxFeePerGas * 2n;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
      const estimate = await publicClient.estimateGas({ account: from, to: recipient, value: 1n });
      const gas = estimate > MON_GAS ? (estimate * 12n) / 10n : MON_GAS;
      const mon = await publicClient.getBalance({ address: from });
      const value = mon - maxFeePerGas * gas;
      if (value > 0n) {
        setBusy(`Sending ${Number(formatEther(value)).toFixed(4)} MON…`);
        const hash = await wallet.sendTransaction({ to: recipient, value, gas, maxFeePerGas, maxPriorityFeePerGas });
        await publicClient.waitForTransactionReceipt({ hash });
        done.push({ label: `${Number(formatEther(value)).toFixed(4)} MON`, hash });
      }

      setSent(done);
      toast.success(done.length ? `Sent ${done.map((row) => row.label).join(' and ')}.` : 'Nothing to send.');
    } catch (error) {
      setSent(done);
      toast.error(error instanceof Error ? error.message : 'Send failed');
    } finally {
      setBusy(null);
      void useOverflowStore.getState().refreshWalletBalance();
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[11px] text-white/45 underline-offset-2 transition hover:text-white hover:underline">
        Send out
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[#2a2a2a] bg-black/30 p-2.5">
      <p className="text-[11px] leading-4 text-[#DDD7FE]">Send all AUSD and MON in this passkey wallet to another Monad address. A little MON stays behind for gas.</p>
      <input
        value={to}
        onChange={(event) => setTo(event.target.value)}
        placeholder="0x… Monad address"
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#0b0b0b] px-2.5 font-mono text-[11px] text-white outline-none focus:border-[#7005FC]"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void sendAll()}
          disabled={!valid || Boolean(busy)}
          className="h-9 rounded-full bg-[#7005FC] text-xs font-medium text-white transition hover:bg-[#8F3BFF] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ?? 'Send all'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={Boolean(busy)}
          className="h-9 rounded-full border border-[#2a2a2a] text-xs text-white transition hover:border-[#7005FC] disabled:opacity-40"
        >
          Close
        </button>
      </div>
      {sent.map((row) => (
        <a key={row.hash} href={`https://monadvision.com/tx/${row.hash}`} target="_blank" rel="noreferrer" className="block text-[11px] text-[#B781FE] hover:text-white">
          {row.label} sent · view transaction
        </a>
      ))}
    </div>
  );
}
