import { NextRequest, NextResponse } from 'next/server';
import { closeFromFeeds, latestClose, recordClose } from '@/lib/monad/creClose';

/**
 * Chainlink CRE is the closer. The workflow reads the BTC price and AUSD on Monad,
 * then posts the round here. Closes are stored on disk so a restart keeps the last one.
 * Until the workflow is deployed to CRE, a round close from the desk runs those same reads.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRE_WEBHOOK_SECRET?.trim();
  const fromWorkflow = Boolean(secret) && request.headers.get('x-cre-secret') === secret;
  if (secret && request.headers.get('x-cre-secret') !== secret && request.headers.get('x-cre-runner') === 'workflow') {
    return NextResponse.json({ error: 'CRE secret rejected' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const strike = Number(body.strike);
  const direction = body.direction === 'DOWN' ? 'DOWN' : 'UP';
  if (!Number.isFinite(strike)) {
    return NextResponse.json({ error: 'strike is required' }, { status: 400 });
  }

  try {
    const price = Number(body.price);
    if (!Number.isFinite(price)) {
      const close = await closeFromFeeds({
        betId: typeof body.betId === 'string' ? body.betId : null,
        direction,
        strike,
        symbol: typeof body.symbol === 'string' ? body.symbol : 'BTC',
      });
      return NextResponse.json(close);
    }

    const decimals = Number(body.ausdDecimals);
    const close = await recordClose({
      betId: typeof body.betId === 'string' ? body.betId : null,
      symbol: typeof body.symbol === 'string' ? body.symbol : 'BTC',
      direction,
      strike,
      price,
      won: direction === 'UP' ? price > strike : price < strike,
      ausdDecimals: Number.isFinite(decimals) ? decimals : null,
      chain: typeof body.chain === 'string' ? body.chain : 'monad-mainnet',
      settledBy: 'chainlink-cre',
      runner: fromWorkflow || (Number.isFinite(decimals) && body.settledBy === 'chainlink-cre')
        ? 'cre-workflow'
        : 'desk',
    });
    return NextResponse.json(close);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The round could not be closed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  const close = await latestClose();
  return NextResponse.json({ close });
}
