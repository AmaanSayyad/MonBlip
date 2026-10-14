import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPublicClient, decodeFunctionResult, encodeFunctionData, http } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';

const file = path.join(process.cwd(), '.data', 'cre-closes.json');
const priceUrl = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

const decimalsAbi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export type RoundClose = {
  betId: string | null;
  symbol: string;
  direction: 'UP' | 'DOWN';
  strike: number;
  price: number;
  won: boolean;
  ausdDecimals: number | null;
  chain: string;
  settledBy: 'chainlink-cre';
  runner: 'cre-workflow' | 'desk';
  postedAt: string;
};

type Store = { last: RoundClose | null; history: RoundClose[] };

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Store;
    return { last: parsed.last ?? null, history: Array.isArray(parsed.history) ? parsed.history : [] };
  } catch {
    return { last: null, history: [] };
  }
}

export async function latestClose() {
  return (await readStore()).last;
}

export async function recordClose(close: Omit<RoundClose, 'postedAt'> & { postedAt?: string }) {
  const store = await readStore();
  const next: RoundClose = { ...close, postedAt: close.postedAt || new Date().toISOString() };
  store.last = next;
  store.history = [next, ...store.history].slice(0, 50);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store), { mode: 0o600 });
  return next;
}

/** Same reads the CRE workflow performs: BTC/USD, then AUSD decimals on Monad. */
export async function closeFromFeeds(input: {
  betId?: string | null;
  direction: 'UP' | 'DOWN';
  strike: number;
  symbol?: string;
}) {
  const response = await fetch(priceUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`price feed returned ${response.status}`);
  const body = await response.json() as { price?: string };
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('price feed did not return a BTC price');

  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const data = encodeFunctionData({ abi: decimalsAbi, functionName: 'decimals' });
  const raw = await publicClient.call({ to: MONAD_AUSD, data });
  const decimals = Number(decodeFunctionResult({ abi: decimalsAbi, functionName: 'decimals', data: raw.data || '0x' }));
  const won = input.direction === 'UP' ? price > input.strike : price < input.strike;
  return recordClose({
    betId: input.betId ?? null,
    symbol: input.symbol || 'BTC',
    direction: input.direction,
    strike: input.strike,
    price,
    won,
    ausdDecimals: Number.isFinite(decimals) ? decimals : null,
    chain: 'monad-mainnet',
    settledBy: 'chainlink-cre',
    runner: 'desk',
  });
}
