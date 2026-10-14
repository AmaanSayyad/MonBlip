'use client';

import type { Address } from 'viem';
import { confirmMeraSpend, depositAusd, depositMon, disconnectMera, signMeraMessage } from '@/lib/monad/account';
import {
  depositWithMetaMask,
  disconnectMetaMask,
  metaMaskActive,
  signMetaMaskMessage,
} from '@/lib/monad/injectedWallet';
import type { PlayCurrency } from '@/lib/chains/supported';

export async function signPlayMessage(message: string): Promise<`0x${string}`> {
  if (metaMaskActive()) return signMetaMaskMessage(message);
  await confirmMeraSpend();
  return signMeraMessage(message);
}

export async function sendPlayDeposit(asset: PlayCurrency, amount: number, treasury: Address): Promise<`0x${string}`> {
  if (metaMaskActive()) return depositWithMetaMask(asset, amount, treasury);
  await confirmMeraSpend();
  return asset === 'MON' ? depositMon(amount, treasury) : depositAusd(amount, treasury);
}

export function disconnectPlaySession() {
  disconnectMetaMask();
  disconnectMera();
}
