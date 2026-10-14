import type { AssetType } from '@/lib/utils/priceFeed';

export type AssetCategory = 'Crypto' | 'Metals' | 'Forex' | 'Stocks' | 'Commodities';

export type AssetInfo = { name: string; symbol: string; pair: string; logo: string; category: AssetCategory; decimals: number };

export const ASSET_CATEGORIES = ['All', 'Crypto', 'Metals', 'Forex', 'Stocks', 'Commodities'] as const;

export const ASSET_CONFIG: Record<AssetType, AssetInfo> = {
  BTC: { name: 'Bitcoin', symbol: 'BTC', pair: 'BTC/USD', logo: '/logos/bitcoin-btc-logo.png', category: 'Crypto', decimals: 2 },
  ETH: { name: 'Ethereum', symbol: 'ETH', pair: 'ETH/USD', logo: '/logos/ethereum-eth-logo.png', category: 'Crypto', decimals: 2 },
  SOL: { name: 'Solana', symbol: 'SOL', pair: 'SOL/USD', logo: '/logos/solana-sol-logo.png', category: 'Crypto', decimals: 2 },
  SUI: { name: 'Sui', symbol: 'SUI', pair: 'SUI/USD', logo: '/logos/sui-logo.png', category: 'Crypto', decimals: 3 },
  TRX: { name: 'Tron', symbol: 'TRX', pair: 'TRX/USD', logo: '/logos/tron-trx-logo.png', category: 'Crypto', decimals: 4 },
  XRP: { name: 'Ripple', symbol: 'XRP', pair: 'XRP/USD', logo: '/logos/xrp-xrp-logo.png', category: 'Crypto', decimals: 4 },
  DOGE: { name: 'Dogecoin', symbol: 'DOGE', pair: 'DOGE/USD', logo: '/logos/dogecoin-doge-logo.png', category: 'Crypto', decimals: 5 },
  ADA: { name: 'Cardano', symbol: 'ADA', pair: 'ADA/USD', logo: '/logos/cardano-ada-logo.png', category: 'Crypto', decimals: 4 },
  BCH: { name: 'Bitcoin Cash', symbol: 'BCH', pair: 'BCH/USD', logo: '/logos/bitcoin-cash-bch-logo.png', category: 'Crypto', decimals: 2 },
  BNB: { name: 'Binance Coin', symbol: 'BNB', pair: 'BNB/USD', logo: '/logos/bnb-bnb-logo.png', category: 'Crypto', decimals: 2 },
  XLM: { name: 'Stellar', symbol: 'XLM', pair: 'XLM/USD', logo: '/logos/stellar-xlm-logo.png', category: 'Crypto', decimals: 4 },
  XTZ: { name: 'Tezos', symbol: 'XTZ', pair: 'XTZ/USD', logo: '/logos/tezos-xtz-logo.png', category: 'Crypto', decimals: 3 },
  NEAR: { name: 'Near Protocol', symbol: 'NEAR', pair: 'NEAR/USD', logo: '/logos/near.png', category: 'Crypto', decimals: 3 },
  APT: { name: 'Aptos', symbol: 'APT', pair: 'APT/USD', logo: '/logos/aptos-logo.png', category: 'Crypto', decimals: 2 },
  
  // Metals
  GOLD: { name: 'Gold', symbol: 'GOLD', pair: 'XAU/USD', logo: '/logos/gold.jpg', category: 'Metals', decimals: 2 },
  SILVER: { name: 'Silver', symbol: 'SILVER', pair: 'XAG/USD', logo: '/logos/silver.avif', category: 'Metals', decimals: 3 },
  
  // Forex
  EUR: { name: 'Euro', symbol: 'EUR', pair: 'EUR/USD', logo: '/logos/euro.png', category: 'Forex', decimals: 4 },
  GBP: { name: 'British Pound', symbol: 'GBP', pair: 'GBP/USD', logo: '/logos/uk.png', category: 'Forex', decimals: 4 },
  JPY: { name: 'Japanese Yen', symbol: 'JPY', pair: 'USD/JPY', logo: '/logos/japan.jpg', category: 'Forex', decimals: 3 },
  AUD: { name: 'Australian Dollar', symbol: 'AUD', pair: 'AUD/USD', logo: '/logos/australia.png', category: 'Forex', decimals: 4 },
  CAD: { name: 'Canadian Dollar', symbol: 'CAD', pair: 'USD/CAD', logo: '/logos/canada.png', category: 'Forex', decimals: 4 },
  
  // Stocks
  AAPL: { name: 'Apple Inc.', symbol: 'AAPL', pair: 'AAPL/USD', logo: '/logos/stock-AAPL-logo.png', category: 'Stocks', decimals: 2 },
  GOOGL: { name: 'Alphabet Inc.', symbol: 'GOOGL', pair: 'GOOGL/USD', logo: '/logos/stock-GOOGL-logo.png', category: 'Stocks', decimals: 2 },
  AMZN: { name: 'Amazon.com', symbol: 'AMZN', pair: 'AMZN/USD', logo: '/logos/stock-AMZN-logo.png', category: 'Stocks', decimals: 2 },
  MSFT: { name: 'Microsoft', symbol: 'MSFT', pair: 'MSFT/USD', logo: '/logos/stock-MSFT-logo.png', category: 'Stocks', decimals: 2 },
  NVDA: { name: 'NVIDIA', symbol: 'NVDA', pair: 'NVDA/USD', logo: '/logos/stock-NVDA-logo.png', category: 'Stocks', decimals: 2 },
  TSLA: { name: 'Tesla Inc.', symbol: 'TSLA', pair: 'TSLA/USD', logo: '/logos/stock-TSLA-logo.png', category: 'Stocks', decimals: 2 },
  META: { name: 'Meta Platforms', symbol: 'META', pair: 'META/USD', logo: '/logos/stock-META-logo.png', category: 'Stocks', decimals: 2 },
  NFLX: { name: 'Netflix', symbol: 'NFLX', pair: 'NFLX/USD', logo: '/logos/stock-NFLX-logo.png', category: 'Stocks', decimals: 2 },
  AMD: { name: 'AMD', symbol: 'AMD', pair: 'AMD/USD', logo: '/logos/stock-AMD-logo.png', category: 'Stocks', decimals: 2 },
  BABA: { name: 'Alibaba', symbol: 'BABA', pair: 'BABA/USD', logo: '/logos/stock-BABA-logo.png', category: 'Stocks', decimals: 2 },
  DIS: { name: 'Walt Disney', symbol: 'DIS', pair: 'DIS/USD', logo: '/logos/stock-DIS-logo.png', category: 'Stocks', decimals: 2 },
  JPM: { name: 'JP Morgan', symbol: 'JPM', pair: 'JPM/USD', logo: '/logos/stock-JPM-logo.png', category: 'Stocks', decimals: 2 },
  V: { name: 'Visa Inc.', symbol: 'V', pair: 'V/USD', logo: '/logos/stock-V-logo.png', category: 'Stocks', decimals: 2 },
  MA: { name: 'Mastercard', symbol: 'MA', pair: 'MA/USD', logo: '/logos/stock-MA-logo.png', category: 'Stocks', decimals: 2 },
  PYPL: { name: 'PayPal', symbol: 'PYPL', pair: 'PYPL/USD', logo: '/logos/stock-PYPL-logo.png', category: 'Stocks', decimals: 2 },
  COIN: { name: 'Coinbase', symbol: 'COIN', pair: 'COIN/USD', logo: '/logos/stock-COIN-logo.png', category: 'Stocks', decimals: 2 },
  MSTR: { name: 'MicroStrategy', symbol: 'MSTR', pair: 'MSTR/USD', logo: '/logos/stock-MSTR-logo.png', category: 'Stocks', decimals: 2 },
  UBER: { name: 'Uber Tech', symbol: 'UBER', pair: 'UBER/USD', logo: '/logos/stock-UBER-logo.png', category: 'Stocks', decimals: 2 },
  PLTR: { name: 'Palantir', symbol: 'PLTR', pair: 'PLTR/USD', logo: '/logos/stock-PLTR-logo.png', category: 'Stocks', decimals: 2 },
  CRM: { name: 'Salesforce', symbol: 'CRM', pair: 'CRM/USD', logo: '/logos/stock-CRM-logo.png', category: 'Stocks', decimals: 2 },
  INTC: { name: 'Intel', symbol: 'INTC', pair: 'INTC/USD', logo: '/logos/stock-INTC-logo.png', category: 'Stocks', decimals: 2 },
  TSM: { name: 'TSMC', symbol: 'TSM', pair: 'TSM/USD', logo: '/logos/stock-TSM-logo.png', category: 'Stocks', decimals: 2 },
  SPX: { name: 'S&P 500', symbol: 'SPX', pair: 'SPX/USD', logo: '/logos/stock-SPX-logo.png', category: 'Stocks', decimals: 2 },
  NDX: { name: 'Nasdaq 100', symbol: 'NDX', pair: 'NDX/USD', logo: '/logos/stock-NDX-logo.png', category: 'Stocks', decimals: 2 },
  DJI: { name: 'Dow Jones', symbol: 'DJI', pair: 'DJI/USD', logo: '/logos/stock-DJI-logo.png', category: 'Stocks', decimals: 2 },
  
  // Custom
  // Added Assets — all using local files, no external CDN dependencies
  LINK: { name: 'Chainlink', symbol: 'LINK', pair: 'LINK/USD', logo: '/logos/chainlink-link-logo.png', category: 'Crypto', decimals: 3 },
  AVAX: { name: 'Avalanche', symbol: 'AVAX', pair: 'AVAX/USD', logo: '/logos/avalanche-avax-logo.png', category: 'Crypto', decimals: 2 },
  DOT: { name: 'Polkadot', symbol: 'DOT', pair: 'DOT/USD', logo: '/logos/polkadot-dot-logo.png', category: 'Crypto', decimals: 2 },
  LTC: { name: 'Litecoin', symbol: 'LTC', pair: 'LTC/USD', logo: '/logos/litecoin-ltc-logo.png', category: 'Crypto', decimals: 2 },
  UNI: { name: 'Uniswap', symbol: 'UNI', pair: 'UNI/USD', logo: '/logos/uniswap-uni-logo.png', category: 'Crypto', decimals: 2 },
  PEPE: { name: 'Pepe', symbol: 'PEPE', pair: 'PEPE/USD', logo: '/logos/pepe-logo.png', category: 'Crypto', decimals: 8 },
  SHIB: { name: 'Shiba Inu', symbol: 'SHIB', pair: 'SHIB/USD', logo: '/logos/shiba-inu-shib-logo.png', category: 'Crypto', decimals: 8 },
  ATOM: { name: 'Cosmos', symbol: 'ATOM', pair: 'ATOM/USD', logo: '/logos/cosmos-atom-logo.png', category: 'Crypto', decimals: 2 },
  RENDER: { name: 'Render', symbol: 'RENDER', pair: 'RENDER/USD', logo: '/logos/render-rndr-logo.png', category: 'Crypto', decimals: 2 },
  TAO: { name: 'Bittensor', symbol: 'TAO', pair: 'TAO/USD', logo: '/logos/bittensor-tao-logo.png', category: 'Crypto', decimals: 2 },
  INJ: { name: 'Injective', symbol: 'INJ', pair: 'INJ/USD', logo: '/logos/injective-inj-logo.png', category: 'Crypto', decimals: 2 },
  KAS: { name: 'Kaspa', symbol: 'KAS', pair: 'KAS/USD', logo: '/logos/kaspa-kas-logo.png', category: 'Crypto', decimals: 4 },
  FET: { name: 'Fetch.ai', symbol: 'FET', pair: 'FET/USD', logo: '/logos/artificial-superintelligence-alliance-fet-logo.png', category: 'Crypto', decimals: 3 },
  FIL: { name: 'Filecoin', symbol: 'FIL', pair: 'FIL/USD', logo: '/logos/filecoin-fil-logo.png', category: 'Crypto', decimals: 2 },
  AR: { name: 'Arweave', symbol: 'AR', pair: 'AR/USD', logo: '/logos/arweave-ar-logo.png', category: 'Crypto', decimals: 2 },
  STX: { name: 'Stacks', symbol: 'STX', pair: 'STX/USD', logo: '/logos/stacks-stx-logo.png', category: 'Crypto', decimals: 2 },
  HBAR: { name: 'Hedera', symbol: 'HBAR', pair: 'HBAR/USD', logo: '/logos/hedera-hbar-logo.png', category: 'Crypto', decimals: 4 },
  ICP: { name: 'Internet Computer', symbol: 'ICP', pair: 'ICP/USD', logo: '/logos/internet-computer-icp-logo.png', category: 'Crypto', decimals: 2 },
  VET: { name: 'VeChain', symbol: 'VET', pair: 'VET/USD', logo: '/logos/vechain-vet-logo.png', category: 'Crypto', decimals: 4 },
  OP: { name: 'Optimism', symbol: 'OP', pair: 'OP/USD', logo: '/logos/optimism-ethereum-op-logo.png', category: 'Crypto', decimals: 3 },
  BONK: { name: 'Bonk', symbol: 'BONK', pair: 'BONK/USD', logo: '/logos/bonk-logo.png', category: 'Crypto', decimals: 8 },
  ARB: { name: 'Arbitrum', symbol: 'ARB', pair: 'ARB/USD', logo: '/logos/arbitrum-arb-logo.png', category: 'Crypto', decimals: 3 },
  SNX: { name: 'Synthetix', symbol: 'SNX', pair: 'SNX/USD', logo: '/logos/synthetix-snx-logo.png', category: 'Crypto', decimals: 2 },
  AAVE: { name: 'Aave', symbol: 'AAVE', pair: 'AAVE/USD', logo: '/logos/aave-logo.png', category: 'Crypto', decimals: 2 },
  GRT: { name: 'The Graph', symbol: 'GRT', pair: 'GRT/USD', logo: '/logos/the-graph-grt-logo.png', category: 'Crypto', decimals: 4 },
  THETA: { name: 'Theta Network', symbol: 'THETA', pair: 'THETA/USD', logo: '/logos/theta-network-theta-logo.png', category: 'Crypto', decimals: 3 },
  ALGO: { name: 'Algorand', symbol: 'ALGO', pair: 'ALGO/USD', logo: '/logos/algorand-algo-logo.png', category: 'Crypto', decimals: 4 },
  EGLD: { name: 'MultiversX', symbol: 'EGLD', pair: 'EGLD/USD', logo: '/logos/multiversx-egld-egld-logo.png', category: 'Crypto', decimals: 2 },
  FLOW: { name: 'Flow', symbol: 'FLOW', pair: 'FLOW/USD', logo: '/logos/flow-logo.png', category: 'Crypto', decimals: 3 },
  
  // Commodities
  WTI: { name: 'Crude Oil WTI', symbol: 'WTI', pair: 'WTI/USD', logo: '/logos/oil.svg', category: 'Commodities', decimals: 2 },
  BRENT: { name: 'Crude Oil Brent', symbol: 'BRENT', pair: 'BRENT/USD', logo: '/logos/oil.svg', category: 'Commodities', decimals: 2 },
};

export function searchAssets(query: string, category: (typeof ASSET_CATEGORIES)[number] = 'All'): AssetType[] {
  const q = query.trim().toLowerCase();
  return (Object.keys(ASSET_CONFIG) as AssetType[]).filter((id) => {
    const asset = ASSET_CONFIG[id];
    const matches = !q || asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q) || asset.pair.toLowerCase().includes(q);
    return matches && (category === 'All' || asset.category === category);
  });
}
