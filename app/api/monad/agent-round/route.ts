import { POST as placeBet } from '@/app/api/balance/bet/route';
import { verifyMessage } from 'ethers';
import { NextRequest, NextResponse } from 'next/server';

const CAP = 10;
const PAYOUT: Record<number, number> = { 5: 1.75, 10: 1.8, 15: 1.85, 30: 1.9, 60: 1.95 };

function roundMessage(input: { direction: string; amount: string; currency: string; duration: number }): string {
  return [
    'MonBlip round',
    `direction:${input.direction}`,
    `amount:${input.amount}`,
    `currency:${input.currency}`,
    `duration:${input.duration}`,
    'asset:BTC',
  ].join('\n');
}

/** Stake house balance only when the Agent Wallet signed this exact round. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const direction = body.direction === 'DOWN' ? 'DOWN' : body.direction === 'UP' ? 'UP' : '';
  const currency = body.currency === 'MON' ? 'MON' : body.currency === 'AUSD' ? 'AUSD' : '';
  const amountText = typeof body.amount === 'string' ? body.amount : '';
  const duration = Number(body.duration);
  const signature = typeof body.signature === 'string' ? body.signature : '';
  const amount = Number(amountText);
  if (!direction || !currency || !/^\d+(\.\d+)?$/.test(amountText) || !PAYOUT[duration] || !signature.startsWith('0x')) {
    return NextResponse.json({ error: 'direction, amount, currency, duration, and signature are required' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > CAP) {
    return NextResponse.json({ error: `An agent round is capped at ${CAP} ${currency}.` }, { status: 400 });
  }
  const message = roundMessage({ direction, amount: amountText, currency, duration });
  let userAddress = '';
  try {
    userAddress = verifyMessage(message, signature);
  } catch {
    return NextResponse.json({ error: 'The Agent Wallet signature does not match this round.' }, { status: 400 });
  }
  const priceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  const priceBody = (await priceResponse.json().catch(() => ({}))) as { price?: string };
  const targetPrice = Number(priceBody.price);
  if (!priceResponse.ok || !Number.isFinite(targetPrice)) {
    return NextResponse.json({ error: 'The BTC price feed did not answer.' }, { status: 502 });
  }
  const secret = process.env.BALANCE_INTERNAL_SECRET?.trim();
  const headers = new Headers({ 'content-type': 'application/json' });
  if (secret) headers.set('authorization', `Bearer ${secret}`);
  return placeBet(
    new NextRequest(new URL('/api/balance/bet', request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userAddress,
        betAmount: amount,
        currency,
        roundId: Date.now(),
        targetPrice,
        isOver: direction === 'UP',
        multiplier: PAYOUT[duration],
        asset: 'BTC',
        betRequestId: `agent:${signature}`,
        targetCell: { id: 9, priceChange: 0, direction, timeframe: duration },
      }),
    }),
  );
}
