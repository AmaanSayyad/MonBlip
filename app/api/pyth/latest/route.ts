import { NextRequest, NextResponse } from 'next/server';
import { PRICE_FEED_IDS } from '@/lib/utils/priceFeed';
import { fetchBybitDayChanges } from '@/lib/server/bybitTickers';
import { fetchYahooDayChanges } from '@/lib/server/publicQuotes';
import { fetchPythLatestPrices } from '@/lib/server/pythLatest';

async function dayMoves(assets: string[]) {
  const [bybit, yahoo] = await Promise.all([
    fetchBybitDayChanges(assets).catch(() => ({}) as Partial<Record<string, number>>),
    fetchYahooDayChanges(assets).catch(() => ({}) as Partial<Record<string, number>>),
  ]);
  const moves: Partial<Record<string, number>> = { ...yahoo, ...bybit };
  return moves;
}

export async function GET(request: NextRequest) {
  const asset = request.nextUrl.searchParams.get('asset');
  const requestedAssets = asset ? [asset] : Object.keys(PRICE_FEED_IDS);
  const [prices, moves] = await Promise.all([
    fetchPythLatestPrices(requestedAssets),
    dayMoves(requestedAssets),
  ]);
  return NextResponse.json({ prices, moves });
}

export async function POST(request: NextRequest) {
  let requestedAssets: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.assets)) {
      requestedAssets = body.assets.filter((v: unknown) => typeof v === 'string');
    }
  } catch {
    // ignore invalid JSON and fall back below
  }

  if (requestedAssets.length === 0) requestedAssets = Object.keys(PRICE_FEED_IDS);
  const [prices, moves] = await Promise.all([
    fetchPythLatestPrices(requestedAssets),
    dayMoves(requestedAssets),
  ]);
  return NextResponse.json({ prices, moves });
}
