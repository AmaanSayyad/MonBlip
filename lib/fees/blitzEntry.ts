import { treasuryAddressFor } from '@/lib/chains/supported';

/** Blitz entry is $0.10, paid in AUSD. */
export const BLITZ_ENTRY_USD = 0.1;

export function blitzPaySymbol(_network?: string | null): string {
  return 'AUSD';
}

export function blitzTokenForUsd(
  _network?: string | null,
  _prices?: Record<string, number>,
): number | null {
  return BLITZ_ENTRY_USD;
}

export function formatBlitzToken(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '0';
  return amount.toFixed(2).replace(/\.?0+$/, '');
}

export function blitzTreasury(_network?: string | null): string {
  return treasuryAddressFor('MONAD');
}
