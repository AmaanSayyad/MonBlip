import { defineChain } from 'viem';

/** This build plays on Monad only. */
export const SUPPORTED_NETWORKS = ['MONAD'] as const;
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export function isSupportedNetwork(network: string | null | undefined): network is SupportedNetwork {
  return network === 'MONAD';
}

export const ENABLED_PLAY_CURRENCIES = ['AUSD', 'MON'] as const;
export type PlayCurrency = (typeof ENABLED_PLAY_CURRENCIES)[number];

export function isEnabledPlayCurrency(code: string | null | undefined): code is PlayCurrency {
  const normalized = String(code ?? '').trim().toUpperCase();
  return (ENABLED_PLAY_CURRENCIES as readonly string[]).includes(normalized);
}

export function playCurrency(code: string | null | undefined): PlayCurrency {
  return String(code ?? '').trim().toUpperCase() === 'MON' ? 'MON' : 'AUSD';
}

/** Agora USD on Monad mainnet. 6 decimals. */
export const MONAD_AUSD = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' as const;

export const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://monadvision.com' },
  },
});

export type EvmPlayNetwork = 'MONAD';

export interface EvmChainSpec {
  network: EvmPlayNetwork;
  chainId: number;
  name: string;
  symbol: string;
  rpc: string;
  explorer: string;
  currency: string;
  treasuryEnv: string;
  secretEnv: string;
  token?: { address: `0x${string}`; decimals: number };
}

export const EVM_CHAINS: Record<EvmPlayNetwork, EvmChainSpec> = {
  MONAD: {
    network: 'MONAD',
    chainId: monad.id,
    name: 'Monad',
    symbol: 'AUSD',
    rpc: monad.rpcUrls.default.http[0],
    explorer: monad.blockExplorers.default.url,
    currency: 'AUSD',
    treasuryEnv: 'NEXT_PUBLIC_MONAD_TREASURY_ADDRESS',
    secretEnv: 'MONAD_TREASURY_SECRET_KEY',
    token: { address: MONAD_AUSD, decimals: 6 },
  },
};

export function evmChainForCurrency(currency: string): EvmChainSpec | null {
  return isEnabledPlayCurrency(currency) ? EVM_CHAINS.MONAD : null;
}

export function treasuryAddressFor(network: EvmPlayNetwork): string {
  if (network !== 'MONAD') return '';
  return (process.env.NEXT_PUBLIC_MONAD_TREASURY_ADDRESS || '').trim();
}
