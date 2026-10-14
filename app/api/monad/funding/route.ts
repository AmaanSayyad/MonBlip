import { NextRequest, NextResponse } from 'next/server';
import { traderFunding } from '@/lib/monad/hypersyncFunding';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') || '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'A wallet address is required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await traderFunding(address));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HyperSync did not return funding history';
    const missing = message.includes('ENVIO_API_TOKEN');
    return NextResponse.json({ error: message }, { status: missing ? 503 : 502 });
  }
}
