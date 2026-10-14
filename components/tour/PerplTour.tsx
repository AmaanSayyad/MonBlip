'use client';

import { SpotlightTour } from '@/components/tour/SpotlightTour';

const STEPS = [
  {
    id: 'perpl-intro',
    target: '[data-tour="perpl-intro"]',
    title: 'What this page does',
    content: 'This is separate from the short-chart desk. It opens a Perpl account with AUSD on Monad and sends a 1 MON long. Perpl holds the margin.',
    position: 'bottom' as const,
  },
  {
    id: 'perpl-passkey',
    target: '[data-tour="perpl-passkey"]',
    title: 'Sign in with Mera',
    content: 'The passkey is the trading account. It approves the Perpl trade key. The desk wallet does not sign this order.',
    position: 'right' as const,
  },
  {
    id: 'perpl-balances',
    target: '[data-tour="perpl-balances"]',
    title: 'Two AUSD balances',
    content: 'Wallet AUSD sits in the passkey. Perpl takes the account deposit from there. House AUSD is only for short-chart rounds.',
    position: 'left' as const,
  },
  {
    id: 'perpl-order',
    target: '[data-tour="perpl-order"]',
    title: 'The MON long',
    content: 'Opening the account takes 10 AUSD from the passkey, plus a little MON for gas. The order is a 1 MON market long at 1×. Perpl accepts or declines it.',
    position: 'top' as const,
  },
];

export function PerplTour({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <SpotlightTour isOpen={isOpen} onClose={onClose} steps={STEPS} />;
}
