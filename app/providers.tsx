'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { WalletConnectModal } from '@/components/wallet/WalletConnectModal';
import { FirstConnectGuide } from '@/components/tour/FirstConnectGuide';
import { ReferralSync } from './ReferralSync';
import { useOverflowStore } from '@/lib/store';
import { restoreBetHistory } from '@/lib/store/historySlice';
import type { AssetType } from '@/lib/utils/priceFeed';

const SPLASH_STEPS = ['Reading live prices', 'Restoring your session', 'Opening the desk'] as const;
const SPLASH_MAX_MS = 3500;

const WIPE_PATH =
  'M-1000 0 L0 0 L34 38 L-18 38 L12 76 L64 76 L38 98 L-14 98 L22 130 L-26 162 L18 162 L0 200 ' +
  'L-1000 200 L-972 168 L-1026 168 L-992 124 L-958 96 L-1012 96 L-976 52 L-1024 52 Z';
const WORD_STYLE = { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700, fontSize: 150 } as const;

function Word({ fill, stroke, strokeWidth }: { fill: string; stroke?: string; strokeWidth?: number }) {
  return (
    <text
      x="500"
      y="100"
      textAnchor="middle"
      dominantBaseline="central"
      textLength="920"
      lengthAdjust="spacingAndGlyphs"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      style={WORD_STYLE}
    >
      LOADING
    </text>
  );
}

function Splash({ step }: { step: number }) {
  const progress = Math.min(100, ((step + 1) / SPLASH_STEPS.length) * 100);
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  const hud = 'font-[family-name:var(--font-roboto)] text-[10px] uppercase tracking-[0.22em] text-[#B8A6E6]/70';

  return (
    <div role="status" aria-label="Loading MonBlip" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070010]">
      <span className={`absolute left-6 top-6 ${hud}`}>[ MonBlip.fun ]</span>
      <span className={`absolute right-6 top-6 ${hud}`}>Monad · 143</span>
      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-sm text-[#B781FE]/70" aria-hidden>+</span>
      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm text-[#B781FE]/70" aria-hidden>+</span>
      <span className={`absolute bottom-6 left-6 ${hud}`} aria-live="polite">{SPLASH_STEPS[step]}…</span>
      <div
        className="absolute bottom-6 right-6 h-2 w-14 border border-[#B781FE]/60 p-px"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-[#B781FE] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
      </div>

      <svg viewBox="0 0 1000 200" className="w-[min(82vw,760px)] overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="splash-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7005FC" />
            <stop offset="1" stopColor="#B781FE" />
          </linearGradient>
          <clipPath id="splash-wipe">
            <path d={WIPE_PATH} transform={still ? 'translate(1000 0)' : undefined}>
              {still ? null : (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="-40 0; 2080 0"
                  keyTimes="0; 1"
                  calcMode="spline"
                  keySplines="0.7 0 0.3 1"
                  dur="2.1s"
                  repeatCount="indefinite"
                />
              )}
            </path>
          </clipPath>
          <clipPath id="splash-slices">
            <rect x="0" y="86" width="1000" height="7" />
            <rect x="0" y="128" width="1000" height="4" />
            <rect x="0" y="54" width="1000" height="3" />
          </clipPath>
        </defs>
        {/* Unbounded glyphs have overlapping contours; the bg fill hides the inner half of the stroke. */}
        <Word fill="none" stroke="#B781FE" strokeWidth={3} />
        <Word fill="#070010" />
        <g clipPath="url(#splash-wipe)">
          <Word fill="url(#splash-fill)" />
        </g>
        {still ? null : (
          <g clipPath="url(#splash-slices)">
            <animate attributeName="opacity" values="0; 0.9; 0; 0; 0.9; 0; 0" calcMode="discrete" dur="1.3s" repeatCount="indefinite" />
            <g>
              <Word fill="url(#splash-fill)" />
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 18 0; -12 0; 6 0; 0 0"
                calcMode="discrete"
                dur="0.7s"
                repeatCount="indefinite"
              />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [step, setStep] = useState(0);
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    let cancelled = false;
    let stopPriceFeed: (() => void) | undefined;
    const fallback = window.setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, SPLASH_MAX_MS);

    const initializeApp = async () => {
      try {
        const { updateAllPrices, loadTargetCells, startGlobalPriceFeed, fetchHistory } = useOverflowStore.getState();
        restoreBetHistory((bets) => {
          useOverflowStore.setState({ bets });
        });
        await loadTargetCells().catch(() => {});
        if (cancelled) return;

        try {
          const { fetchPrice } = await import('@/lib/utils/priceFeed');
          const store = useOverflowStore.getState();
          const candidates: AssetType[] = ['SOL', 'ETH', 'BTC'];
          const seeded = await Promise.any(
            candidates.map(async (asset) => {
              const p = await fetchPrice(asset);
              if (p?.price && p.price > 0) return { asset, price: p.price };
              throw new Error('No valid price');
            }),
          );
          if (cancelled) return;
          store.setSelectedAsset(seeded.asset);
          store.updatePrice(seeded.price, seeded.asset);
          store.updatePrice(seeded.price, seeded.asset);
        } catch {
          // The live feed still starts below.
        }

        if (cancelled) return;
        stopPriceFeed = startGlobalPriceFeed(updateAllPrices);
        setStep(1);
        const { ensureBalanceSession } = await import('@/lib/balance/balanceClientHeaders');
        await ensureBalanceSession().catch(() => {});
        const { restoreMetaMask } = await import('@/lib/monad/injectedWallet');
        await restoreMetaMask().catch(() => {});
        if (cancelled) return;
        setStep(2);
        const restored = useOverflowStore.getState();
        if (restored.address) void fetchHistory(restored.address).catch(() => {});
        if (!cancelled) setIsReady(true);
      } catch (error) {
        console.error('Error initializing app:', error);
        if (!cancelled) setIsReady(true);
      }
    };

    void initializeApp();
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      stopPriceFeed?.();
    };
  }, []);

  if (!isReady) return <Splash step={step} />;

  return (
    <QueryClientProvider client={queryClient}>
      <ReferralSync />
      <FirstConnectGuide />
      {children}
      <WalletConnectModal />
      <ToastProvider />
    </QueryClientProvider>
  );
}
