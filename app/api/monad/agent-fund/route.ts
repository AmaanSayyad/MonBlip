import { POST as creditDeposit } from '@/app/api/balance/deposit/route';
import { NextRequest, NextResponse } from 'next/server';

const CAP = 10;

/** Credit a house balance only after an Agent Wallet transfer is already on Monad. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userAddress = typeof body.userAddress === 'string' ? body.userAddress : '';
  const txHash = typeof body.txHash === 'string' ? body.txHash : '';
  const currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : '';
  const amount = Number(body.amount);
  if (!userAddress.startsWith('0x') || !txHash.startsWith('0x') || (currency !== 'AUSD' && currency !== 'MON')) {
    return NextResponse.json({ error: 'userAddress, txHash, and currency are required' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > CAP) {
    return NextResponse.json({ error: `An agent fund is capped at ${CAP} ${currency}.` }, { status: 400 });
  }
  const secret = process.env.BALANCE_INTERNAL_SECRET?.trim();
  const headers = new Headers({ 'content-type': 'application/json' });
  if (secret) headers.set('authorization', `Bearer ${secret}`);
  return creditDeposit(
    new NextRequest(new URL('/api/balance/deposit', request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({ userAddress, amount, txHash, currency }),
    }),
  );
}
