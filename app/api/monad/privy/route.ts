import { NextRequest, NextResponse } from 'next/server';
import { authorizePrivyPayout, PrivyPolicyError, privyPayoutStatus } from '@/lib/monad/privyPayout';

export async function GET() {
  return NextResponse.json(privyPayoutStatus());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const recipient = typeof body.recipient === 'string' ? body.recipient : '';
  const asset = body.asset === 'MON' ? 'MON' : 'AUSD';
  const amount = Number(body.amount);
  try {
    const payout = await authorizePrivyPayout({ recipient, amount, asset });
    if (!payout.configured) {
      return NextResponse.json({
        ...privyPayoutStatus(),
        error: 'Privy payout wallet is not configured. Set PRIVY_APP_ID, PRIVY_APP_SECRET, and PRIVY_PAYOUT_WALLET_ID from https://dashboard.privy.io',
      }, { status: 503 });
    }
    return NextResponse.json({ ...payout, ...privyPayoutStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Privy could not sign the payout';
    const status = error instanceof PrivyPolicyError ? 403 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
