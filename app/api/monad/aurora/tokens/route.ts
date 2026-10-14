import { NextResponse } from 'next/server';
import { isOriginToken, type AuroraToken } from '@/lib/aurora/catalog';

const API = 'https://intents-api.aurora.dev/api';
const TTL_MS = 10 * 60 * 1000;

let cached: { tokens: AuroraToken[]; monPrice: number | null; at: number } | null = null;

type ListedToken = {
  assetId?: string;
  symbol?: string;
  blockchain?: string;
  decimals?: number;
  price?: number | string | null;
  contractAddress?: string | null;
};

function readPrice(value: ListedToken['price']) {
  const price = value == null ? null : Number(value);
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ tokens: cached.tokens, monPrice: cached.monPrice });
  }
  const key = process.env.AURORA_INTENTS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: 'AURORA_INTENTS_API_KEY is not set' }, { status: 503 });
  }
  try {
    const response = await fetch(`${API}/tokens/${key}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: body.message || 'Aurora token list is unavailable' }, { status: 502 });
    }
    const listed = (body.tokens || []) as ListedToken[];
    const monPrice = readPrice(listed.find((token) => token.blockchain === 'monad' && token.symbol === 'MON')?.price);
    const tokens = listed
      .filter((token): token is Required<Pick<ListedToken, 'assetId' | 'symbol' | 'blockchain' | 'decimals'>> & ListedToken =>
        Boolean(token.assetId && token.symbol && token.blockchain && typeof token.decimals === 'number'))
      .map((token) => ({
        assetId: token.assetId,
        symbol: token.symbol,
        blockchain: token.blockchain,
        decimals: token.decimals,
        price: readPrice(token.price),
        contract: token.contractAddress || null,
      }))
      .filter(isOriginToken);
    cached = { tokens, monPrice, at: Date.now() };
    return NextResponse.json({ tokens, monPrice });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Aurora token list is unavailable' },
      { status: 502 },
    );
  }
}
