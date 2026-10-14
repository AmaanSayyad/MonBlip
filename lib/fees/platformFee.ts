/**
 * Platform / protocol fee collector helpers.
 *
 * Business rule:
 * - Charge the wallet's tier rate on every deposit and every withdrawal.
 * - Free 1%, Standard 0.9%, VIP 0.8%.
 * - Transfer the fee from the Monad treasury to a dedicated collector wallet.
 */

export type UserTier = 'free' | 'standard' | 'vip';

/** Default rate for a wallet with no tier yet. */
export const PLATFORM_FEE_PERCENT = 0.01;

export const FEE_PERCENT_BY_TIER: Record<UserTier, number> = {
  free: 0.01,
  standard: 0.009,
  vip: 0.008,
};

const DEFAULT_FEE_PERCENT = PLATFORM_FEE_PERCENT;

export function normalizeTier(tier?: string | null): UserTier {
  if (tier === 'standard' || tier === 'vip') return tier;
  return 'free';
}

export function getFeePercent(tier?: string | null): number {
  return FEE_PERCENT_BY_TIER[normalizeTier(tier)];
}

export function getFeePercentLabel(tier?: string | null): string {
  const percent = getFeePercent(tier) * 100;
  return `${Number(percent.toFixed(2))}%`;
}

export function calculateFeeAmount(amount: number, tier?: string | null): number {
  const fee = amount * getFeePercent(tier);
  return Math.floor(fee * 1e8) / 1e8;
}

function getEnvOptional(key: string): string | null {
  const val = process.env[key];
  return val && val.trim() ? val.trim() : null;
}

export function getPlatformFeeWalletAddress(normalizedCurrency: string): string | null {
  const code = normalizedCurrency.toUpperCase();
  if (code !== 'AUSD' && code !== 'MON') return null;
  return getEnvOptional('NEXT_PUBLIC_PLATFORM_FEE_WALLET_EVM');
}

export async function collectPlatformFeeFromTreasury(
  normalizedCurrency: string,
  feeAmount: number,
): Promise<string | null> {
  if (!feeAmount || feeAmount <= 0) return null;
  const feeWallet = getPlatformFeeWalletAddress(normalizedCurrency);
  if (!feeWallet) return null;
  const { transferFromEvmTreasury } = await import('@/lib/chains/evmTreasury');
  const { playCurrency } = await import('@/lib/chains/supported');
  return transferFromEvmTreasury('MONAD', feeWallet, feeAmount, playCurrency(normalizedCurrency));
}

export { DEFAULT_FEE_PERCENT };
