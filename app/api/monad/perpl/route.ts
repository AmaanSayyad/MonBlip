import { NextRequest, NextResponse } from 'next/server';
import { signDynamicHedge } from '@/lib/monad/dynamicHedge';
import { readHouseAccount, submitHouseOrder } from '@/lib/monad/perplHouse';

/** Perpl answers 451 to US egress, so its calls leave from Mumbai. */
export const preferredRegion = 'bom1';

/** Read-only: the house Perpl account, its open positions and orders, and what happened to each order. */
export async function GET() {
  try {
    return NextResponse.json(await readHouseAccount(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Perpl account could not be read';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Dynamic's Node SDK holds the hedge key, not the trader's passkey.
 * The house keeps a trade-scoped Ed25519 key, enrolls it with a Dynamic
 * typed-data signature, and sends the offsetting Perpl order.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const direction = body.direction === 'DOWN' ? 'DOWN' : 'UP';
  const notional = Number(body.notional);
  if (!Number.isFinite(notional) || notional <= 0) {
    return NextResponse.json({ error: 'notional is required' }, { status: 400 });
  }

  const contextUrl = 'https://app.perpl.xyz/api/v1/pub/context';
  const contextResponse = await fetch(contextUrl, { cache: 'no-store' });
  if (!contextResponse.ok) {
    return NextResponse.json({ error: 'Perpl context is unavailable' }, { status: 502 });
  }
  const context = await contextResponse.json();
  if (!context || typeof context !== 'object') {
    return NextResponse.json({ error: 'Perpl context is unavailable' }, { status: 502 });
  }
  const marketId = 10;

  try {
    const signed = await signDynamicHedge(`MonBlip Perpl hedge\n${JSON.stringify({ direction, notional, marketId })}`);
    const order = await submitHouseOrder({
      direction,
      notional,
      marketId,
      authorization: signed.signature,
    });
    return NextResponse.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The house hedge could not be sent';
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    const missing = message.includes('not configured');
    return NextResponse.json({
      submitted: false,
      error: cause ? `${message}: ${cause}` : message,
    }, { status: missing ? 503 : 502 });
  }
}
