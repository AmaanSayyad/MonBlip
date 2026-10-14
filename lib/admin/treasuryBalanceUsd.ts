/**
 * Approximate USD valuation for treasury EOAs (Pyth Hermes + CoinGecko fallbacks).
 * Not financial advice — for ops visibility only.
 */

import { fetchPythLatestPrices } from '@/lib/server/pythLatest';

const PYTH_SYMBOLS = ['BNB', 'SOL', 'SUI', 'XLM', 'XTZ', 'NEAR', 'ETH'] as const;
type PythSym = (typeof PYTH_SYMBOLS)[number];

export async function fetchPythUsdPartial(): Promise<Partial<Record<PythSym, number>>> {
  const prices = await fetchPythLatestPrices([...PYTH_SYMBOLS]);
  const out: Partial<Record<PythSym, number>> = {};
  for (const sym of PYTH_SYMBOLS) {
    const px = Number(prices[sym]);
    if (Number.isFinite(px) && px > 0) out[sym] = px;
  }
  return out;
}

/** CoinGecko `simple/price` ids → usd */
export async function fetchCoingeckoTreasuryUsd(): Promise<Record<string, number>> {
  const ids = ['starknet', 'initia', 'zero-gravity'].join(',');
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
    );
    if (!r.ok) return {};
    const j = (await r.json()) as Record<string, { usd?: number }>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v?.usd === 'number' && Number.isFinite(v.usd)) out[k] = v.usd;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * USD per 1 unit of the on-chain asset (null if unknown).
 */
export function usdPerUnit(
  chain: string,
  asset: string,
  pyth: Partial<Record<PythSym, number>>,
  cg: Record<string, number>,
): number | null {
  if (asset === 'USDC') return 1;

  if (chain === 'BNB' && asset === 'BNB') return pyth.BNB ?? null;
  if (chain === 'SOL' && asset === 'SOL') return pyth.SOL ?? null;
  if (chain === 'SUI' && asset === 'SUI') return pyth.SUI ?? null;
  if (chain === 'SUI' && asset === 'USDC') return 1;
  if (chain === 'XLM' && asset === 'XLM') return pyth.XLM ?? null;
  if (chain === 'XTZ' && asset === 'XTZ') return pyth.XTZ ?? null;
  if (chain === 'NEAR' && asset === 'NEAR') return pyth.NEAR ?? null;

  if (chain === 'STRK' && asset === 'STRK') return cg.starknet ?? null;
  if (chain === 'INIT' && asset === 'INIT') return cg.initia ?? null;
  if (chain === '0G' && asset === '0G') return cg['zero-gravity'] ?? null;

  // EVM L2 / testnet gas tokens without dedicated feeds — rough ETH proxy
  if (chain === 'PUSH' && asset === 'native') return pyth.ETH ?? null;
  if (chain === 'STT') return pyth.ETH ?? null;

  if (chain === 'OCT' && asset === 'OCT') return null;

  return null;
}

export function formatUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n > 0 && n < 0.01) return '<$0.01';
  if (n >= 1e9) return `$${n.toExponential(2)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function balanceTimesUsd(balance: number | null, unitUsd: number | null): number | null {
  if (balance === null || !Number.isFinite(balance) || unitUsd === null || !Number.isFinite(unitUsd)) return null;
  return balance * unitUsd;
}
