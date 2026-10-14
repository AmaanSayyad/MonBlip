import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const API = 'https://intents-api.aurora.dev/api';
const quoteFile = path.join(process.cwd(), '.data', 'aurora-quote.json');

function appKey() {
  const key = process.env.AURORA_INTENTS_API_KEY?.trim();
  if (!key) {
    throw new Error('AURORA_INTENTS_API_KEY is not set. Create one at https://studio.aurora.dev');
  }
  return key;
}

type ListedToken = { assetId?: string; symbol?: string; blockchain?: string };

let listedDestination: { assetId: string; symbol: string; at: number } | null = null;

/**
 * Aurora's live list has no Monad AUSD. MON is on that list and is a play asset,
 * so a quote lands MON unless AUSD appears or AURORA_MONAD_AUSD_ASSET overrides it.
 */
async function destinationAsset(): Promise<{ assetId: string; symbol: string }> {
  const override = process.env.AURORA_MONAD_AUSD_ASSET?.trim();
  if (override) return { assetId: override, symbol: 'AUSD' };
  if (listedDestination && Date.now() - listedDestination.at < 10 * 60 * 1000) {
    return listedDestination;
  }
  const key = appKey();
  const response = await fetch(`${API}/tokens/${key}`, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || 'Aurora token list is unavailable');
  }
  const tokens = (body.tokens || []) as ListedToken[];
  const onMonad = tokens.filter((token) => token.blockchain === 'monad' && token.assetId);
  const chosen = onMonad.find((token) => token.symbol === 'AUSD') || onMonad.find((token) => token.symbol === 'MON');
  if (!chosen?.assetId || !chosen.symbol) {
    throw new Error('Aurora does not list MON or AUSD on Monad for this key');
  }
  listedDestination = { assetId: chosen.assetId, symbol: chosen.symbol, at: Date.now() };
  return listedDestination;
}

async function savedQuote() {
  try {
    return JSON.parse(await readFile(quoteFile, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function rememberQuote(payload: Record<string, unknown>) {
  await mkdir(path.dirname(quoteFile), { recursive: true });
  await writeFile(quoteFile, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }), { mode: 0o600 });
}

export async function GET(request: NextRequest) {
  const latest = request.nextUrl.searchParams.get('latest');
  let depositAddress = request.nextUrl.searchParams.get('depositAddress') || '';
  let depositMemo = request.nextUrl.searchParams.get('depositMemo');
  if (latest === '1' && !depositAddress) {
    const saved = await savedQuote();
    const nested = saved?.quote as { depositAddress?: string; depositMemo?: string } | undefined;
    depositAddress = typeof saved?.depositAddress === 'string'
      ? saved.depositAddress
      : typeof nested?.depositAddress === 'string'
        ? nested.depositAddress
        : '';
    if (!depositMemo && typeof saved?.depositMemo === 'string') depositMemo = saved.depositMemo;
    if (!depositMemo && typeof nested?.depositMemo === 'string') depositMemo = nested.depositMemo;
    if (!depositAddress) return NextResponse.json({ quote: null });
  }
  if (!depositAddress) {
    return NextResponse.json({ error: 'depositAddress is required' }, { status: 400 });
  }
  try {
    const key = appKey();
    const params = new URLSearchParams({ depositAddress });
    if (depositMemo) params.set('depositMemo', depositMemo);
    const status = await fetch(`${API}/status/${key}?${params}`, { cache: 'no-store' });
    const payload = await status.json().catch(() => ({}));
    if (latest === '1') {
      const saved = await savedQuote();
      const live = typeof payload?.status === 'string' ? payload.status : null;
      if (saved && live) await rememberQuote({ ...saved, status: live });
      return NextResponse.json(
        { quote: saved, status: payload },
        { status: status.ok ? 200 : status.status },
      );
    }
    return NextResponse.json(payload, { status: status.ok ? 200 : status.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Aurora Intents is unavailable';
    return NextResponse.json({ error: message }, { status: message.includes('AURORA_INTENTS_API_KEY') ? 503 : 502 });
  }
}

/**
 * Swap API quote. The user sends the origin asset to depositAddress.
 * Aurora delivers MON on Monad. A failed swap refunds refundTo.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const recipient = String(body.recipient || '');
  const amount = String(body.amount || '');
  const originAsset = String(body.originAsset || '');
  const refundTo = String(body.refundTo || '');
  if (!recipient.startsWith('0x') || !amount || !originAsset || !refundTo) {
    return NextResponse.json(
      { error: 'recipient, amount, originAsset, and refundTo are required' },
      { status: 400 },
    );
  }

  try {
    const key = appKey();
    const destination = await destinationAsset();
    const quote = await fetch(`${API}/quote/${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dry: false,
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        originAsset,
        depositType: 'ORIGIN_CHAIN',
        destinationAsset: destination.assetId,
        amount,
        recipient,
        recipientType: 'DESTINATION_CHAIN',
        refundTo,
        refundType: 'ORIGIN_CHAIN',
        deadline: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        referral: 'monblip',
      }),
      cache: 'no-store',
    });
    const payload = await quote.json().catch(() => ({}));
    if (quote.ok && (payload?.quote?.depositAddress || payload?.depositAddress)) {
      await rememberQuote({
        ...payload,
        destinationSymbol: destination.symbol,
        destinationAsset: destination.assetId,
        status: 'PENDING_DEPOSIT',
      });
    }
    return NextResponse.json(
      { ...payload, destinationSymbol: destination.symbol, destinationAsset: destination.assetId },
      { status: quote.ok ? 200 : quote.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Aurora Intents is unavailable';
    return NextResponse.json({ error: message }, { status: message.includes('AURORA_INTENTS_API_KEY') ? 503 : 502 });
  }
}
