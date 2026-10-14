const TICKERS_URL = 'https://api.bybit.com/v5/market/tickers?category=linear';

/**
 * Perps whose last trade moves when the rounded Hyperliquid mid sits still.
 * Prices are the same instrument the chart shows (XAU, USD/JPY, the stock).
 */
const BYBIT_SYMBOL: Record<string, string> = {
  GOLD: 'XAUUSDT',
  SILVER: 'XAGUSDT',
  EUR: 'EURUSDUSDT',
  GBP: 'GBPUSDUSDT',
  JPY: 'USDJPYUSDT',
  AAPL: 'AAPLUSDT',
  GOOGL: 'GOOGLUSDT',
  AMZN: 'AMZNUSDT',
  MSFT: 'MSFTUSDT',
  NVDA: 'NVDAUSDT',
  TSLA: 'TSLAUSDT',
  META: 'METAUSDT',
  NFLX: 'NFLXUSDT',
  BABA: 'BABAUSDT',
  JPM: 'JPMUSDT',
  V: 'VUSDT',
  MA: 'MAUSDT',
  PYPL: 'PYPLUSDT',
  COIN: 'COINUSDT',
  MSTR: 'MSTRUSDT',
  UBER: 'UBERUSDT',
  PLTR: 'PLTRUSDT',
  CRM: 'CRMUSDT',
  INTC: 'INTCUSDT',
  TSM: 'TSMUSDT',
};

/** Day-move lookup only. These are not used as the quote. */
const DAY_SYMBOL: Record<string, string> = {
  ...BYBIT_SYMBOL,
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  BNB: 'BNBUSDT',
  XRP: 'XRPUSDT',
  DOGE: 'DOGEUSDT',
  ADA: 'ADAUSDT',
  SUI: 'SUIUSDT',
  NEAR: 'NEARUSDT',
  XLM: 'XLMUSDT',
  TRX: 'TRXUSDT',
};

/** Bid/ask size shifts the price inside the spread, so a quiet last trade still draws a line. */
function microPrice(row: { lastPrice?: string; bid1Price?: string; ask1Price?: string; bid1Size?: string; ask1Size?: string }): number | null {
  const bid = Number(row.bid1Price);
  const ask = Number(row.ask1Price);
  const bidSize = Number(row.bid1Size);
  const askSize = Number(row.ask1Size);
  if (bid > 0 && ask > 0 && bidSize + askSize > 0) {
    return (bid * askSize + ask * bidSize) / (bidSize + askSize);
  }
  const last = Number(row.lastPrice);
  return last > 0 ? last : null;
}

let cached: { at: number; prices: Record<string, number>; changes: Record<string, number> } | null = null;
let inflight: Promise<{ prices: Record<string, number>; changes: Record<string, number> }> | null = null;

async function loadLastPrices(): Promise<{ prices: Record<string, number>; changes: Record<string, number> }> {
  const now = Date.now();
  if (cached && now - cached.at < 400) return cached;
  if (!inflight) {
    inflight = fetch(TICKERS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }).then(async (response) => {
      if (!response.ok) return cached || { prices: {}, changes: {} };
      const data = await response.json() as {
        result?: { list?: { symbol?: string; lastPrice?: string; bid1Price?: string; ask1Price?: string; bid1Size?: string; ask1Size?: string; price24hPcnt?: string }[] };
      };
      const bySymbol = new Map<string, { price: number; change: number | null }>();
      for (const row of data.result?.list || []) {
        const price = microPrice(row);
        if (!row.symbol || price == null || price <= 0) continue;
        const change = Number(row.price24hPcnt);
        bySymbol.set(row.symbol, { price, change: Number.isFinite(change) ? change : null });
      }
      const prices: Record<string, number> = {};
      const changes: Record<string, number> = {};
      for (const [asset, symbol] of Object.entries(DAY_SYMBOL)) {
        const row = bySymbol.get(symbol);
        if (!row) continue;
        if (BYBIT_SYMBOL[asset]) prices[asset] = row.price;
        if (row.change != null) changes[asset] = row.change;
      }
      cached = { at: Date.now(), prices, changes };
      return cached;
    }).catch(() => cached || { prices: {}, changes: {} }).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function fetchBybitQuotes(assets: string[]): Promise<Partial<Record<string, number>>> {
  const wanted = assets.filter((asset) => BYBIT_SYMBOL[asset]);
  if (wanted.length === 0) return {};
  const book = await loadLastPrices();
  const out: Partial<Record<string, number>> = {};
  for (const asset of wanted) {
    if (book.prices[asset] > 0) out[asset] = book.prices[asset];
  }
  return out;
}

/** Signed 24h move, as a fraction. 0.012 is +1.2%. */
export async function fetchBybitDayChanges(assets: string[]): Promise<Partial<Record<string, number>>> {
  const wanted = assets.filter((asset) => DAY_SYMBOL[asset]);
  if (wanted.length === 0) return {};
  const book = await loadLastPrices();
  const out: Partial<Record<string, number>> = {};
  for (const asset of wanted) {
    const change = book.changes[asset];
    if (typeof change === 'number') out[asset] = change;
  }
  return out;
}
