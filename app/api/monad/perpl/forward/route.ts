import { NextRequest, NextResponse } from 'next/server';

const PERPL = 'https://app.perpl.xyz/api';
const ALLOWED = new Set([
  '/v1/api-key/payload',
  '/v1/api-key/enroll',
  '/v1/trading/wallet',
  '/v1/trading/orders',
  '/v1/trading/fills',
  '/v1/pub/context',
]);

/**
 * Perpl rejects unknown browser origins. This proxy is limited to the
 * enrollment and trading paths and presents the origin Perpl already accepts.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const method = body?.method === 'GET' ? 'GET' : 'POST';
  const target = typeof body?.target === 'string' ? body.target : '';
  const path = target.split('?')[0];
  if (!ALLOWED.has(path)) {
    return NextResponse.json({ error: 'That Perpl path is not available from MonBlip' }, { status: 400 });
  }
  const payload = typeof body?.body === 'string' ? body.body : '';
  const incoming = (body?.headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = {
    Origin: 'https://app.perpl.xyz',
    Accept: 'application/json',
  };
  if (payload) headers['Content-Type'] = 'application/json';
  for (const name of ['X-API-Key', 'X-API-Timestamp', 'X-API-Nonce', 'X-API-Signature']) {
    const value = incoming[name] || incoming[name.toLowerCase()];
    if (typeof value === 'string' && value.length > 0 && value.length < 4096) headers[name] = value;
  }

  const response = await fetch(`${PERPL}${target}`, {
    method,
    headers,
    body: method === 'POST' ? payload : undefined,
    cache: 'no-store',
  });
  const text = await response.text();
  return new NextResponse(text || '{}', {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}
