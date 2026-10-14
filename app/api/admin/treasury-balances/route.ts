import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/requireAdminAuth';
import { buildTreasuryBalanceSnapshot } from '@/lib/admin/treasuryBalanceSnapshot';
import {
  balanceTimesUsd,
  fetchCoingeckoTreasuryUsd,
  fetchPythUsdPartial,
  formatUsd,
  usdPerUnit,
} from '@/lib/admin/treasuryBalanceUsd';

/**
 * On-chain treasury EOA balances (read-only RPC) with approximate USD (Pyth + CoinGecko).
 * Requires admin session cookie.
 */
export async function GET(request: NextRequest) {
  const deny = requireAdminAuth(request);
  if (deny) return deny;

  try {
    const snapshot = await buildTreasuryBalanceSnapshot();
    const [pyth, cg] = await Promise.all([
      fetchPythUsdPartial(),
      fetchCoingeckoTreasuryUsd(),
    ]);

    const rows = snapshot.rows.map((r) => {
      const unit = usdPerUnit(r.chain, r.asset, pyth, cg);
      const balanceUsd = balanceTimesUsd(r.balance, unit);
      return {
        ...r,
        unitUsd: unit,
        balanceUsd,
        formattedUsd: formatUsd(balanceUsd),
      };
    });

    return NextResponse.json(
      {
        generatedAt: snapshot.generatedAt,
        rows,
        usdNote:
          'Testnet treasuries are hidden unless ADMIN_TREASURY_SHOW_TESTNET=true on the server. USD is indicative and uses the live price pipeline. USDC and OUSD are treated as about $1.',
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Snapshot failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
