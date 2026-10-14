import { fetchPythLatestPrices } from '@/lib/server/pythLatest';

/** Amounts at or under this USD value pay immediately. Anything above waits for review. */
export const AUTO_WITHDRAW_USD = 10;

const STABLE_USD: Record<string, number> = {
  USDC: 1,
  USDC_BASE: 1,
  OUSD: 1,
  AUSD: 1,
};

/** Pyth Crypto.MON/USD. A missing quote must not hold every Monad payout. */
const MON_USD_FEED = '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1';

/** House-ledger currency to the chart asset that prices it. */
const PRICE_ASSET: Record<string, string> = {
  ROBINHOOD: 'ETH',
  ARB: 'ETH',
  SOL: 'SOL',
  BNB: 'BNB',
  SUI: 'SUI',
  XLM: 'XLM',
  XTZ: 'XTZ',
  NEAR: 'NEAR',
  STRK: 'STRK',
  APT: 'APT',
  INIT: 'INIT',
};

export function exceedsAutoWithdrawUsd(
  currency: string,
  amount: number,
  prices: Partial<Record<string, number>>,
): boolean {
  const stable = STABLE_USD[currency];
  const price = stable ?? prices[PRICE_ASSET[currency] || ''];
  if (!(typeof price === 'number' && price > 0)) return true;
  return amount * price > AUTO_WITHDRAW_USD;
}

async function fetchMonUsd(): Promise<number | null> {
  try {
    const response = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${MON_USD_FEED}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const price = data?.parsed?.[0]?.price;
    const value = Number(price?.price) * 10 ** Number(price?.expo);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function withdrawalExceedsTenUsd(currency: string, amount: number): Promise<boolean> {
  if (currency === 'MON') {
    const price = await fetchMonUsd();
    return amount * (price ?? 1) > AUTO_WITHDRAW_USD;
  }
  if (STABLE_USD[currency]) return exceedsAutoWithdrawUsd(currency, amount, {});
  const asset = PRICE_ASSET[currency];
  if (!asset) return true;
  try {
    const prices = await fetchPythLatestPrices([asset]);
    return exceedsAutoWithdrawUsd(currency, amount, prices);
  } catch {
    return true;
  }
}
