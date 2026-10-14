'use client';

import React, { useState, useRef } from 'react';
import { GameBoard } from '@/components/game';
import { BetHistory, MiniHistory } from '@/components/history';
import { WalletConnect, WalletInfo } from '@/components/wallet';
import { QuickTour } from '@/components/tour/QuickTour';
import { PriceTicker } from '@/components/ui/PriceTicker';
import { useStore, useUserTier } from '@/lib/store';

export default function Home() {
  const isTourOpen = useStore((state) => state.isTourOpen);
  const setIsTourOpen = useStore((state) => state.setIsTourOpen);
  return (
    <div className="h-full w-full bg-black overflow-hidden relative flex flex-col">
      {/* Live price ticker strip */}
      <PriceTicker />

      {/* Game board fills remaining height */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <GameBoard />
        <MiniHistory />
      </div>

      {/* Tour Component */}
      <QuickTour isOpen={isTourOpen} onClose={() => setIsTourOpen(false)} />
    </div>
  );
}
