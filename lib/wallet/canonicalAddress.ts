/**
 * Canonical `user_address` / `wallet_address` for house ledger tables
 * (`user_balances`, `balance_audit_log`, `bet_history`, `user_sessions`, etc.).
 *
 * - EVM `0x…` hex: lowercase (matches on-chain equality; avoids checksum splits).
 * - Other chains (Solana base58, etc.): trimmed only — preserves case.
 */

export function canonicalHouseUserAddress(address: string): string {
  const t = address.trim();
  if (t.startsWith('0x')) return t.toLowerCase();
  // NEAR implicit account IDs are 64 hex chars; chain convention is lowercase.
  if (/^[0-9a-fA-F]{64}$/.test(t)) return t.toLowerCase();
  return t;
}
