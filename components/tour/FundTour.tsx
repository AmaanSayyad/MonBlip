'use client';

import { SpotlightTour } from '@/components/tour/SpotlightTour';

const STEPS = [
  {
    id: 'fund-intro',
    target: '[data-tour="fund-intro"]',
    title: 'What this page does',
    content: 'Aurora takes ETH, USDT, or NEAR on their own chain and delivers MON to this Monad wallet. AUSD is not on Aurora’s Monad list, so MON is what arrives.',
    position: 'bottom' as const,
  },
  {
    id: 'fund-wallet',
    target: '[data-tour="fund-wallet"]',
    title: 'Where MON arrives',
    content: 'The connected wallet is the Monad recipient. After Aurora finishes, deposit that MON on Trade if you want it in the house balance.',
    position: 'right' as const,
  },
  {
    id: 'fund-source',
    target: '[data-tour="fund-source"]',
    title: 'What you send',
    content: 'Pick the origin token and amount. The refund address is on that same chain. If the swap fails, the origin asset goes back there.',
    position: 'left' as const,
  },
  {
    id: 'fund-quote',
    target: '[data-tour="fund-quote"]',
    title: 'The deposit address',
    content: 'Aurora returns one address. Send the quoted amount there from the origin chain. This page follows the status until MON arrives or the swap is refunded.',
    position: 'top' as const,
  },
];

export function FundTour({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <SpotlightTour isOpen={isOpen} onClose={onClose} steps={STEPS} />;
}
