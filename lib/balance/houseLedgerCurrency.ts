/**
 * Single source for which `user_balances.currency` row to use for house ledger
 * (fetch, bet, deposit, withdraw). Keeps client paths aligned with Supabase.
 */

export function resolveHouseLedgerCurrency(params?: {
  network?: string;
  selectedCurrency?: string | null;
  userAddress?: string | null;
}): string {
  return String(params?.selectedCurrency ?? '').trim().toUpperCase() === 'MON' ? 'MON' : 'AUSD';
}
