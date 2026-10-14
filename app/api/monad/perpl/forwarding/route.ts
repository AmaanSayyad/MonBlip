import { NextRequest, NextResponse } from 'next/server';
import { setHouseForwarding } from '@/lib/monad/perplHouse';
import { perplForwardingMessage } from '@/lib/monad/perplClaim';
import { checkHouseOperator } from '@/lib/monad/perplOperator';

export const maxDuration = 60;

/** Turns Perpl API order forwarding on or off for the house account. A listed passkey signs the request. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.allow !== 'boolean') {
    return NextResponse.json({ error: 'allow must be true or false' }, { status: 400 });
  }
  const allow: boolean = body.allow;
  const denied = await checkHouseOperator({
    ...body,
    message: (address, issuedAt) => perplForwardingMessage(address, allow, issuedAt),
  });
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    return NextResponse.json(await setHouseForwarding(allow));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Forwarding could not be changed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
