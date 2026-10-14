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

export function Providers({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    let cancelled = false;
    let stopPriceFeed: (() => void) | undefined;

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
        const { ensureBalanceSession } = await import('@/lib/balance/balanceClientHeaders');
        await ensureBalanceSession().catch(() => {});
        const { restoreMetaMask } = await import('@/lib/monad/injectedWallet');
        await restoreMetaMask().catch(() => {});
        const restored = useOverflowStore.getState();
        if (restored.address) await fetchHistory(restored.address).catch(() => {});
        if (!cancelled) setIsReady(true);
      } catch (error) {
        console.error('Error initializing app:', error);
        if (!cancelled) setIsReady(true);
      }
    };

    void initializeApp();
    return () => {
      cancelled = true;
      stopPriceFeed?.();
    };
  }, []);

  if (!isReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black">
        <div className="relative h-16 w-16">
          <span className="absolute inset-0 rounded-full border-2 border-[#7005FC]/15" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#7005FC]" />
        </div>
        <p className="mt-6 text-sm font-medium tracking-[0.28em] text-[#ADAAB2]">MonBlip</p>
      </div>
    );
  }

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
