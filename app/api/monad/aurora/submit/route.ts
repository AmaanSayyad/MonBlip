import { NextRequest, NextResponse } from 'next/server';

const API = 'https://intents-api.aurora.dev/api';

/** Tells Aurora which origin-chain transaction paid a deposit address, so it picks the deposit up sooner. */
export async function POST(request: NextRequest) {
  const key = process.env.AURORA_INTENTS_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'AURORA_INTENTS_API_KEY is not set' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  const depositAddress = typeof body.depositAddress === 'string' ? body.depositAddress.trim() : '';
  if (!txHash || !depositAddress || txHash.length > 200 || depositAddress.length > 200) {
    return NextResponse.json({ error: 'txHash and depositAddress are required' }, { status: 400 });
  }
  const payload: Record<string, string> = { txHash, depositAddress };
  if (typeof body.memo === 'string' && body.memo) payload.memo = body.memo;
  const response = await fetch(`${API}/deposit/submit/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(response.ok ? { ok: true, status: data.status ?? null } : { error: data.message || 'Aurora did not take the deposit hash' }, { status: response.ok ? 200 : 502 });
}
