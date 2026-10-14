'use client';

import { SpotlightTour } from '@/components/tour/SpotlightTour';

const STEPS = [
  {
    id: 'fund-intro',
    target: '[data-tour="fund-intro"]',
    title: 'Fund MON from any chain',
    content: 'Aurora takes a token from another chain, such as ETH, SOL, USDC or NEAR, and delivers MON to your Monad wallet. One transfer from you, Aurora does the swap.',
    position: 'bottom' as const,
  },
  {
    id: 'fund-flow',
    target: '[data-tour="fund-flow"]',
    title: 'Your path to MON',
    content: 'Four steps that update live as you pick a token, send it, and Aurora swaps.',
    howTo: [
      'A green check means the step is done.',
      'The pulsing purple step is the one happening now.',
      'Click any step to jump to its panel.',
    ],
    position: 'bottom' as const,
  },
  {
    id: 'fund-source',
    target: '[data-tour="fund-source"]',
    title: 'You send',
    content: 'Tap a quick pick or Change to search every token Aurora lists. Enter the amount, and the refund address on that chain fills in from MetaMask.',
    win: 'Fastest routes: Solana, NEAR and Arbitrum.',
    position: 'left' as const,
  },
  {
    id: 'fund-wallet',
    target: '[data-tour="fund-wallet"]',
    title: 'You receive',
    content: 'An estimate of the MON you get, from live prices, and the Monad wallet it lands in. Aurora quotes the exact amount when you deposit.',
    position: 'left' as const,
  },
  {
    id: 'fund-quote',
    target: '[data-tour="fund-quote"]',
    title: 'Deposit in one click',
    content: 'On EVM chains and Solana, Deposit opens MetaMask with the transfer filled in. Approve it and this panel follows the swap with a live timer until MON arrives.',
    howTo: [
      'Most chains land in 1 to 10 minutes.',
      'You can leave the page. The status picks up when you return.',
      'A failed swap refunds the token to your refund address.',
    ],
    position: 'right' as const,
  },
];

export function FundTour({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <SpotlightTour isOpen={isOpen} onClose={onClose} steps={STEPS} />;
}
