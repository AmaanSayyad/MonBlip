export type AuroraToken = {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price: number | null;
  /** Token contract or mint on its own chain. Absent for the chain's native coin. */
  contract?: string | null;
};

type ChainInfo = {
  name: string;
  logo?: string;
  refund: RegExp;
  placeholder: string;
  evm?: boolean;
};

const EVM = /^0x[a-fA-F0-9]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MOVE = /^0x[a-fA-F0-9]{1,64}$/;
const NEAR_ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

function evm(name: string, logo?: string): ChainInfo {
  return { name, logo, refund: EVM, placeholder: '0x…', evm: true };
}

export const CHAINS: Record<string, ChainInfo> = {
  eth: evm('Ethereum', '/logos/ticker/eth.svg'),
  base: evm('Base', '/logos/chains/base.png'),
  arb: evm('Arbitrum', '/logos/chains/arbitrum.png'),
  op: evm('Optimism'),
  bsc: evm('BNB Chain', '/logos/ticker/bnb.svg'),
  pol: evm('Polygon'),
  avax: evm('Avalanche'),
  gnosis: evm('Gnosis'),
  scroll: evm('Scroll'),
  bera: evm('Berachain'),
  monad: evm('Monad', '/logos/chains/monad.svg'),
  xlayer: evm('X Layer'),
  abs: evm('Abstract'),
  plasma: evm('Plasma'),
  hood: evm('Robinhood Chain'),
  adi: evm('ADI Chain'),
  hypercore: evm('HyperCore'),
  near: { name: 'NEAR', logo: '/logos/ticker/near.svg', refund: NEAR_ACCOUNT, placeholder: 'name.near' },
  sol: { name: 'Solana', logo: '/logos/chains/solana.png', refund: BASE58, placeholder: 'Solana address' },
  fogo: { name: 'Fogo', refund: BASE58, placeholder: 'Fogo address' },
  btc: { name: 'Bitcoin', logo: '/logos/ticker/btc.svg', refund: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i, placeholder: 'bc1… or 1… / 3…' },
  tron: { name: 'Tron', logo: '/logos/ticker/trx.svg', refund: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, placeholder: 'T…' },
  ton: { name: 'TON', refund: /^([EU]Q[A-Za-z0-9_-]{46}|-?\d:[a-fA-F0-9]{64})$/, placeholder: 'UQ… or EQ…' },
  sui: { name: 'Sui', logo: '/logos/ticker/sui.svg', refund: /^0x[a-fA-F0-9]{64}$/, placeholder: '0x… (64 hex)' },
  aptos: { name: 'Aptos', refund: MOVE, placeholder: '0x…' },
  movement: { name: 'Movement', refund: MOVE, placeholder: '0x…' },
  starknet: { name: 'Starknet', refund: MOVE, placeholder: '0x…' },
  xrp: { name: 'XRP Ledger', logo: '/logos/ticker/xrp.svg', refund: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, placeholder: 'r…' },
  stellar: { name: 'Stellar', logo: '/logos/ticker/xlm.svg', refund: /^G[A-Z2-7]{55}$/, placeholder: 'G…' },
  doge: { name: 'Dogecoin', logo: '/logos/ticker/doge.svg', refund: /^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/, placeholder: 'D…' },
  ltc: { name: 'Litecoin', refund: /^(ltc1[02-9ac-hj-np-z]{11,71}|[LM3][1-9A-HJ-NP-Za-km-z]{26,33})$/i, placeholder: 'ltc1… or L…' },
  bch: { name: 'Bitcoin Cash', refund: /^((bitcoincash:)?[qp][02-9ac-hj-np-z]{41}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i, placeholder: 'bitcoincash:q…' },
  dash: { name: 'Dash', refund: /^X[1-9A-HJ-NP-Za-km-z]{33}$/, placeholder: 'X…' },
  zec: { name: 'Zcash', refund: /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/, placeholder: 't1… (transparent)' },
  cardano: { name: 'Cardano', logo: '/logos/ticker/ada.svg', refund: /^addr1[02-9ac-hj-np-z]{50,}$/, placeholder: 'addr1…' },
  aleo: { name: 'Aleo', refund: /^aleo1[02-9ac-hj-np-z]{58}$/, placeholder: 'aleo1…' },
};

export function chainInfo(blockchain: string): ChainInfo {
  return CHAINS[blockchain] ?? { name: blockchain.toUpperCase(), refund: /^\S{10,}$/, placeholder: 'Refund address' };
}

export function isValidRefund(blockchain: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (blockchain === 'near' && /^[a-f0-9]{64}$/.test(trimmed)) return true;
  return chainInfo(blockchain).refund.test(trimmed);
}

const SYMBOL_LOGOS: Record<string, string> = {
  ETH: 'eth', WETH: 'eth', BTC: 'btc', WBTC: 'btc', CBBTC: 'btc', XBTC: 'btc',
  USDC: 'usdc', USDT: 'usdt', USDT0: 'usdt', SOL: 'sol', BNB: 'bnb', NEAR: 'near', WNEAR: 'near',
  DOGE: 'doge', ADA: 'ada', XRP: 'xrp', XLM: 'xlm', TRX: 'trx', SUI: 'sui',
};

export function tokenLogo(symbol: string) {
  const file = SYMBOL_LOGOS[symbol.toUpperCase()];
  return file ? `/logos/ticker/${file}.svg` : symbol.toUpperCase() === 'MON' ? '/logos/chains/monad.svg' : null;
}

export function displaySymbol(token: Pick<AuroraToken, 'symbol' | 'blockchain'>) {
  return token.blockchain === 'near' && token.symbol === 'wNEAR' ? 'NEAR' : token.symbol;
}

/** Aurora delivers MON on Monad, so MON there is the destination and never an origin. */
export function isOriginToken(token: AuroraToken) {
  if (/deprecated|^test/i.test(token.symbol)) return false;
  return !(token.blockchain === 'monad' && token.symbol === 'MON');
}

const SYMBOL_RANK = ['ETH', 'BTC', 'USDC', 'USDT', 'SOL', 'BNB', 'NEAR', 'wNEAR', 'USDT0', 'XRP', 'DOGE', 'TRX', 'SUI', 'ADA', 'AVAX', 'POL', 'ARB', 'OP', 'TON', 'XLM', 'LTC', 'APT', 'ZEC', 'WBTC', 'cbBTC', 'DAI', 'WETH'];
const CHAIN_RANK = ['eth', 'btc', 'sol', 'base', 'arb', 'bsc', 'near', 'op', 'pol', 'avax', 'tron', 'ton', 'sui', 'xrp', 'monad'];

function rank(list: string[], value: string) {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
}

export function sortTokens(tokens: AuroraToken[]) {
  return tokens.slice().sort((a, b) =>
    rank(SYMBOL_RANK, a.symbol) - rank(SYMBOL_RANK, b.symbol)
    || rank(CHAIN_RANK, a.blockchain) - rank(CHAIN_RANK, b.blockchain)
    || a.symbol.localeCompare(b.symbol));
}

export function chainsOf(tokens: AuroraToken[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token.blockchain, (counts.get(token.blockchain) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => rank(CHAIN_RANK, a[0]) - rank(CHAIN_RANK, b[0]) || b[1] - a[1])
    .map(([id, count]) => ({ id, count, ...chainInfo(id) }));
}

export function searchTokens(tokens: AuroraToken[], query: string, chain: string | null) {
  const needle = query.trim().toLowerCase();
  return tokens.filter((token) => {
    if (chain && token.blockchain !== chain) return false;
    if (!needle) return true;
    const name = chainInfo(token.blockchain).name.toLowerCase();
    return token.symbol.toLowerCase().includes(needle)
      || displaySymbol(token).toLowerCase().includes(needle)
      || name.includes(needle)
      || token.blockchain.includes(needle);
  });
}

function nice(value: number, decimals: number, up: boolean) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const step = 10 ** (Math.floor(Math.log10(value)) - 1);
  const digits = Math.min(decimals, Math.max(0, -Math.floor(Math.log10(step))));
  const units = up ? Math.ceil(value / step - 0.05) : Math.round(value / step);
  const rounded = (units * step).toFixed(digits);
  return rounded.includes('.') ? rounded.replace(/\.?0+$/, '') : rounded;
}

const CURATED: Record<string, { start: string; floor: string }> = {
  'nep141:eth.omft.near': { start: '0.005', floor: '0.0001' },
  'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near': { start: '5', floor: '0.5' },
  'nep141:wrap.near': { start: '1', floor: '0.1' },
};

/** Bitcoin-style chains carry higher network fees, so Aurora's solvers skip small amounts there. */
const UTXO_CHAINS = new Set(['btc', 'ltc', 'bch', 'doge', 'dash', 'zec']);

/** Dollar targets priced from Aurora's list: $5 and a $0.50 floor, or $25 and $10 on Bitcoin-style chains. */
export function suggestedAmounts(token: AuroraToken): { start: string; floor: string | null } {
  const curated = CURATED[token.assetId];
  if (curated) return curated;
  if (!token.price) return { start: '', floor: null };
  const [startUsd, floorUsd] = UTXO_CHAINS.has(token.blockchain) ? [25, 10] : [5, 0.5];
  return {
    start: nice(startUsd / token.price, token.decimals, false) ?? '',
    floor: nice(floorUsd / token.price, token.decimals, true),
  };
}

export const FALLBACK_TOKENS: AuroraToken[] = [
  { assetId: 'nep141:eth.omft.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: null, contract: null },
  { assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', symbol: 'USDT', blockchain: 'eth', decimals: 6, price: null, contract: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  { assetId: 'nep141:wrap.near', symbol: 'wNEAR', blockchain: 'near', decimals: 24, price: null },
];

export const QUICK_PICKS: Array<{ blockchain: string; symbol: string }> = [
  { blockchain: 'eth', symbol: 'ETH' },
  { blockchain: 'eth', symbol: 'USDT' },
  { blockchain: 'btc', symbol: 'BTC' },
  { blockchain: 'sol', symbol: 'SOL' },
  { blockchain: 'base', symbol: 'USDC' },
  { blockchain: 'near', symbol: 'wNEAR' },
];
