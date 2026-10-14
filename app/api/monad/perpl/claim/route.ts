import { NextRequest, NextResponse } from 'next/server';
import { claimHouseFunds } from '@/lib/monad/perplHouse';
import { perplClaimMessage } from '@/lib/monad/perplClaim';
import { checkHouseOperator, isHouseOperator } from '@/lib/monad/perplOperator';

export const preferredRegion = 'bom1';
export const maxDuration = 60;

/** Whether `address` may claim and switch forwarding. The UI uses this to enable those controls. */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') ?? '';
  return NextResponse.json({ allowed: isHouseOperator(address) }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Sends the house Perpl collateral plus the hedge wallet's idle AUSD to a passkey
 * listed in PERPL_CLAIM_ADDRESSES. The passkey proves itself with a fresh signature.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const denied = await checkHouseOperator({ ...body, message: perplClaimMessage });
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    return NextResponse.json(await claimHouseFunds(body.address));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The claim could not be sent';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
