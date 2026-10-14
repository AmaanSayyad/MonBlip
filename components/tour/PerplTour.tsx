'use client';

import { SpotlightTour } from '@/components/tour/SpotlightTour';

const STEPS = [
  {
    id: 'perpl-intro',
    target: '[data-tour="perpl-intro"]',
    title: 'A MON long on Perpl',
    content: 'Open a Perpl account with AUSD on Monad and send a 1 MON market long, signed by your Mera passkey. Perpl holds the margin, separate from the short-chart desk.',
    position: 'bottom' as const,
  },
  {
    id: 'perpl-flow',
    target: '[data-tour="perpl-flow"]',
    title: 'Your path to the long',
    content: 'Four steps, checked live against your passkey and balances.',
    howTo: [
      'A green check means the step is ready.',
      'The pulsing purple step is the one to do next.',
      'Click any step to jump to it.',
    ],
    position: 'bottom' as const,
  },
  {
    id: 'perpl-passkey',
    target: '[data-tour="perpl-passkey"]',
    title: 'Sign in with Mera',
    content: 'The passkey is your trading account. It approves the Perpl trade key and every on-chain step. The desk wallet does not sign this order.',
    position: 'right' as const,
  },
  {
    id: 'perpl-balances',
    target: '[data-tour="perpl-balances"]',
    title: 'What the passkey holds',
    content: 'Wallet AUSD and MON for gas, read live from Monad. The first order takes 10 AUSD from here to open the Perpl account.',
    win: 'Short on AUSD? The ticket offers a one-click send from MetaMask.',
    position: 'right' as const,
  },
  {
    id: 'perpl-order',
    target: '[data-tour="perpl-order"]',
    title: 'Place the long',
    content: 'A 1 MON market long at 1×. The first order opens the account and turns on API orders, then sends the long. The result shows whether it filled.',
    position: 'right' as const,
  },
  {
    id: 'perpl-chart',
    target: '[data-tour="perpl-chart"]',
    title: 'MON price',
    content: 'Live MON/USDT perpetual from Bybit with RSI 14. The watchlist switches symbols, and Open in TradingView shows the full chart.',
    position: 'bottom' as const,
  },
  {
    id: 'perpl-withdraw',
    target: '[data-tour="perpl-withdraw"]',
    fallback: '[data-tour="perpl-account"]',
    title: 'Your Perpl account',
    content: 'Everything here belongs to the signed-in passkey: its Perpl balance, margin, open positions and a history of every deposit, order and fill.',
    win: 'Free collateral comes back to the passkey with one withdraw.',
    position: 'left' as const,
  },
  {
    id: 'perpl-forwarding',
    target: '[data-tour="perpl-forwarding"]',
    fallback: '[data-tour="perpl-account"]',
    title: 'API orders switch',
    content: 'When it is on, Perpl routes MonBlip orders to your account. When it is off, the exchange rejects them. The next order turns it on, and the passkey can switch it here.',
    position: 'left' as const,
  },
];

export function PerplTour({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <SpotlightTour isOpen={isOpen} onClose={onClose} steps={STEPS} />;
}
