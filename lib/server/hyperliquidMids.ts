const INFO_URL = 'https://api.hyperliquid.xyz/info';

/** Hyperliquid lists these as the price of 1,000 tokens. */
const THOUSAND_TOKEN: Record<string, string> = {
  PEPE: 'kPEPE',
  SHIB: 'kSHIB',
  BONK: 'kBONK',
};

/** Main-dex perp mids. SPX on this dex is a different token, so it is not listed here. */
const MAIN_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'SUI', 'TRX', 'XRP', 'DOGE', 'ADA', 'BCH', 'BNB', 'XLM', 'NEAR', 'APT',
  'LINK', 'AVAX', 'DOT', 'LTC', 'UNI', 'ATOM', 'RENDER', 'TAO', 'INJ', 'KAS', 'FET', 'FIL', 'AR',
  'STX', 'HBAR', 'ICP', 'OP', 'ARB', 'SNX', 'AAVE', 'ALGO',
] as const;

/** xyz HIP-3 markets whose symbol matches the chart asset. */
const XYZ_SYMBOLS = [
  'AAPL', 'GOOGL', 'AMZN', 'MSFT', 'NVDA', 'TSLA', 'META', 'NFLX', 'AMD', 'BABA', 'COIN', 'MSTR',
  'PLTR', 'INTC', 'TSM', 'GOLD', 'SILVER', 'EUR', 'GBP',
] as const;

type Book = Record<string, number>;

let cached: { at: number; main: Book; xyz: Book } | null = null;
let inflight: Promise<{ main: Book; xyz: Book }> | null = null;

/** Impact bid/ask sits inside the rounded mid, so a quiet mid still prints a new price. */
function quoteFromContext(ctx: { impactPxs?: string[]; midPx?: string; markPx?: string }): number | null {
  const impact = ctx.impactPxs;
  if (Array.isArray(impact) && impact.length >= 2) {
    const bid = Number(impact[0]);
    const ask = Number(impact[1]);
    if (bid > 0 && ask > 0) return (bid + ask) / 2;
  }
  const mid = Number(ctx.midPx);
  if (mid > 0) return mid;
  const mark = Number(ctx.markPx);
  return mark > 0 ? mark : null;
}

async function postQuotes(dex?: string): Promise<Book> {
  const response = await fetch(INFO_URL, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dex ? { type: 'metaAndAssetCtxs', dex } : { type: 'metaAndAssetCtxs' }),
  });
  if (!response.ok) return {};
  const data = await response.json();
  const universe = data?.[0]?.universe;
  const ctxs = data?.[1];
  if (!Array.isArray(universe) || !Array.isArray(ctxs)) return {};
  const out: Book = {};
  for (let i = 0; i < universe.length; i++) {
    const name = universe[i]?.name;
    const price = quoteFromContext(ctxs[i] || {});
    if (typeof name === 'string' && price !== null) out[name] = price;
  }
  return out;
}

async function loadBooks(): Promise<{ main: Book; xyz: Book }> {
  const now = Date.now();
  if (cached && now - cached.at < 400) {
    return cached;
  }
  if (!inflight) {
    inflight = Promise.all([postQuotes(), postQuotes('xyz')])
      .then(([main, xyz]) => {
        cached = { at: Date.now(), main, xyz };
        return { main, xyz };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function read(book: Book, key: string): number | null {
  const value = Number(book[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function fetchHyperliquidMids(assets: string[]): Promise<Partial<Record<string, number>>> {
  const books = await loadBooks();
  const out: Partial<Record<string, number>> = {};

  for (const asset of assets) {
    if ((MAIN_SYMBOLS as readonly string[]).includes(asset)) {
      const price = read(books.main, asset);
      if (price !== null) out[asset] = price;
      continue;
    }
    const thousand = THOUSAND_TOKEN[asset];
    if (thousand) {
      const price = read(books.main, thousand);
      if (price !== null) out[asset] = price / 1000;
      continue;
    }
    if ((XYZ_SYMBOLS as readonly string[]).includes(asset)) {
      const price = read(books.xyz, `xyz:${asset}`);
      if (price !== null) out[asset] = price;
      continue;
    }
    if (asset === 'JPY') {
      // xyz:JPY is already USD/JPY (~158). Inverting it hid every tick on the chart.
      const price = read(books.xyz, 'xyz:JPY');
      if (price !== null) out.JPY = price;
      continue;
    }
    if (asset === 'SPX') {
      const price = read(books.xyz, 'xyz:SP500');
      if (price !== null) out.SPX = price;
      continue;
    }
    if (asset === 'NDX') {
      const price = read(books.xyz, 'xyz:XYZ100');
      if (price !== null) out.NDX = price;
      continue;
    }
    if (asset === 'WTI') {
      // xyz:CL is the WTI crude contract. The cash:WTI book has no live mid.
      const price = read(books.xyz, 'xyz:CL');
      if (price !== null) out.WTI = price;
      continue;
    }
    if (asset === 'BRENT') {
      const price = read(books.xyz, 'xyz:BRENTOIL');
      if (price !== null) out.BRENT = price;
    }
  }

  return out;
}
