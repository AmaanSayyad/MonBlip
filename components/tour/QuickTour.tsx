'use client';

import React, { useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { SpotlightTour, type SpotlightStep } from '@/components/tour/SpotlightTour';

export const QuickTour: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const isConnected = useStore((state) => state.isConnected);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const setGameMode = useStore((state) => state.setGameMode);
  const setIsIndicatorsOpen = useStore((state) => state.setIsIndicatorsOpen);

  const steps: SpotlightStep[] = useMemo(() => [
    {
      id: 'price',
      target: '[data-tour="price-display"]',
      title: 'The live price',
      content: 'The number and the line are the price a round settles on. If a name has no quote, it stays blank and is not settled.',
      howTo: ['The price refreshes about once a second.', 'The line on the chart is that same price.'],
      position: 'bottom',
    },
    {
      id: 'asset',
      target: '[data-tour="asset-selector"]',
      title: 'Pick a market',
      content: 'Trade crypto, stocks, metals, and FX. The chart follows the name you select.',
      howTo: ['Open the asset menu.', 'Choose a name. The chart switches immediately.', 'Names you pin show up as chips under the menu.'],
      position: 'bottom',
    },
    {
      id: 'connect',
      target: '[data-tour="connect-button"]',
      title: isConnected ? 'Your account' : 'Unlock',
      content: isConnected
        ? 'You are in. The house balance is AUSD or MON on Monad. Switch the asset from the wallet menu.'
        : 'Unlock with your passkey, or use MetaMask if this browser already holds MON.',
      howTo: ['One passkey opens the account. Rounds stay prompt-free for 15 minutes.', 'A deposit or a withdrawal asks for the passkey again.'],
      position: 'bottom',
    },
    {
      id: 'wallet',
      target: '[data-tour="deposit-section"]',
      fallback: '[data-tour="wallet-tab"]',
      title: 'House balance',
      content: 'A round does not send a transaction. It debits the AUSD or MON house balance. A win pays the stake times the multiplier back into that balance. A miss pays zero.',
      howTo: ['Open Wallet and deposit AUSD or MON to the Monad treasury.', 'Withdraw from the same balance, in the same asset.'],
      position: 'left',
    },
    {
      id: 'modes',
      target: '[data-tour="game-mode-toggle"]',
      title: 'Three ways to trade',
      content: 'Classic is higher or lower. Box is a cell on the grid. Draw is a band you mark on the chart.',
      position: 'left',
    },
    {
      id: 'stake',
      target: '[data-tour="stake-controls"]',
      title: 'Stake and time',
      content: 'Set how much to risk, then how long the round runs. Classic runs from 5 seconds to 1 minute.',
      howTo: ['Tap a preset or type a stake in AUSD or MON.', 'Classic pays 1.75× at 5s, then 1.80×, 1.85×, 1.90×, and 1.95× at 1 minute.'],
      position: 'left',
    },
    {
      id: 'direction',
      target: '[data-tour="direction-buttons"]',
      title: 'Higher or lower',
      content: 'Classic is a direction on the close. The stake leaves the house balance when you tap.',
      howTo: ['Higher wins if the close is above the price at entry.', 'Lower wins if the close is below it.', 'A tie pays zero.'],
      win: 'A win pays stake × the multiplier on the time you picked.',
      position: 'left',
    },
    {
      id: 'box',
      target: '[data-tour="box-mode"]',
      title: 'Box',
      content: 'The chart becomes a grid of price cells. Tap one. Cells farther from the live price pay more.',
      howTo: ['Set the stake first.', 'Tap a cell in a future time column.'],
      win: 'You win if the price is inside that cell when the column expires.',
      position: 'left',
    },
    {
      id: 'draw',
      target: '[data-tour="draw-mode"]',
      title: 'Draw',
      content: 'You mark the price band and the time by dragging on the chart, to the right of the live price.',
      howTo: ['Set the stake, then drag a rectangle on the chart.', 'Release to preview the multiplier, then confirm.'],
      win: 'You win if the close at the end of the box is inside the band you drew.',
      position: 'left',
    },
    {
      id: 'blitz',
      target: '[data-tour="blitz-panel"]',
      fallback: '[data-tour="blitz-tab"]',
      title: 'Blitz',
      content: 'Blitz is an overlay on Box. A window opens every 3 minutes and doubles the marked cells.',
      howTo: ['The entry fee is a small AUSD transfer to the treasury.', 'Marked Box cells pay double until the timer ends.'],
      position: 'left',
    },
    {
      id: 'indicators',
      target: '[data-tour="indicators-panel"]',
      fallback: '[data-tour="indicators-trigger"]',
      title: 'Indicators',
      content: 'These sit on the chart. They do not change how a round settles.',
      howTo: ['Moving average is the last 20 prices.', 'Bollinger wraps that average. Alligator draws jaw, teeth, and lips.', 'RSI sits in its own panel under the price.'],
      position: 'left',
    },
    {
      id: 'history',
      target: '[data-tour="history-panel"]',
      fallback: '[data-tour="active-bets"]',
      title: 'History',
      content: 'Your last settled trades, with the payout in AUSD or MON.',
      howTo: ['Green is a win. Red is a miss.', 'It keeps the last 10 rounds from this session.'],
      position: 'left',
    },
    {
      id: 'board',
      target: '[data-tour="board-link"]',
      fallback: '[data-tour="nav-menu"]',
      title: 'The board',
      content: 'The leaderboard ranks settled rounds by net profit on Monad.',
      howTo: ['Open the menu and choose Leaderboard.', 'Your rank appears once this wallet has a settled round.'],
      position: 'bottom',
    },
  ], [isConnected]);

  useEffect(() => {
    if (!isOpen) {
      setIsIndicatorsOpen(false);
      window.dispatchEvent(new Event('monblip-tour-history-close'));
      window.dispatchEvent(new Event('monblip-tour-menu-close'));
    }
  }, [isOpen, setIsIndicatorsOpen]);

  const onStep = (step: SpotlightStep) => {
    if (step.id === 'wallet') setActiveTab('wallet');
    else if (step.id === 'blitz') setActiveTab('blitz');
    else setActiveTab('bet');
    if (step.id === 'box' || step.id === 'blitz') setGameMode('box');
    else if (step.id === 'draw') setGameMode('draw');
    else setGameMode('binomo');
    setIsIndicatorsOpen(step.id === 'indicators');
    window.dispatchEvent(new Event(step.id === 'history' ? 'monblip-tour-history' : 'monblip-tour-history-close'));
    window.dispatchEvent(new Event(step.id === 'board' ? 'monblip-tour-menu' : 'monblip-tour-menu-close'));
  };

  return <SpotlightTour isOpen={isOpen} onClose={onClose} steps={steps} onStep={onStep} />;
};
