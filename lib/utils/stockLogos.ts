/**
 * Stock Logo Utility
 * Provides functions to fetch and generate logo URLs for stocks
 * Uses multiple sources with fallback mechanism
 */

/**
 * Stock symbol to company domain mapping
 */
export const STOCK_DOMAIN_MAP: Record<string, string> = {
  // Individual Stocks
  AAPL: 'apple.com',
  GOOGL: 'abc.xyz',
  AMZN: 'amazon.com',
  MSFT: 'microsoft.com',
  NVDA: 'nvidia.com',
  TSLA: 'tesla.com',
  META: 'meta.com',
  NFLX: 'netflix.com',
  AMD: 'amd.com',
  BABA: 'alibaba.com',
  DIS: 'disney.com',
  JPM: 'jpmorgan.com',
  V: 'visa.com',
  MA: 'mastercard.com',
  PYPL: 'paypal.com',
  COIN: 'coinbase.com',
  MSTR: 'microstrategy.com',
  UBER: 'uber.com',
  PLTR: 'palantir.com',
  CRM: 'salesforce.com',
  INTC: 'intel.com',
  TSM: 'tsmc.com',
  
  // Market Indices
  SPX: 'spglobal.com',           // S&P 500
  NDX: 'nasdaq.com',             // NASDAQ 100
  DJI: 'spglobal.com',           // Dow Jones
  VIX: 'spglobal.com',           // VIX Volatility Index
  DAX: 'deutsche-boerse.com',    // German DAX
  N225: 'nikkei.com',            // Nikkei 225
  HSI: 'hkex.com.hk',            // Hang Seng Index
  FTSE: 'ftserussell.com',       // FTSE 100
  CAC: 'euronext.com',           // CAC 40
};

/**
 * Get stock logo URL from multiple sources with fallback
 * @param symbol Stock symbol (e.g., 'AAPL', 'TSLA')
 * @returns Array of logo URLs to try in order
 */
export function getStockLogoUrls(symbol: string): string[] {
  const urls: string[] = [];

  // 1. Clearbit Logo API (primary source)
  const domain = STOCK_DOMAIN_MAP[symbol];
  if (domain) {
    urls.push(`https://logo.clearbit.com/${domain}`);
  }

  // 2. Try common domain patterns if not in map
  if (!domain) {
    const possibleDomains = [
      `${symbol.toLowerCase()}.com`,
      `${symbol.toLowerCase()}.io`,
      `${symbol.toLowerCase()}.co`,
    ];
    
    possibleDomains.forEach(domain => {
      urls.push(`https://logo.clearbit.com/${domain}`);
    });
  }

  // 3. Google Favicon service as fallback
  const googleDomain = domain || `${symbol.toLowerCase()}.com`;
  urls.push(`https://www.google.com/s2/favicons?domain=${googleDomain}&sz=128`);

  // 4. Local logo path as last resort
  urls.push(`/logos/${symbol.toLowerCase()}.png`);

  return urls;
}

/**
 * Check if a URL is accessible (not broken)
 * @param url URL to check
 * @returns Promise resolving to true if URL is accessible
 */
export async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    return true; // If no error thrown, assume accessible
  } catch {
    return false;
  }
}

/**
 * Get the best available logo URL for a stock
 * Tries multiple sources and returns the first working one
 * @param symbol Stock symbol
 * @returns Promise resolving to working logo URL or null
 */
export async function getBestLogoUrl(symbol: string): Promise<string | null> {
  const urls = getStockLogoUrls(symbol);
  
  for (const url of urls) {
    const accessible = await isUrlAccessible(url);
    if (accessible) {
      return url;
    }
  }
  
  return null;
}
