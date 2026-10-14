import { NextRequest, NextResponse } from 'next/server';
import { readWallet } from '@/lib/monad/nansen';

export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get('address') || '';
  if (!address.startsWith('0x') || address.length !== 42) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await readWallet(address));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nansen is unavailable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
