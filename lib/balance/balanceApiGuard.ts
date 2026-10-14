import { NextRequest, NextResponse } from 'next/server';
import {
  BALANCE_SESSION_COOKIE,
  LEGACY_BALANCE_SESSION_COOKIE,
  verifyBalanceSessionCookieValue,
} from '@/lib/balance/balanceSession';

const HEADER = 'x-monblip-balance-key';
const LEGACY_HEADER = 'x-bynomo-balance-key';

function getAllowedOrigins(request: NextRequest): Set<string> {
  return new Set(
    [
      request.nextUrl.origin,
      process.env.NEXT_PUBLIC_APP_URL?.trim(),
    ].filter((value): value is string => Boolean(value)),
  );
}

function matchesAllowedOrigin(urlValue: string | null, allowedOrigins: Set<string>): boolean {
  if (!urlValue) return false;
  try {
    return allowedOrigins.has(new URL(urlValue).origin);
  } catch {
    return false;
  }
}

/**
 * When `BALANCE_INTERNAL_SECRET` is set in production, balance mutation routes require one of:
 * 1) Valid HttpOnly cookie from POST /api/balance/session (signed with the secret — never shipped to the client), or
 * 2) `Authorization: Bearer <BALANCE_INTERNAL_SECRET>` for trusted server-side / automation callers.
 *
 * The browser cookie is `monblip_balance_gate`. An older `bynomo_balance_gate` cookie is still accepted.
 * An older `x-bynomo-balance-key` header is still accepted. Prefer the cookie.
 */
export function assertBalanceApiAuthorized(request: NextRequest): NextResponse | null {
  const secret = process.env.BALANCE_INTERNAL_SECRET?.trim();
  const legacyPublic = process.env.NEXT_PUBLIC_BALANCE_API_KEY?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Balance API auth is not configured on server.' },
        { status: 503 },
      );
    }
    return null;
  }

  const bearerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (bearerToken && bearerToken === secret) {
    return null;
  }

  const cookieVal = request.cookies.get(BALANCE_SESSION_COOKIE)?.value
    || request.cookies.get(LEGACY_BALANCE_SESSION_COOKIE)?.value;
  if (verifyBalanceSessionCookieValue(cookieVal)) {
    return null;
  }

  const browserKey = request.headers.get(HEADER)?.trim() || request.headers.get(LEGACY_HEADER)?.trim();
  if (legacyPublic && browserKey === legacyPublic) {
    const allowedOrigins = getAllowedOrigins(request);
    const isFirstPartyBrowserRequest =
      matchesAllowedOrigin(request.headers.get('origin'), allowedOrigins) ||
      matchesAllowedOrigin(request.headers.get('referer'), allowedOrigins);
    if (isFirstPartyBrowserRequest) {
      return null;
    }
    return NextResponse.json({ error: 'Unauthorized origin' }, { status: 401 });
  }

  if (browserKey && browserKey === secret) {
    return NextResponse.json(
      { error: 'Use POST /api/balance/session for browser auth or Bearer for server callers.' },
      { status: 401 },
    );
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
