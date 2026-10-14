'use client';

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { line, curveMonotoneX } from 'd3-shape';
import { useStore } from '@/lib/store';
import { readStored, writeStored } from '@/lib/brand/browserStore';
import { AssetType } from '@/lib/utils/priceFeed';
import { motion, AnimatePresence } from 'framer-motion';
import { playWinSound, playLoseSound } from '@/lib/utils/sounds';
import { useToast } from '@/lib/hooks/useToast';

interface LiveChartProps {
  betAmount: string;
  setBetAmount: (amount: string) => void;
}

interface ResolvedCell {
  id: string;
  row: number;
  won: boolean;
  timestamp: number;
}

// Track which cells have active bets
interface CellBet {
  cellId: string;
  betId: string;
  amount: number;
  multiplier: number;
  direction: 'UP' | 'DOWN';
}

// Component to safely display asset logos with fallback
const ASSET_CONFIG: Record<AssetType, { name: string; symbol: string; pair: string; logo: string; category: 'Crypto' | 'Metals' | 'Forex' | 'Stocks' | 'Commodities'; decimals: number }> = {
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


// Logos ship with the app. Remote logo hosts are slow and were blocking the mark.
const AssetIcon = React.memo(function AssetIcon({
  src,
  asset,
  className = 'h-full w-full object-contain',
}: {
  src: string;
  asset: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src, asset]);

  if (failed || !src) {
    return (
      <span className="flex h-full w-full items-center justify-center text-[11px] font-medium text-[#DDD7FE]">
        {asset.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
});

export const LiveChart: React.FC<LiveChartProps> = ({ betAmount, setBetAmount }) => {
  const priceHistory = useStore((state) => state.priceHistory);
  const currentPrice = useStore((state) => state.currentPrice);
  const selectedAsset = useStore((state) => state.selectedAsset);
  const toast = useToast();
  const userTier = useStore((state) => state.userTier);
  const setSelectedAsset = useStore((state) => state.setSelectedAsset);
  const placeBetFromHouseBalance = useStore((state) => state.placeBetFromHouseBalance);
  const activeBets = useStore((state) => state.activeBets);
  const resolveBet = useStore((state) => state.resolveBet);
  const fetchBalance = useStore((state) => state.fetchBalance);
  const userAddress = useStore((state) => state.address);
  const houseBalance = useStore((state) => state.houseBalance);

  const gameMode = useStore((state) => state.gameMode);
  const timeframeSeconds = useStore((state) => state.timeframeSeconds);
  const isBlitzActive = useStore((state) => state.isBlitzActive);
  const hasBlitzAccess = useStore((state) => state.hasBlitzAccess);
  const blitzMultiplier = useStore((state) => state.blitzMultiplier);
  const lastResult = useStore((state) => state.lastResult);
  const network = useStore((state) => state.network);
  const selectedCurrency = useStore((state) => state.selectedCurrency);

  const containerRef = useRef<HTMLDivElement>(null);
  const gridShiftRef = useRef<HTMLDivElement>(null);
  const linePathsRef = useRef<Array<SVGPathElement | null>>([]);
  const tipRef = useRef<SVGCircleElement>(null);
  const priceLineRef = useRef<SVGLineElement>(null);
  const gridMotionRef = useRef({ pps: 0, tipX: 0, anchor: 0 });
  const lineMotionRef = useRef<{
    pps: number;
    tipX: number;
    price: number;
    points: { timestamp: number; price: number }[];
    yAt: (price: number) => number;
  }>({ pps: 0, tipX: 0, price: 0, points: [], yAt: () => 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  const assetSelectorRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Loading state for price feed
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);

  // Track resolved (past) cells
  const [resolvedCells, setResolvedCells] = useState<ResolvedCell[]>([]);
  const resolvedDrawBetIdsRef = useRef<Set<string>>(new Set());

  // Local state for tracking cell bets
  const [cellBets, setCellBets] = useState<Map<string, CellBet>>(new Map());

  // --- Draw mode state ---
  // Drag geometry lives in a ref and is painted on the preview node.
  // setState on every move re-rendered this whole chart and the box lagged behind the cursor.
  const drawPreviewRef = useRef<HTMLDivElement>(null);
  const drawDragRef = useRef<{
    drawing: boolean;
    start: { x: number; y: number } | null;
    current: { x: number; y: number } | null;
  }>({ drawing: false, start: null, current: null });
  const drawBoxRef = useRef<DOMRect | null>(null);

  interface PendingDrawBox {
    x: number;
    y: number;
    width: number;
    height: number;
    priceTop: number;
    priceBottom: number;
    durationSeconds: number;
    multiplier: number;
    startTime: number;
  }
  const [pendingBox, setPendingBox] = useState<PendingDrawBox | null>(null);

  // Warning state for insufficient funds
  const [showInsufficientFunds, setShowInsufficientFunds] = useState(false);

  // Asset search and category filtering
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [watchlist, setWatchlist] = useState<AssetType[]>([]);
  const [activeAssetCategory, setActiveAssetCategory] = useState<'All' | 'Crypto' | 'Metals' | 'Forex' | 'Stocks' | 'Commodities'>('All');

  // Bet results for visual feedback
  interface BetResult {
    id: string;
    won: boolean;
    amount: number;
    payout: number;
    multiplier: number;
    timestamp: number;
    x: number;
    y: number;
  }
  const [betResults, setBetResults] = useState<BetResult[]>([]);
  
  const activeIndicators = useStore((state) => state.activeIndicators);
  const isIndicatorsOpen = useStore((state) => state.isIndicatorsOpen);
  const setIsIndicatorsOpen = useStore((state) => state.setIsIndicatorsOpen);
  const toggleIndicator = useStore((state) => state.toggleIndicator);

  const currencySymbol = useMemo(() => {

    switch (network) {
      case 'ROBINHOOD':
      case 'ARB': return 'ETH';
      case 'BASE': return 'USDC';
      case 'TEMPO': return 'OUSD';
      case 'SOL': return 'SOL';
      case 'XTZ': return 'XTZ';
      case 'NEAR': return 'NEAR';
      case 'XLM': return 'XLM';
      case 'SUI': return selectedCurrency === 'USDC' ? 'USDC' : 'SUI';
      case 'STRK': return 'STRK';
      case 'PUSH': return 'PC';
      case 'SOMNIA': return 'STT';
      case 'OCT': return 'OCT';
      case 'ZG': return '0G';
      case 'INIT': return 'INIT';
      case 'APT': return 'APT';
      case 'BNB': return 'BNB';
      case 'MONAD': return selectedCurrency === 'MON' ? 'MON' : 'AUSD';
      default: return 'ETH';
    }
  }, [network, selectedCurrency]);

  const currentAssetConfig = ASSET_CONFIG[selectedAsset] || ASSET_CONFIG.BTC;
  const quoteDecimals = currentAssetConfig.category === 'Crypto'
    ? currentAssetConfig.decimals
    : Math.max(currentAssetConfig.decimals, 7);

  // Filtered assets based on search and category
  const filteredAssets = useMemo(() => {
    return (Object.keys(ASSET_CONFIG) as AssetType[]).filter(assetId => {
      const asset = ASSET_CONFIG[assetId];
      const matchesSearch = asset.name.toLowerCase().includes(assetSearchQuery.toLowerCase()) ||
        asset.symbol.toLowerCase().includes(assetSearchQuery.toLowerCase()) ||
        asset.pair.toLowerCase().includes(assetSearchQuery.toLowerCase());

      const matchesCategory = activeAssetCategory === 'All' || asset.category === activeAssetCategory;

      return matchesSearch && matchesCategory;
    });
  }, [assetSearchQuery, activeAssetCategory]);


  // Stable Y-Axis Domain
  const yDomain = useRef({ min: 0, max: 100, initialized: false, lastSpan: 0 });

  // Reset Y-axis domain when asset changes
  useEffect(() => {
    yDomain.current = { min: 0, max: 100, initialized: false, lastSpan: 0 };
    setResolvedCells([]); // Clear resolved cells
    setBetResults([]); // Clear bet results
    setCellBets(new Map()); // Clear cell bets
    setIsLoadingPrice(true); // Show loading when switching assets
  }, [selectedAsset]);

  // Box mode: map active bets onto grid cells so crossing / settlement runs (cellBets was never filled after placement).
  useEffect(() => {
    if (gameMode !== 'box') {
      setCellBets(new Map());
      return;
    }
    const next = new Map<string, CellBet>();
    for (const bet of activeBets as Array<{
      mode: string;
      status: string;
      cellId?: string;
      id: string;
      amount: number;
      multiplier: number;
      direction: 'UP' | 'DOWN';
      asset: AssetType;
    }>) {
      if (
        bet.mode === 'box' &&
        bet.status === 'active' &&
        bet.cellId &&
        bet.asset === selectedAsset
      ) {
        next.set(bet.cellId, {
          cellId: bet.cellId,
          betId: bet.id,
          amount: bet.amount,
          multiplier: bet.multiplier,
          direction: bet.direction,
        });
      }
    }
    setCellBets(next);
  }, [activeBets, gameMode, selectedAsset]);

  // Persisted watchlist for quick switching.
  useEffect(() => {
    try {
      const raw = readStored('monblip.watchlist', ['bynomo_watchlist_assets']);
      if (raw) {
        const parsed = JSON.parse(raw) as AssetType[];
        if (Array.isArray(parsed)) {
          const valid = new Set(Object.keys(ASSET_CONFIG) as AssetType[]);
          setWatchlist(parsed.filter((a): a is AssetType => valid.has(a)));
        }
      }
    } catch (e) {
      console.error('Failed to load watchlist', e);
    }
  }, []);

  useEffect(() => {
    try {
      writeStored('monblip.watchlist', JSON.stringify(watchlist));
    } catch (e) {
      console.error('Failed to save watchlist', e);
    }
  }, [watchlist]);

  const toggleWatchlist = (asset: AssetType) => {
    setWatchlist((prev) => prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset]);
  };

  // Remove settled cards after the fade finishes. The fade itself is CSS, so it
  // does not wait on chart re-renders.
  const resultTimersRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    betResults.forEach((result) => {
      if (resultTimersRef.current.has(result.id)) return;
      const timer = window.setTimeout(() => {
        resultTimersRef.current.delete(result.id);
        setBetResults((prev) => prev.filter((item) => item.id !== result.id));
      }, 2600);
      resultTimersRef.current.set(result.id, timer);
    });
  }, [betResults]);
  useEffect(() => {
    const timers = resultTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Hide loading when price data arrives
  useEffect(() => {
    if (currentPrice > 0 && priceHistory.length >= 2) {
      setIsLoadingPrice(false);
    }
  }, [currentPrice, priceHistory]);

  // Update dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Reset Y-axis domain when asset changes to avoid getting stuck at old price levels
  useEffect(() => {
    yDomain.current.initialized = false;
  }, [selectedAsset]);

  // Move the line by rewriting its points. Translating a stale path left a
  // flat segment across the chart whenever React was behind the clock.
  useEffect(() => {
    let frame = 0;
    let timer = 0;
    const generator = line<{ timestamp: number; price: number }>()
      .curve(curveMonotoneX);
    const paint = () => {
      const grid = gridMotionRef.current;
      const motion = lineMotionRef.current;
      const nowMs = Date.now();
      if (grid.pps > 0) {
        const layer = gridShiftRef.current;
        if (layer) {
          const gridShift = grid.tipX + ((grid.anchor - nowMs) / 1000) * grid.pps;
          layer.style.transform = `translate3d(${gridShift}px,0,0)`;
        }
      }
      if (motion.pps > 0 && motion.price > 0 && motion.points.length > 0) {
        const minT = nowMs - ((motion.tipX + 120) / motion.pps) * 1000;
        const visible: { timestamp: number; price: number }[] = [];
        for (const point of motion.points) {
          if (point.timestamp >= minT && point.timestamp <= nowMs && point.price > 0) visible.push(point);
        }
        visible.push({ timestamp: nowMs, price: motion.price });
        if (visible.length >= 2) {
          generator
            .x((point) => motion.tipX + ((point.timestamp - nowMs) / 1000) * motion.pps)
            .y((point) => motion.yAt(point.price));
          const path = generator(visible);
          if (path) {
            for (const node of linePathsRef.current) node?.setAttribute('d', path);
          }
        }
        const y = motion.yAt(motion.price);
        const tip = tipRef.current;
        if (tip) {
          tip.setAttribute('cx', String(motion.tipX));
          tip.setAttribute('cy', String(y));
        }
        const guide = priceLineRef.current;
        if (guide) {
          guide.setAttribute('y1', String(y));
          guide.setAttribute('y2', String(y));
          guide.setAttribute('x2', String(Math.max(0, motion.tipX - 10)));
        }
      }
    };
    const loop = () => {
      if (!document.hidden) paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  // Configuration - Responsive + Timeframe
  const isMobile = dimensions.width < 640;
  const historyWidthRatio = isMobile ? 0.62 : 0.74;
  const targetColWidthPx = isMobile ? 100 : 250;
  const gridInterval = ((gameMode === 'box' || gameMode === 'draw') ? timeframeSeconds : 30) * 1000; // ms per column
  const pixelsPerSecond = (gameMode === 'box' || gameMode === 'draw')
    ? Math.max(2, targetColWidthPx / (gridInterval / 1000))
    : Math.max(4, (Math.max(dimensions.width, 320) * historyWidthRatio) / 48);
  const numRows = 12; // Standardize for all assets to ensure consistent box size

  // Scales
  const scales = useMemo(() => {
    if (dimensions.width === 0 || currentPrice === 0) return null;

    // Fit the axis to prices visible on the chart, then leave room above and below
    // so the line shows the real move and stays inside the screen.
    const tipX = dimensions.width * historyWidthRatio;
    const historyMs = ((tipX + 120) / Math.max(pixelsPerSecond, 0.001)) * 1000;
    const minTimestamp = now - historyMs;
    let dataMin = currentPrice;
    let dataMax = currentPrice;
    for (const point of priceHistory) {
      if (point.timestamp < minTimestamp) continue;
      if (!Number.isFinite(point.price) || point.price <= 0) continue;
      if (point.price < dataMin) dataMin = point.price;
      if (point.price > dataMax) dataMax = point.price;
    }

    const observed = dataMax - dataMin;
    const span = observed > 0 ? observed : Math.max(currentPrice * 1e-8, 1e-8);
    yDomain.current.lastSpan = span;

    // Pad keeps the stroke off the frame. The domain is the full on-screen range,
    // so a new high or low pulls the axis in on the same frame.
    const pad = span * 0.12;
    const mid = observed > 0 ? (dataMin + dataMax) / 2 : currentPrice;
    yDomain.current.min = mid - span / 2 - pad;
    yDomain.current.max = mid + span / 2 + pad;
    yDomain.current.initialized = true;

    const { min: minY, max: maxY } = yDomain.current;

    const yScale = (price: number) => {
      return dimensions.height - ((price - minY) / (maxY - minY)) * dimensions.height;
    };

    const xScale = (timestamp: number) => {
      const diffMs = timestamp - now;
      const diffSeconds = diffMs / 1000;
      return tipX + (diffSeconds * pixelsPerSecond);
    };

    return { yScale, xScale, tipX, minY, maxY };
  }, [dimensions, priceHistory, currentPrice, now, historyWidthRatio, pixelsPerSecond, selectedAsset]);

  const columnAnchor = gridInterval > 0 ? Math.floor(now / gridInterval) * gridInterval : now;
  const scaleMinY = scales?.minY ?? 0;
  const scaleMaxY = scales?.maxY ?? 0;
  const scaleTipX = scales?.tipX ?? 0;
  gridMotionRef.current = { pps: pixelsPerSecond, tipX: scaleTipX, anchor: columnAnchor };
  lineMotionRef.current = {
    pps: pixelsPerSecond,
    tipX: scaleTipX,
    price: currentPrice,
    points: priceHistory,
    yAt: scales ? scales.yScale : () => 0,
  };

  const scalesRef = useRef(scales);
  const currentPriceRef = useRef(currentPrice);

  useEffect(() => {
    scalesRef.current = scales;
    currentPriceRef.current = currentPrice;
  }, [scales, currentPrice]);



  // --- Draw mode helpers ---
  const paintDrawPreview = () => {
    const el = drawPreviewRef.current;
    if (!el) return;
    const { drawing, start, current } = drawDragRef.current;
    if (!drawing || !start || !current) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    el.style.left = `${Math.min(start.x, current.x)}px`;
    el.style.top = `${Math.min(start.y, current.y)}px`;
    el.style.width = `${Math.abs(current.x - start.x)}px`;
    el.style.height = `${Math.abs(current.y - start.y)}px`;
  };

  const getRelativePos = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = drawBoxRef.current ?? containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDrawPointerDown = (e: React.PointerEvent) => {
    if (gameMode !== 'draw' || !scales || e.button !== 0) return;
    drawBoxRef.current = containerRef.current?.getBoundingClientRect() ?? null;
    const pos = getRelativePos(e);
    // Require drawing to start on/after the current price tip.
    if (pos.x <= scales.tipX) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setPendingBox(null);
    drawDragRef.current = { drawing: true, start: pos, current: pos };
    paintDrawPreview();
    e.preventDefault();
  };

  const handleDrawPointerMove = (e: React.PointerEvent) => {
    if (gameMode !== 'draw' || !scales) return;
    const drag = drawDragRef.current;
    if (!drag.drawing || !drag.start) return;

    const pos = getRelativePos(e);

    const maxW = pixelsPerSecond * 20;
    const maxH = dimensions.height * 0.20;

    const clampedX = Math.max(scales.tipX + 2, Math.min(pos.x, drag.start.x + maxW));
    const clampedY = Math.max(drag.start.y - maxH, Math.min(pos.y, drag.start.y + maxH));
    drag.current = { x: clampedX, y: clampedY };
    paintDrawPreview();
  };

  const clearDrawDrag = () => {
    drawDragRef.current = { drawing: false, start: null, current: null };
    drawBoxRef.current = null;
    paintDrawPreview();
  };

  const finalizeDrawBox = () => {
    const { start: drawStart, current: drawCurrent } = drawDragRef.current;
    if (!drawStart || !drawCurrent || !scales || dimensions.height === 0) {
      clearDrawDrag();
      return;
    }

    const minX = Math.min(drawStart.x, drawCurrent.x);
    const maxX = Math.max(drawStart.x, drawCurrent.x);
    const minY = Math.min(drawStart.y, drawCurrent.y);
    const maxY = Math.max(drawStart.y, drawCurrent.y);

    const minBoxHeightPx = 2;
    const maxBoxHeightPx = dimensions.height * 0.20;
    const minBoxWidthPx = pixelsPerSecond * 0.3;
    const maxBoxWidthPx = pixelsPerSecond * 20;

    if (maxX - minX < minBoxWidthPx || maxY - minY < minBoxHeightPx) {
      clearDrawDrag();
      return;
    }

    const constrainedHeight = Math.min(maxY - minY, maxBoxHeightPx);
    const constrainedWidth = Math.min(maxX - minX, maxBoxWidthPx);

    const priceRange = scales.maxY - scales.minY;
    const priceTop = scales.minY + (1 - minY / dimensions.height) * priceRange;
    const priceBottom =
      scales.minY + (1 - (minY + constrainedHeight) / dimensions.height) * priceRange;

    const startOffsetSeconds = (minX - scales.tipX) / pixelsPerSecond;
    const durationSeconds = constrainedWidth / pixelsPerSecond;
    const startTime = Date.now() + startOffsetSeconds * 1000;

    const sizeRatio = constrainedHeight / dimensions.height;
    const priceInsideBox =
      currentPriceRef.current >= priceBottom && currentPriceRef.current <= priceTop;

    let multiplier: number;
    if (priceInsideBox) {
      multiplier = 1.01;
    } else {
      const distFromEdge = Math.min(
        Math.abs(currentPriceRef.current - priceTop),
        Math.abs(currentPriceRef.current - priceBottom)
      );
      const distNormalized = Math.min(distFromEdge / Math.max(priceRange, 0.0001), 1);
      const distFactor = Math.pow(distNormalized, 0.7) * 6;
      const sizeFactor = Math.min(1 / Math.max(sizeRatio * 15, 0.5), 2);
      const durationBonus = Math.min(durationSeconds / 60, 1) * 0.3;
      const rawMult = (1 + distFactor) * sizeFactor + durationBonus;
      multiplier = Math.max(1.02, Math.min(rawMult, 15));
    }

    clearDrawDrag();
    setPendingBox({
      x: minX,
      y: minY,
      width: constrainedWidth,
      height: constrainedHeight,
      priceTop,
      priceBottom,
      durationSeconds,
      multiplier,
      startTime,
    });
  };

  const handleDrawPointerUp = () => {
    if (drawDragRef.current.drawing) finalizeDrawBox();
  };

  const handlePlaceDrawBet = async () => {
    if (!pendingBox || !userAddress || !betAmount) return;
    const requiredAmount = parseFloat(betAmount);
    if (isNaN(requiredAmount) || requiredAmount <= 0) return;

    const currentBalance = houseBalance || 0;
    if (currentBalance < requiredAmount) {
      setShowInsufficientFunds(true);
      setTimeout(() => setShowInsufficientFunds(false), 2000);
      setPendingBox(null);
      return;
    }

    const endTime = pendingBox.startTime + Math.round(pendingBox.durationSeconds) * 1000;
    const targetId = `UP-${pendingBox.multiplier}-${Math.round(pendingBox.durationSeconds)}`;

    try {
      await placeBetFromHouseBalance(
        betAmount,
        targetId,
        userAddress,
        undefined,
        {
          priceTop: pendingBox.priceTop,
          priceBottom: pendingBox.priceBottom,
          startTime: pendingBox.startTime,
          endTime,
        }
      );
    } catch (error) {
      console.error('Failed to place draw bet:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to place bet');
    } finally {
      setPendingBox(null);
    }
  };

  // Handle classic (binomo) mode bet results at the graph tip
  const lastProcessedResultRef = useRef<number>(0);
  useEffect(() => {
    if (lastResult && gameMode === 'binomo' && scales && lastResult.timestamp > lastProcessedResultRef.current) {
      lastProcessedResultRef.current = lastResult.timestamp;

      const multiplier = lastResult.amount > 0 ? lastResult.payout / lastResult.amount : 0;

      const result: BetResult = {
        id: `classic-${lastResult.timestamp}`,
        won: lastResult.won,
        amount: lastResult.amount,
        payout: lastResult.payout,
        multiplier: Number(multiplier.toFixed(2)),
        timestamp: Date.now(),
        x: scales.tipX,
        y: scales.yScale(currentPrice)
      };

      setBetResults(prev => [...prev, result]);

      // Play sound effects
      if (lastResult.won) {
        playWinSound();
      } else {
        playLoseSound();
      }
    }
  }, [lastResult, gameMode, scales, currentPrice, playWinSound, playLoseSound]);

  const chartPath = useMemo(() => {
    // Don't render if no scales or no price data yet
    if (!scales || currentPrice <= 0) return '';

    const pixelsPerSec = pixelsPerSecond;
    const thresholdMs = ((-120 - scales.tipX) / pixelsPerSec) * 1000;
    const minTimestamp = now + thresholdMs;
    const maxTimestamp = now + ((10 / pixelsPerSec) * 1000);

    // Filter points that are actually visible on screen to speed up rendering
    // Optimized: Calculate timestamp thresholds once instead of calling xScale for every point
    const visiblePoints = priceHistory.filter((p: any) => {
      return p.timestamp > minTimestamp && p.timestamp <= now + 1000; // Buffer for tip
    });


    // Ensure we have at least history or current point
    const pointsToRender = [...visiblePoints];
    
    // Always include current live point
    if (currentPrice > 0) {
      pointsToRender.push({ timestamp: now, price: currentPrice });
    }

    // Need at least 2 points for a line
    if (pointsToRender.length < 2) return '';

    try {
      const lineGenerator = line<{ timestamp: number, price: number }>()
        .x((d) => scales.xScale(d.timestamp))
        .y((d) => scales.yScale(d.price))
        .curve(curveMonotoneX);

      return lineGenerator(pointsToRender) || '';
    } catch (err) {
      console.error("Chart line generation error:", err);
      return '';
    }
  }, [scales, priceHistory, currentPrice, now]);


  // TECHNICAL INDICATORS CALCULATION
  const indicatorPaths = useMemo(() => {
    if (!scales) return null;

    const paths: Record<string, any> = {};
    const points = [...priceHistory, { timestamp: now, price: currentPrice }]
      .filter((point) => Number.isFinite(point.price) && point.price > 0);

    const priceLine = line<{ timestamp: number; price: number }>()
      .x((d) => scales.xScale(d.timestamp))
      .y((d) => scales.yScale(d.price))
      .curve(curveMonotoneX);

    const simpleAverage = (period: number) => {
      const series: { timestamp: number; price: number }[] = [];
      if (points.length < period) return series;
      let sum = 0;
      for (let i = 0; i < points.length; i++) {
        sum += points[i].price;
        if (i >= period) sum -= points[i - period].price;
        if (i >= period - 1) series.push({ timestamp: points[i].timestamp, price: sum / period });
      }
      return series;
    };

    // Smoothed moving average. The first value is the simple average of `period` prices.
    const smoothedAverage = (period: number) => {
      const series: { index: number; timestamp: number; price: number }[] = [];
      if (points.length < period) return series;
      let sum = 0;
      for (let i = 0; i < period; i++) sum += points[i].price;
      let previous = sum / period;
      series.push({ index: period - 1, timestamp: points[period - 1].timestamp, price: previous });
      for (let i = period; i < points.length; i++) {
        previous = (previous * (period - 1) + points[i].price) / period;
        series.push({ index: i, timestamp: points[i].timestamp, price: previous });
      }
      return series;
    };

    // Alligator plots each average `offset` samples ahead of the bar that produced it.
    const shiftForward = (
      series: { index: number; timestamp: number; price: number }[],
      offset: number,
    ) => {
      const step = points.length > 1
        ? Math.max(250, points[points.length - 1].timestamp - points[points.length - 2].timestamp)
        : 1000;
      return series.map((point) => {
        const target = point.index + offset;
        const timestamp = target < points.length
          ? points[target].timestamp
          : points[points.length - 1].timestamp + (target - (points.length - 1)) * step;
        return { timestamp, price: point.price };
      });
    };

    // 1. Moving average — simple average of the last 20 samples
    if (activeIndicators['ma']) {
      paths.ma = priceLine(simpleAverage(20)) || '';
    }

    // 2. Bollinger bands — average of 20 samples, bands at 2 standard deviations
    if (activeIndicators['bollinger']) {
      const period = 20;
      const topPoints = [];
      const bottomPoints = [];
      const midPoints = [];
      if (points.length >= period) {
        for (let i = period - 1; i < points.length; i++) {
          let sum = 0;
          for (let j = i + 1 - period; j <= i; j++) sum += points[j].price;
          const avg = sum / period;
          let variance = 0;
          for (let j = i + 1 - period; j <= i; j++) {
            const delta = points[j].price - avg;
            variance += delta * delta;
          }
          const deviation = Math.sqrt(variance / period);
          topPoints.push({ timestamp: points[i].timestamp, price: avg + 2 * deviation });
          bottomPoints.push({ timestamp: points[i].timestamp, price: avg - 2 * deviation });
          midPoints.push({ timestamp: points[i].timestamp, price: avg });
        }
      }
      paths.bollinger = [
        priceLine(topPoints) || '',
        priceLine(bottomPoints) || '',
        priceLine(midPoints) || '',
      ];
    }

    // 3. Alligator — jaw 13 shifted 8, teeth 8 shifted 5, lips 5 shifted 3
    if (activeIndicators['alligator']) {
      paths.alligator = [
        priceLine(shiftForward(smoothedAverage(13), 8)) || '',
        priceLine(shiftForward(smoothedAverage(8), 5)) || '',
        priceLine(shiftForward(smoothedAverage(5), 3)) || '',
      ];
    }

    // 4. RSI 14 — Wilder smoothing. Flat ticks stay neutral instead of reading as overbought.
    if (activeIndicators['rsi'] && points.length > 14) {
      const period = 14;
      const rsiPoints: { timestamp: number; rsi: number }[] = [];
      let avgGain = 0;
      let avgLoss = 0;
      for (let i = 1; i <= period; i++) {
        const change = points[i].price - points[i - 1].price;
        if (change > 0) avgGain += change;
        else avgLoss -= change;
      }
      avgGain /= period;
      avgLoss /= period;

      const readRsi = () => {
        if (avgGain === 0 && avgLoss === 0) return 50;
        if (avgLoss === 0) return 100;
        if (avgGain === 0) return 0;
        const rs = avgGain / avgLoss;
        return 100 - 100 / (1 + rs);
      };

      rsiPoints.push({ timestamp: points[period].timestamp, rsi: readRsi() });
      for (let i = period + 1; i < points.length; i++) {
        const change = points[i].price - points[i - 1].price;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rsiPoints.push({ timestamp: points[i].timestamp, rsi: readRsi() });
      }
      paths.rsi = rsiPoints;
    }

    return paths;
  }, [scales, priceHistory, now, currentPrice, activeIndicators]);

  // Continuous Grid Generation
  // Cells are now positioned based on PRICE LEVELS, not fixed pixels
  const betCells = useMemo(() => {
    if (gameMode !== 'box' || scaleMaxY <= scaleMinY || dimensions.height === 0) return [];

    const cells = [];
    const colWidth = (gridInterval / 1000) * pixelsPerSecond;
    const ySpan = scaleMaxY - scaleMinY;
    const yScale = (price: number) => dimensions.height - ((price - scaleMinY) / ySpan) * dimensions.height;

    // Calculate a stable price step based on the current range to ensure the grid "slides" correctly
    const rawStep = ySpan / 10;
    // Safety check: rawStep must be positive and meaningful
    if (isNaN(rawStep) || rawStep <= 0) return [];
    
    // Snap to "nice" numbers (e.g., 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100...)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let priceStep;
    if (normalized < 1.5) priceStep = 1 * magnitude;
    else if (normalized < 3) priceStep = 2 * magnitude;
    else if (normalized < 7) priceStep = 5 * magnitude;
    else priceStep = 10 * magnitude;


    // Calculate visible price range with buffer (0.8x viewport)
    const viewPadding = ySpan * 0.8;


    const gridMaxY = scaleMaxY + viewPadding;
    const gridMinY = scaleMinY - viewPadding;

    // Stable snap points
    const startPrice = Math.floor(gridMaxY / priceStep) * priceStep;
    const endPrice = Math.ceil(gridMinY / priceStep) * priceStep;

    const priceRange = ySpan;

    // Time-based generation for stable keys. Positions are relative to the
    // current column so the layer can slide with one transform instead of
    // moving every cell on each tick.
    const startTime = columnAnchor - gridInterval;
    const endTime = columnAnchor + ((dimensions.width - scaleTipX) / pixelsPerSecond) * 1000 + gridInterval * 2;

    for (let colTimestamp = startTime; colTimestamp <= endTime; colTimestamp += gridInterval) {
      const colX = ((colTimestamp - columnAnchor) / 1000) * pixelsPerSecond;
      const screenX = colX + scaleTipX;

      if (screenX + colWidth < 0) continue;
      if (screenX > dimensions.width + 100) continue;

      const isCrossing = colTimestamp === columnAnchor;
      const isPast = colTimestamp < columnAnchor;


      // Loop through price levels
      for (let rowPriceTop = startPrice; rowPriceTop >= endPrice; rowPriceTop -= priceStep) {
        const rowPriceBottom = rowPriceTop - priceStep;
        const rowPriceCenter = (rowPriceTop + rowPriceBottom) / 2;
        const priceLevelIndex = Math.round(rowPriceTop / priceStep);

        const y = yScale(rowPriceTop);

        const cellBottom = yScale(rowPriceBottom);
        const rowHeight = cellBottom - y;

        // Skip if completely off screen vertically to save performance
        if (y > dimensions.height + 50 || cellBottom < -50) continue;

        // Determine win/loss for cells crossing or past
        let status: 'future' | 'active' | 'won' | 'lost' = 'future';

        if (isCrossing) {
          if (currentPrice <= rowPriceTop && currentPrice >= rowPriceBottom) {
            status = 'won';
          } else {
            status = 'active';
          }
        } else if (isPast) {
          status = 'lost';
        }


        const isUp = rowPriceCenter > currentPrice;
        const priceInRow = currentPrice <= rowPriceTop && currentPrice >= rowPriceBottom;

        let baseMultiplier: number;
        if (priceInRow) {
          baseMultiplier = 1.01;
        } else {
          // Distance from CURRENT PRICE in price terms
          const priceDist = Math.abs(rowPriceCenter - currentPrice);
          const normalizedDist = Math.min(priceDist / (priceRange * 0.8), 1);
          baseMultiplier = 1.05 + Math.pow(normalizedDist, 1.3) * 3.95;
        }

        const timeBonus = Math.max(0, colX / 800) * 0.25;
        let calculatedMultiplier = Math.min(baseMultiplier + timeBonus, 10.0);

        // BLITZ MODE BOOST (x2 Multiplier) - Reduced density as requested
        const colIndex = Math.floor(colTimestamp / gridInterval);
        const isHighStake = baseMultiplier > 2.2; // Only very high risk cells
        const isLuckyDiagonal = (priceLevelIndex + colIndex) % 5 === 0; // Less frequent (1 in 5 instead of 1 in 3)
        const isBlitzBoosted = isBlitzActive && hasBlitzAccess && (isHighStake || isLuckyDiagonal);



        if (isBlitzBoosted) {
          calculatedMultiplier = calculatedMultiplier * blitzMultiplier;
        }

        const multiplier = Math.min(calculatedMultiplier, 20).toFixed(2);

        // Visual properties
        const distFromCenter = Math.abs(rowPriceCenter - currentPrice) / priceRange;
        const intensity = Math.min(distFromCenter * 1.5, 1);

        const hue = isBlitzBoosted ? 28 : 252;
        const saturation = isBlitzBoosted ? 90 : 85;
        const lightness = isBlitzBoosted ? 58 : 62;
        const alpha = isBlitzBoosted ? 0.55 - intensity * 0.2 : 0.55 - intensity * 0.32;

        const cellColor = `hsla(${hue}, ${saturation}%, ${lightness}%, ${Math.max(0.05, alpha)})`;
        const borderColor = isBlitzBoosted
          ? `hsla(${hue}, 90%, 60%, ${0.7 - intensity * 0.3})`
          : `hsla(${hue}, 80%, 72%, ${Math.max(0.18, 0.7 - intensity * 0.35)})`;

        cells.push({
          id: `cell-${colTimestamp}-${priceLevelIndex}`,
          x: colX,
          y,
          width: colWidth - 3,
          height: Math.max(rowHeight - 3, 5),
          multiplier,
          isUp,
          status,
          color: cellColor,
          borderColor: borderColor,
          priceTop: rowPriceTop,
          priceBottom: rowPriceBottom,
          isBlitzBoosted
        });
      }
    }

    return cells;
  }, [scaleMinY, scaleMaxY, scaleTipX, columnAnchor, currentPrice, dimensions, gameMode, gridInterval, pixelsPerSecond, isBlitzActive, hasBlitzAccess, blitzMultiplier]);




  // Handle bet resolution when chart crosses cells with active bets
  useEffect(() => {
    if (!scales || cellBets.size === 0 || gameMode !== 'box') return;

    betCells.forEach((cell: any) => {
      const bet = cellBets.get(cell.id);
      if (!bet) return;

      // Check if this cell is being crossed or has been passed
      const isCrossing = cell.status === 'active' || cell.status === 'won' || cell.status === 'lost';

      if (isCrossing) {
        // Determine if bet won or lost based on current price
        const won = currentPrice <= cell.priceTop && currentPrice >= cell.priceBottom;
        const payout = won ? bet.amount * bet.multiplier : 0;

        // Remove from cellBets
        setCellBets(prev => {
          const newMap = new Map(prev);
          newMap.delete(cell.id);
          return newMap;
        });

        // Resolve the bet in the store
        resolveBet(bet.betId, won, payout);

        // Add bet result notification
        setBetResults(prev => [...prev, {
          id: `result-${bet.betId}`,
          won,
          amount: bet.amount,
          payout,
          multiplier: bet.multiplier,
          timestamp: Date.now(),
          x: cell.x + scaleTipX,
          y: cell.y
        }]);

        // Play sound effect
        if (won) {
          playWinSound();
        } else {
          playLoseSound();
        }

        // Balance settlement is handled centrally by resolveBet in the store.
        // Avoid duplicate /api/balance/win calls from the chart layer.
        if (userAddress) {
          fetchBalance(userAddress);
        }

        // Add to resolved cells for visual feedback
        setResolvedCells(prev => [...prev, {
          id: cell.id,
          row: 0,
          won,
          timestamp: Date.now()
        }]);

        if (process.env.NODE_ENV === 'development') {
          console.log(`Bet resolved: ${won ? 'WON' : 'LOST'} - Amount: ${bet.amount}, Multiplier: ${bet.multiplier}, Payout: ${payout}`);
        }
      }
    });
  }, [betCells, cellBets, scales, currentPrice, resolveBet, userAddress, fetchBalance, playWinSound, playLoseSound, gameMode]);

  // Draw mode settlement: resolve when `now >= endTime` and price stays inside [priceBottom, priceTop]
  useEffect(() => {
    if (!scales || gameMode !== 'draw') return;

    const drawBets = activeBets.filter((bet: any) =>
      bet.mode === 'draw' &&
      bet.asset === selectedAsset &&
      bet.status === 'active' &&
      typeof bet.endTime === 'number' &&
      typeof bet.priceTop === 'number' &&
      typeof bet.priceBottom === 'number'
    );

    drawBets.forEach((bet: any) => {
      if (now < bet.endTime) return;
      if (resolvedDrawBetIdsRef.current.has(bet.id)) return;
      resolvedDrawBetIdsRef.current.add(bet.id);
      setTimeout(() => resolvedDrawBetIdsRef.current.delete(bet.id), 5000);

      const won = currentPrice <= bet.priceTop && currentPrice >= bet.priceBottom;
      const payout = won ? bet.amount * bet.multiplier : 0;

      resolveBet(bet.id, won, payout);

      setBetResults(prev => [
        ...prev,
        {
          id: `draw-${bet.id}`,
          won,
          amount: bet.amount,
          payout,
          multiplier: bet.multiplier,
          timestamp: Date.now(),
          x: scales.tipX,
          y: (scales.yScale(bet.priceTop) + scales.yScale(bet.priceBottom)) / 2,
        },
      ]);

      if (won) playWinSound();
      else playLoseSound();
    });
  }, [scales, gameMode, activeBets, selectedAsset, now, currentPrice, resolveBet, playWinSound, playLoseSound]);

  return (
    <div ref={containerRef} className="absolute inset-x-0 top-0 bottom-[var(--trade-sheet,0px)] z-0 select-none overflow-hidden bg-black sm:bottom-0">
      {/* Loading State */}
      {isLoadingPrice && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            {/* Spinner */}
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-[#7005FC]/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-[#7005FC] rounded-full animate-spin"></div>
            </div>
            {/* Text */}
            <div className="text-center">
              <p className="text-white text-sm font-medium mb-1">Loading {currentAssetConfig.name} Price</p>
              <p className="text-gray-500 text-xs">Fetching the live price...</p>
            </div>
          </div>
        </div>
      )}

      {/* Background Grid */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}
      />

      {/* Box Mode: Grid Cells layer */}
      {gameMode === 'box' && (
        <div ref={gridShiftRef} className="absolute inset-0 z-5 overflow-hidden pointer-events-none" style={{ willChange: 'transform' }}>
          {betCells.map((cell: any) => {
            // Visual styling based on status
            let opacity = 0.9;
            let bg = cell.color;
            let borderStyle = `1px solid ${cell.borderColor}`;
            let canBet = cell.status === 'future';
            let extraClass = '';

            if (cell.status === 'won') {
              return (
                <div key={cell.id} className="monblip-cell-win pointer-events-none">
                  <div
                    className="absolute rounded-sm"
                    style={{
                      left: cell.x,
                      top: cell.y,
                      width: cell.width,
                      height: cell.height,
                      backgroundColor: 'rgba(110, 84, 255, 0.55)',
                      border: '2px solid rgba(196, 181, 255, 0.95)',
                      boxShadow: '0 0 18px rgba(110, 84, 255, 0.45)',
                      transition: 'background-color 480ms ease, border-color 480ms ease, box-shadow 480ms ease',
                    }}
                  >
                    <div className="flex h-full flex-col items-center justify-center">
                      <span className="text-[10px] font-mono font-bold text-white">
                        x{cell.multiplier}
                      </span>
                    </div>
                  </div>
                </div>
              );
            } else if (cell.status === 'lost') {
              return null;
            } else if (cell.status === 'active') {
              opacity = 1;
              borderStyle = `2px solid rgba(255,255,255,0.5)`;
              extraClass = 'ring-1 ring-white/30';
            }

            const handleClick = async () => {
              if (canBet && betAmount && userAddress) {
                const requiredAmount = parseFloat(betAmount);
                const currentBalance = houseBalance || 0;

                if (currentBalance < requiredAmount) {
                  setShowInsufficientFunds(true);
                  setTimeout(() => setShowInsufficientFunds(false), 2000);
                  return;
                }

                try {
                  const targetId = `${cell.isUp ? 'UP' : 'DOWN'}-${cell.multiplier}-${timeframeSeconds}`;

                  // House balance only — deduct via /api/balance/bet (no per-bet wallet signature).
                  // Users fund the treasury once via Deposit; stakes are not sent on-chain each click.
                  const result = await placeBetFromHouseBalance(
                    betAmount,
                    targetId,
                    userAddress,
                    cell.id,
                  );

                  if (result && result.bet) {
                    // cellBets will be automatically updated by the useEffect watching activeBets
                  }
                } catch (error) {
                  console.error('Failed to place box bet:', error);
                  toast.error(error instanceof Error ? error.message : 'Failed to place bet');
                }
              }
            };

            const hasBet = cellBets.has(cell.id);
            if (hasBet) {
              bg = 'rgba(0, 255, 255, 0.4)';
              borderStyle = '2px solid #00FFFF';
              extraClass = 'ring-2 ring-cyan-400/50 animate-pulse';
            }

            return (
              <div
                key={cell.id}
                onClick={handleClick}
                className={`absolute rounded-sm flex items-center justify-center transition-opacity duration-300 ${canBet ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${extraClass}`}
                style={{
                  left: cell.x,
                  top: cell.y,
                  width: cell.width,
                  height: cell.height,
                  backgroundColor: bg,
                  border: borderStyle,
                  opacity
                }}
              >
                <div className="flex flex-col items-center justify-center h-full w-full pointer-events-none">
                  {hasBet ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex flex-col items-center">
                        <span className="text-[14px] font-black text-white tracking-tighter leading-none drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
                          {(parseFloat(cellBets.get(cell.id)?.amount as any || '0') * parseFloat(cellBets.get(cell.id)?.multiplier as any || '1')).toFixed(2)}
                        </span>
                        <span className="text-[7px] font-black uppercase text-cyan-400/80 tracking-[0.2em] mt-0.5">
                          {currencySymbol}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                        <span className="text-[9px] font-bold text-white/50 tracking-tighter">
                          {cellBets.get(cell.id)?.multiplier}x
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className={`text-[10px] font-black transition-colors ${cell.isBlitzBoosted ? 'text-orange-100 drop-shadow-[0_0_5px_rgba(255,165,0,0.8)]' : 'text-white/40'}`}>
                        {cell.multiplier}x
                      </span>
                      {cell.isBlitzBoosted && (
                        <span className="text-[6px] font-black text-orange-400 uppercase tracking-widest mt-0.5">
                          BLITZ
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );

          })}
        </div>
      )}

      {/* Draw mode: interaction overlay + active draw rectangles */}
      {gameMode === 'draw' && scales && (
        <>
          {/* Mouse capture overlay (prevents placing new bets while confirming) */}
          <div
            className="absolute inset-0 z-30"
            style={{ cursor: 'crosshair', pointerEvents: pendingBox ? 'none' : 'auto', touchAction: 'none' }}
            onPointerDown={handleDrawPointerDown}
            onPointerMove={handleDrawPointerMove}
            onPointerUp={handleDrawPointerUp}
            onPointerCancel={handleDrawPointerUp}
          />

          {/* Preview while dragging. Geometry is written on the node so the chart does not re-render. */}
          <div
            ref={drawPreviewRef}
            className="absolute pointer-events-none opacity-0"
            style={{
              zIndex: 45,
              border: '2px dashed rgba(110,84,255,0.95)',
              backgroundColor: 'rgba(110,84,255,0.22)',
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(110,84,255,0.45)',
            }}
          />

          {/* Pending placement preview + confirm panel */}
          {pendingBox && (
            <>
              <div
                className="absolute pointer-events-none"
                style={{
                  zIndex: 32,
                  left: pendingBox.x,
                  top: pendingBox.y,
                  width: pendingBox.width,
                  height: pendingBox.height,
                  border: '2px dashed rgba(110,84,255,0.95)',
                  backgroundColor: 'rgba(110,84,255,0.22)',
                  borderRadius: 4,
                }}
              />

              <div
                className="absolute z-[35]"
                style={{
                  left: Math.min(pendingBox.x + pendingBox.width + 10, Math.max(16, dimensions.width - 220)),
                  top: Math.max(10, pendingBox.y - 10),
                  width: 200,
                }}
              >
                <div className="bg-black/80 backdrop-blur-xl border border-[#7005FC]/30 rounded-2xl p-3 shadow-2xl">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-white text-xs font-bold uppercase tracking-wider text-[#7005FC]">Draw Bet</div>
                      <div className="text-white text-sm font-mono">
                        {pendingBox.multiplier.toFixed(2)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Range</div>
                      <div className="text-white text-[11px] font-mono">
                        {pendingBox.priceBottom.toFixed(4)} - {pendingBox.priceTop.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Payout</div>
                    <div className="text-white text-[13px] font-mono">
                      {(parseFloat(betAmount) * pendingBox.multiplier).toFixed(2)} {currencySymbol}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handlePlaceDrawBet}
                      disabled={!userAddress}
                      className="flex-1 py-2 rounded-xl bg-[#7005FC] hover:bg-[#8F3BFF] text-white text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {`Bet ${betAmount} ${currencySymbol}`}
                    </button>
                    <button
                      onClick={() => setPendingBox(null)}
                      className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-black"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Active draw bet rectangles */}
          <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
            {activeBets
              .filter((bet: any) =>
                bet.mode === 'draw' &&
                bet.asset === selectedAsset &&
                bet.status === 'active' &&
                typeof bet.startTime === 'number' &&
                typeof bet.endTime === 'number' &&
                typeof bet.priceTop === 'number' &&
                typeof bet.priceBottom === 'number'
              )
              .map((bet: any) => {
                const bStartX = scales.xScale(bet.startTime);
                const bEndX = scales.xScale(bet.endTime);
                if (bEndX <= bStartX) return null;

                const clampedStartX = Math.max(scales.tipX, bStartX);
                const width = bEndX - clampedStartX;
                if (width <= 0) return null;

                const tY = scales.yScale(bet.priceTop);
                const bY = scales.yScale(bet.priceBottom);
                const height = bY - tY;
                if (height <= 0) return null;

                const isWinning = currentPrice <= bet.priceTop && currentPrice >= bet.priceBottom;
                const fill = isWinning ? 'rgba(110,84,255,0.34)' : 'rgba(110,84,255,0.18)';
                const stroke = isWinning ? 'rgba(196,181,255,0.95)' : 'rgba(110,84,255,0.8)';

                return (
                  <g key={bet.id}>
                    <rect
                      x={clampedStartX}
                      y={tY}
                      width={width}
                      height={height}
                      rx={4}
                      strokeWidth={2}
                      style={{
                        fill,
                        stroke,
                        transition: 'fill 420ms ease, stroke 420ms ease',
                      }}
                    />
                    <text
                      x={clampedStartX + 6}
                      y={tY + 16}
                      fill="rgba(255,255,255,0.85)"
                      fontSize={10}
                      fontFamily="monospace"
                      fontWeight={800}
                    >
                      x{Number(bet.multiplier).toFixed(2)}
                    </text>
                  </g>
                );
              })}
          </svg>
        </>
      )}

      {/* Classic mode: Active Bets SVG Overlay - Strike and Expiration lines */}
      <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
        {gameMode === 'binomo' && scales && activeBets.map((bet: any) => {
          if (bet.status !== 'active') return null;

          const strikeY = scales.yScale(bet.strikePrice);
          const expirationX = scales.xScale(bet.endTime);
          const nowX = scales.tipX;

          // Only show if expiration is in the future
          if (expirationX < 0) return null;

          const isUp = bet.direction === 'UP';
          const color = isUp ? '#22c55e' : '#ef4444';

          return (
            <g key={bet.id}>
              <line
                x1={nowX}
                y1={strikeY}
                x2={Math.max(nowX, expirationX)}
                y2={strikeY}
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-70"
              />

              {expirationX > nowX && (
                <line
                  x1={expirationX}
                  y1={0}
                  x2={expirationX}
                  y2={dimensions.height}
                  stroke="#ffffff"
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  strokeDasharray="8 4"
                />
              )}

              {expirationX > nowX && (
                <rect
                  x={nowX}
                  y={isUp ? Math.min(strikeY, scales.yScale(currentPrice)) : strikeY}
                  width={expirationX - nowX}
                  height={Math.abs(strikeY - scales.yScale(currentPrice))}
                  fill={color}
                  fillOpacity="0.12"
                  style={{ transition: 'fill 420ms ease, fill-opacity 420ms ease' }}
                />
              )}

              <text
                x={nowX + 5}
                y={strikeY - 5}
                fill={color}
                fontSize="10"
                fontFamily="monospace"
                className="font-bold opacity-80"
              >
                {bet.direction} {bet.amount} {currencySymbol} {bet.strikePrice && `@ $${bet.strikePrice.toFixed(2)}`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* SVG Layer for Chart - ON TOP */}
      <svg
        key={`chart-${selectedAsset}`}
        className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      >
        {scales && (
          <>
            {/* Y-Axis Price Ticks */}
            <g className="y-axis">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((tick) => {
                const price = scales.minY + (scales.maxY - scales.minY) * tick;
                const y = scales.yScale(price);
                return (
                  <g key={`y-tick-${tick}`}>
                    <line x1={0} y1={y} x2={dimensions.width} y2={y} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
                    <text
                      x={dimensions.width - 5}
                      y={y - 5}
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="end"
                      className="opacity-50"
                    >
                      {price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: quoteDecimals })}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* X-Axis Time Ticks */}
            <g className="x-axis">
              {(() => {
                // Dynamic tick interval based on pixelsPerSecond
                // We want at least 120px between time labels to prevent overlap
                const minSpacing = 120;
                let tickInterval = 10;

                if (pixelsPerSecond < minSpacing / 10) tickInterval = 30;
                if (pixelsPerSecond < minSpacing / 30) tickInterval = 60;
                if (pixelsPerSecond < minSpacing / 60) tickInterval = 120;
                if (pixelsPerSecond < minSpacing / 120) tickInterval = 300;
                if (pixelsPerSecond < minSpacing / 300) tickInterval = 600;

                // Calculate range of seconds to show based on visible dimensions
                const secondsPast = scales.tipX / pixelsPerSecond;
                const secondsFuture = (dimensions.width - scales.tipX) / pixelsPerSecond;

                const startSec = Math.floor(-secondsPast / tickInterval) * tickInterval;
                const endSec = Math.ceil(secondsFuture / tickInterval) * tickInterval;

                const ticks = [];
                for (let s = startSec; s <= endSec; s += tickInterval) {
                  ticks.push(s);
                }

                return ticks.map((sec) => {
                  const ts = now + sec * 1000;
                  const x = scales.xScale(ts);
                  if (x < 0 || x > dimensions.width) return null;
                  return (
                    <g key={`x-tick-${sec}`}>
                      <line x1={x} y1={0} x2={x} y2={dimensions.height} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
                      <text
                        x={x + 5}
                        y={dimensions.height - 10}
                        fill="#94a3b8"
                        fontSize="9"
                        fontFamily="monospace"
                        className="opacity-40"
                      >
                        {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </text>
                    </g>
                  );
                });
              })()}
            </g>

            {chartPath && currentPrice > 0 && (
              <>
                {/* Dark edge so the line stays visible on the box cells */}
                <path
                  ref={(node) => { linePathsRef.current[0] = node; }}
                  d={chartPath}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Glow */}
                <path
                  ref={(node) => { linePathsRef.current[1] = node; }}
                  d={chartPath}
                  fill="none"
                  stroke="#7005FC"
                  strokeWidth="12"
                  strokeOpacity="0.22"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Main line */}
                <path
                  ref={(node) => { linePathsRef.current[2] = node; }}
                  d={chartPath}
                  fill="none"
                  stroke="#7005FC"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Tip indicator */}
                <circle
                  ref={tipRef}
                  cx={scales.tipX}
                  cy={scales.yScale(currentPrice)}
                  r="5"
                  fill="#7005FC"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />

                {/* Horizontal price line */}
                <line
                  ref={priceLineRef}
                  x1={0}
                  y1={scales.yScale(currentPrice)}
                  x2={scales.tipX - 10}
                  y2={scales.yScale(currentPrice)}
                  stroke="#7005FC"
                  strokeOpacity="0.45"
                  strokeDasharray="4 4"
                />

                {/* TECHNICAL INDICATORS RENDER */}
                {indicatorPaths && (
                  <g className="indicators-layer">
                    {/* Moving Average */}
                    {activeIndicators['ma'] && indicatorPaths.ma && (
                      <path
                        d={indicatorPaths.ma as string}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                        opacity="0.8"
                      />
                    )}

                    {/* Bollinger Bands */}
                    {activeIndicators['bollinger'] && indicatorPaths.bollinger && (
                      <g>
                        <path
                          d={(indicatorPaths.bollinger as string[])[0]}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="1.5"
                          opacity="0.5"
                        />
                        <path
                          d={(indicatorPaths.bollinger as string[])[1]}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="1.5"
                          opacity="0.5"
                        />
                        <path
                          d={(indicatorPaths.bollinger as string[])[2]}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                          opacity="0.3"
                        />
                      </g>
                    )}

                    {/* Alligator */}
                    {activeIndicators['alligator'] && indicatorPaths.alligator && (
                      <g>
                        <path d={(indicatorPaths.alligator as string[])[0]} fill="none" stroke="#2563eb" strokeWidth="2" opacity="0.6" />
                        <path d={(indicatorPaths.alligator as string[])[1]} fill="none" stroke="#dc2626" strokeWidth="2" opacity="0.6" />
                        <path d={(indicatorPaths.alligator as string[])[2]} fill="none" stroke="#16a34a" strokeWidth="2" opacity="0.6" />
                      </g>
                    )}

                    {/* RSI Advanced Visualization */}
                    {activeIndicators['rsi'] && indicatorPaths.rsi && (() => {
                      try {
                        const rsiPoints = indicatorPaths.rsi as { timestamp: number; rsi: number }[];
                        const panelHeight = 100;
                        const panelY = dimensions.height - panelHeight - 20;
                        const rsiY = (value: number) => panelHeight - (value / 100) * panelHeight;
                        const rsiPath = line<{ timestamp: number; rsi: number }>()
                          .x((d) => scales.xScale(d.timestamp))
                          .y((d) => rsiY(d.rsi))
                          .curve(curveMonotoneX)(rsiPoints) || '';

                        return (
                          <g transform={`translate(0, ${panelY})`}>
                            <rect x={0} y={0} width={dimensions.width} height={panelHeight} fill="#0b0b0b" fillOpacity="0.92" />
                            <line x1={0} y1={0} x2={dimensions.width} y2={0} stroke="rgba(110,84,255,0.45)" strokeWidth="1" />
                            <line x1={0} y1={rsiY(70)} x2={dimensions.width} y2={rsiY(70)} stroke="rgba(239, 68, 68, 0.45)" strokeWidth="1" strokeDasharray="4 4" />
                            <line x1={0} y1={rsiY(50)} x2={dimensions.width} y2={rsiY(50)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                            <line x1={0} y1={rsiY(30)} x2={dimensions.width} y2={rsiY(30)} stroke="rgba(34, 197, 94, 0.45)" strokeWidth="1" strokeDasharray="4 4" />
                            <text x={10} y={rsiY(70) - 4} fill="rgba(239, 68, 68, 0.7)" fontSize="8" fontWeight="bold">70</text>
                            <text x={10} y={rsiY(30) + 10} fill="rgba(34, 197, 94, 0.7)" fontSize="8" fontWeight="bold">30</text>
                            <path
                              d={rsiPath}
                              fill="none"
                              stroke="#7005FC"
                              strokeWidth="2"
                            />
                            <text x={dimensions.width - 12} y={14} fill="#7005FC" fontSize="10" fontWeight="bold" textAnchor="end">RSI 14</text>
                          </g>
                        );
                      } catch (e) { return null; }
                    })()}

                  </g>
                )}
              </>
            )}
          </>
        )}
      </svg>

      {/* Price Header with Asset Selector - Dropdown Version */}
      <div className="pointer-events-auto absolute left-3 top-2 z-40 max-w-[calc(100%-7.5rem)] sm:left-8 sm:top-6 sm:max-w-none">
        <div className="relative mb-4">
          {/* Trigger Button */}
          <button
            ref={assetSelectorRef}
            onClick={() => {
              if (!isAssetDropdownOpen && assetSelectorRef.current) {
                const rect = assetSelectorRef.current.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 8, left: rect.left });
              }
              setIsAssetDropdownOpen(!isAssetDropdownOpen);
            }}
            data-tour="asset-selector"
            className="flex items-center gap-2 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-2.5 py-1.5 transition hover:border-[#7005FC]"
          >
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-[#070010]">
              <AssetIcon
                src={currentAssetConfig.logo}
                asset={selectedAsset}
                className="h-full w-full object-contain"
              />
            </span>
            <span className="text-left">
              <span className="block text-[11px] text-[#DDD7FE]">Asset</span>
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-white">{selectedAsset}</span>
                <svg
                  className={`h-3 w-3 text-[#DDD7FE] transition-transform ${isAssetDropdownOpen ? 'rotate-180 text-[#7005FC]' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </span>
          </button>
        </div>

        {watchlist.length > 0 && (
          <div className="mb-3 flex max-w-[calc(100vw-8.5rem)] gap-1.5 overflow-x-auto sm:max-w-[280px] sm:flex-wrap">
            {watchlist.slice(0, 8).map((asset) => (
              <button
                key={asset}
                onClick={() => setSelectedAsset(asset)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${selectedAsset === asset ? 'border-[#7005FC] bg-[#7005FC] text-white' : 'border-[#2a2a2a] bg-[#141414] text-[#DDD7FE] hover:text-white'}`}
              >
                {asset}
              </button>
            ))}
          </div>
        )}

        {/* Price Display */}
        <div className="pointer-events-none relative z-10" data-tour="price-display">
          <p className="w-fit bg-black pr-2 text-xs text-[#DDD7FE]">{currentAssetConfig.pair}</p>
          <p className="mt-1 w-fit bg-black pr-2 text-2xl font-medium tabular-nums tracking-tight text-white sm:text-3xl">
            {currentPrice > 0 ? currentPrice.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: Math.min(2, currentAssetConfig.decimals),
              maximumFractionDigits: currentAssetConfig.decimals
            }) : '—'}
          </p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7005FC]" />
            <span className="whitespace-nowrap text-[11px] leading-4 text-[#DDD7FE] sm:text-xs">Public quote</span>
          </div>
        </div>
      </div>

      {/* Indicator Selection UI - Positioned absolute to follow the new trigger */}
      <div className="fixed bottom-20 right-4 sm:right-6 z-50 pointer-events-none">
        <AnimatePresence>
          {isIndicatorsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              data-tour="indicators-panel"
              className="pointer-events-auto w-[min(100vw-2rem,20rem)] overflow-hidden rounded-3xl border border-[#2a2a2a] bg-[#0c0c0c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-start justify-between px-4 pb-2 pt-4">
                <div>
                  <p className="text-[15px] font-medium text-white">Indicators</p>
                  <p className="mt-0.5 text-xs text-[#DDD7FE]">Draw them on the live price.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsIndicatorsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#DDD7FE] transition hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1.5 px-2 pb-2">
              {[
                {
                  id: 'ma',
                  name: 'Moving average',
                  hint: 'Average of the last 20 prices',
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  ),
                },
                {
                  id: 'alligator',
                  name: 'Alligator',
                  hint: 'Jaw, teeth, and lips',
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                  ),
                },
                {
                  id: 'bollinger',
                  name: 'Bollinger bands',
                  hint: 'Average, plus and minus two deviations',
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  ),
                },
                {
                  id: 'rsi',
                  name: 'RSI',
                  hint: 'Overbought and oversold',
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M3 4v16M3 20h18" />
                    </svg>
                  ),
                },
              ].map(indicator => {
                const on = !!activeIndicators[indicator.id];
                return (
                <button
                  key={indicator.id}
                  type="button"
                  onClick={() => toggleIndicator(indicator.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition ${on ? 'border-[#7005FC] bg-[#7005FC]/10' : 'border-[#232323] bg-[#141414] hover:border-[#3a3a3a]'}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-[#7005FC] text-white' : 'bg-[#070010] text-[#DDD7FE]'}`}>
                    {indicator.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-white">{indicator.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[#DDD7FE]">{indicator.hint}</span>
                  </span>
                </button>
                );
              })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      {/* Insufficient Funds Warning - Minimalist Toast */}
      {showInsufficientFunds && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50">
          <div className="px-4 py-2 bg-orange-500/20 backdrop-blur-md border border-orange-400/40 rounded-xl">
            <p className="text-orange-300 text-sm font-medium text-center max-w-[240px]">
              Not enough house credits — deposit in the Wallet tab first
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
        {betResults.map((result) => (
          <div
            key={`wash-${result.id}`}
            className={`monblip-result-wash absolute inset-0 ${result.won ? 'bg-emerald-400/20' : 'bg-red-500/20'}`}
          />
        ))}
        {betResults.map((result) => {
          return (
            <div
              key={result.id}
              className="monblip-result-card absolute"
              style={{
                left: Math.min(Math.max(result.x, 80), dimensions.width - 140),
                top: Math.min(Math.max(result.y, 40), dimensions.height - 120),
              }}
            >
              <div className={`
                relative rounded-2xl px-5 py-3
                ${result.won
                  ? 'border border-emerald-300/70 bg-emerald-950/80 shadow-[0_0_28px_rgba(52,211,153,0.28)]'
                  : 'border border-red-300/70 bg-red-950/80 shadow-[0_0_28px_rgba(248,113,113,0.28)]'
                }
              `}>
                <div className="relative flex items-center gap-3">
                  <div className={`
                    flex h-10 w-10 items-center justify-center rounded-xl text-xl
                    ${result.won
                      ? 'bg-emerald-400/25 text-emerald-200'
                      : 'bg-red-400/25 text-red-200'
                    }
                  `}>
                    {result.won ? '✓' : '✕'}
                  </div>
                  <div>
                    <p className={`text-sm font-black tracking-wide ${result.won ? 'text-emerald-200' : 'text-red-200'}`}>
                      {result.won ? 'WIN!' : 'LOST'}
                    </p>
                    <p className={`text-lg font-bold ${result.won ? 'text-emerald-50' : 'text-red-50'}`}>
                      {result.won
                        ? `+${result.payout.toFixed(4)}`
                        : `-${result.amount.toFixed(4)}`
                      }
                      <span className="ml-1 text-xs opacity-70">{currencySymbol}</span>
                    </p>
                  </div>
                  {result.won && (
                    <div className="rounded-lg bg-emerald-400/20 px-2 py-0.5 text-xs font-bold text-emerald-100">
                      x{result.multiplier}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Asset Dropdown - rendered via Portal to escape all stacking contexts */}
      {isAssetDropdownOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsAssetDropdownOpen(false)}
          />

          {/* Dropdown Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
            className="z-[9999] w-[min(100vw-1.5rem,26rem)] overflow-hidden rounded-3xl border border-[#2a2a2a] bg-[#0c0c0c] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="relative mb-3">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <svg className="h-4 w-4 text-[#B781FE]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search assets"
                value={assetSearchQuery}
                onChange={(e) => setAssetSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#141414] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-[#B781FE] focus:border-[#7005FC] focus:outline-none"
              />
            </div>

            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
              {(['All', 'Crypto', 'Metals', 'Forex', 'Stocks', 'Commodities'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveAssetCategory(cat)}
                  className={`shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition ${activeAssetCategory === cat ? 'bg-[#7005FC] text-white' : 'bg-[#141414] text-[#DDD7FE] hover:text-white'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid max-h-[320px] grid-cols-1 gap-1.5 overflow-y-auto">
              {filteredAssets.length > 0 ? (
                filteredAssets.map((asset) => {
                  const config = ASSET_CONFIG[asset];
                  const selected = selectedAsset === asset;
                  const saved = watchlist.includes(asset);
                  return (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => {
                      setSelectedAsset(asset);
                      setIsAssetDropdownOpen(false);
                      setAssetSearchQuery('');
                    }}
                    className={`flex items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition ${selected ? 'border-[#7005FC] bg-[#7005FC]/10' : 'border-[#232323] bg-[#141414] hover:border-[#3a3a3a]'}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#070010]">
                      <AssetIcon src={config.logo} asset={asset} className="h-full w-full object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{config.name}</span>
                        <span className="shrink-0 text-[10px] text-[#DDD7FE]">{config.category}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#B781FE]">{config.pair}</span>
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatchlist(asset);
                      }}
                      className={`px-1 text-base leading-none ${saved ? 'text-[#7005FC]' : 'text-[#B781FE] hover:text-white'}`}
                      title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
                    >
                      {saved ? '★' : '☆'}
                    </span>
                  </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-[#2a2a2a] px-4 py-8 text-center">
                  <p className="text-sm text-white">No matches</p>
                  <p className="mt-1 text-xs text-[#DDD7FE]">Try another name or category.</p>
                </div>
              )}
            </div>
          </motion.div>
        </>,
        document.body
      )}
    </div>
  );
};
