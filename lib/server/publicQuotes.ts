const BINANCE_SYMBOL: Record<string, string> = {
  TRX: 'TRXUSDT',
  XTZ: 'XTZUSDT',
  VET: 'VETUSDT',
  GRT: 'GRTUSDT',
  THETA: 'THETAUSDT',
  EGLD: 'EGLDUSDT',
  FLOW: 'FLOWUSDT',
};

/** CAD is labeled USD/CAD, so this is Canadian dollars per US dollar. */
const YAHOO_SYMBOL: Record<string, string> = {
  AUD: 'AUDUSD=X',
  CAD: 'USDCAD=X',
  DJI: '^DJI',
  DIS: 'DIS',
  JPM: 'JPM',
  V: 'V',
  MA: 'MA',
  PYPL: 'PYPL',
  UBER: 'UBER',
  CRM: 'CRM',
};

let cached: { at: number; prices: Record<string, number> } | null = null;
let inflight: Promise<Record<string, number>> | null = null;

async function binancePrices(assets: string[]): Promise<Record<string, number>> {
  const symbols = assets.map((asset) => BINANCE_SYMBOL[asset]).filter(Boolean);
  if (symbols.length === 0) return {};
  const query = encodeURIComponent(JSON.stringify(symbols));
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${query}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return {};
  const rows = await response.json() as { symbol?: string; price?: string }[];
  const bySymbol = new Map(rows.map((row) => [row.symbol, Number(row.price)]));
  const out: Record<string, number> = {};
  for (const asset of assets) {
    const price = bySymbol.get(BINANCE_SYMBOL[asset]);
    if (price && price > 0) out[asset] = price;
  }
  return out;
}

const YAHOO_DAY: Record<string, string> = {
  AMD: 'AMD',
  SPY: 'SPY',
};

/** Signed day move versus the previous close, as a fraction. */
export async function fetchYahooDayChanges(assets: string[]): Promise<Partial<Record<string, number>>> {
  const wanted = assets.filter((asset) => YAHOO_DAY[asset]);
  const rows = await Promise.all(wanted.map(async (asset) => {
    const symbol = YAHOO_DAY[asset];
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        {
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        },
      );
      if (!response.ok) return null;
      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      const previous = Number(meta?.chartPreviousClose ?? meta?.previousClose);
      if (!(price > 0) || !(previous > 0)) return null;
      return [asset, (price - previous) / previous] as const;
    } catch {
      return null;
    }
  }));
  const out: Partial<Record<string, number>> = {};
  for (const row of rows) {
    if (row) out[row[0]] = row[1];
  }
  return out;
}

async function yahooPrice(asset: string): Promise<number | null> {
  const symbol = YAHOO_SYMBOL[asset];
  if (!symbol) return null;
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function loadQuotes(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cached && now - cached.at < 1_000) return cached.prices;
  if (!inflight) {
    const yahooAssets = Object.keys(YAHOO_SYMBOL);
    inflight = Promise.all([
      binancePrices(Object.keys(BINANCE_SYMBOL)),
      ...yahooAssets.map(async (asset) => {
        const price = await yahooPrice(asset);
        return price ? { [asset]: price } : {};
      }),
    ]).then((parts) => {
      const prices = Object.assign({}, ...parts) as Record<string, number>;
      cached = { at: Date.now(), prices };
      return prices;
    }).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function fetchPublicQuotes(assets: string[]): Promise<Partial<Record<string, number>>> {
  const wanted = assets.filter((asset) => BINANCE_SYMBOL[asset] || YAHOO_SYMBOL[asset]);
  if (wanted.length === 0) return {};
  const book = await loadQuotes();
  const out: Partial<Record<string, number>> = {};
  for (const asset of wanted) {
    if (book[asset] > 0) out[asset] = book[asset];
  }
  return out;
}

/** Spot books that tick outside the Pyth publish interval. Yahoo stays separate so a closed cash quote cannot cover a live perp. */
export async function fetchBinanceQuotes(assets: string[]): Promise<Partial<Record<string, number>>> {
  const wanted = assets.filter((asset) => BINANCE_SYMBOL[asset]);
  if (wanted.length === 0) return {};
  const book = await loadQuotes();
  const out: Partial<Record<string, number>> = {};
  for (const asset of wanted) {
    if (book[asset] > 0) out[asset] = book[asset];
  }
  return out;
}
