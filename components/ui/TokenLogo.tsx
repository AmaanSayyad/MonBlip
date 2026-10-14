export type TokenSymbol = 'AUSD' | 'MON';

/** Inline colors: `.monad-page` remaps light background utilities to the dark page color. */
const TOKENS: Record<TokenSymbol, { src: string; background: string; scale: number }> = {
  AUSD: { src: '/logos/sponsors/agora.svg', background: '#FCFBFF', scale: 0.6 },
  MON: { src: '/logos/chains/monad.svg', background: '#000000', scale: 0.72 },
};

export function TokenLogo({ token, size = 16, className = '' }: { token: TokenSymbol; size?: number; className?: string }) {
  const { src, background, scale } = TOKENS[token];
  const inner = Math.round(size * scale);
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size, background }}
    >
      <img src={src} alt="" width={inner} height={inner} className="object-contain" style={{ width: inner, height: inner }} />
    </span>
  );
}
