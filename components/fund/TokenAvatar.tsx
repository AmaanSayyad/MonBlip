'use client';

import { memo } from 'react';
import { chainInfo, displaySymbol, tokenLogo, type AuroraToken } from '@/lib/aurora/catalog';

const NATIVE: Record<string, string> = {
  eth: 'ETH', btc: 'BTC', sol: 'SOL', bsc: 'BNB', near: 'NEAR', tron: 'TRX',
  sui: 'SUI', xrp: 'XRP', stellar: 'XLM', doge: 'DOGE', cardano: 'ADA',
};

const TINTS = ['#7005FC', '#2F80ED', '#00A86B', '#E8833A', '#D6336C', '#0F9FB5', '#8A6CFF', '#C08A00'];

function tint(text: string) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function Initials({ text, size }: { text: string; size: number }) {
  return (
    <span
      className="grid h-full w-full place-items-center rounded-full font-medium text-white"
      style={{ background: tint(text), fontSize: Math.max(8, size * 0.36) }}
    >
      {text.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'}
    </span>
  );
}

function TokenAvatarBase({ token, size = 32 }: { token: Pick<AuroraToken, 'symbol' | 'blockchain'>; size?: number }) {
  const symbol = displaySymbol(token);
  const logo = tokenLogo(symbol);
  const chain = chainInfo(token.blockchain);
  const badge = Math.round(size * 0.46);
  const native = logo != null && (chain.logo === logo || NATIVE[token.blockchain] === symbol);

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="block h-full w-full overflow-hidden rounded-full bg-[#0E0A14] ring-1 ring-white/10">
        {logo ? (
          <img src={logo} alt="" className="h-full w-full object-contain p-[12%]" />
        ) : (
          <Initials text={symbol} size={size} />
        )}
      </span>
      {native ? null : (
        <span
          className="absolute -bottom-0.5 -right-0.5 overflow-hidden rounded-full bg-[#0E0A14] ring-2 ring-[#15111B]"
          style={{ width: badge, height: badge }}
          title={chain.name}
        >
          {chain.logo ? (
            <img src={chain.logo} alt="" className="h-full w-full object-contain p-[10%]" />
          ) : (
            <Initials text={chain.name} size={badge} />
          )}
        </span>
      )}
    </span>
  );
}

export const TokenAvatar = memo(TokenAvatarBase);
