import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MonBlip',
    short_name: 'MonBlip',
    description: 'Short charts for crypto, stocks, metals, and FX on Monad. Sign in with a passkey, hold AUSD, trade on Perpl.',
    id: '/',
    start_url: '/trade',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#070010',
    theme_color: '#070010',
    categories: ['finance'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Trade', url: '/trade' },
      { name: 'Perpl long', url: '/perpl' },
      { name: 'Fund from any chain', url: '/fund' },
    ],
  };
}
