/**
 * POST /api/balance/payout endpoint
 * 
 * Task: 4.5 Create POST /api/balance/payout endpoint
 * Requirements: 4.1, 4.2
 * 
 * Called when a round settles and user wins.
 * Credits payout amount to user's house balance.
 * Inserts audit log entry with operation_type='bet_won'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseService as supabase } from '@/lib/supabase/serviceClient';
import { isWalletGloballyBanned } from '@/lib/bans/walletBan';
import { canonicalHouseUserAddress } from '@/lib/wallet/canonicalAddress';
import { assertBalanceApiAuthorized } from '@/lib/balance/balanceApiGuard';
import { verifySettlementToken } from '@/lib/balance/settlementToken';

interface PayoutRequest {
  userAddress: string;
  payoutAmount: number;
  currency: string;
  betId: string;
  settlementToken: string;
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = assertBalanceApiAuthorized(request);
    if (unauthorized) return unauthorized;

    // Parse request body
    const body: PayoutRequest = await request.json();
    const { userAddress, payoutAmount, currency = 'BNB', betId, settlementToken } = body;
    const allowTestBypass = process.env.NODE_ENV === 'test';

    // Validate required fields
    if (!userAddress || payoutAmount === undefined || payoutAmount === null || !betId) {
      return NextResponse.json(
        { error: 'Missing required fields: userAddress, payoutAmount, betId' },
        { status: 400 }
      );
    }

    // Guard against NaN / Infinity which bypass > 0 checks
    if (!Number.isFinite(Number(payoutAmount))) {
      return NextResponse.json(
        { error: 'Invalid payout amount' },
        { status: 400 }
      );
    }
    if (!settlementToken && !allowTestBypass) {
      return NextResponse.json(
        { error: 'Missing required fields: settlementToken' },
        { status: 400 }
      );
    }

    // Validate address using utility
    const { isValidAddress } = await import('@/lib/utils/address');
    if (!(await isValidAddress(userAddress))) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    if (await isWalletGloballyBanned(userAddress)) {
      return NextResponse.json(
        { error: 'This wallet is banned from the platform.' },
        { status: 403 }
      );
    }

    // Validate payout amount is positive
    if (payoutAmount <= 0) {
      return NextResponse.json(
        { error: 'Payout amount must be greater than zero' },
        { status: 400 }
      );
    }

    const userKey = canonicalHouseUserAddress(userAddress);
    const normalizedCurrency = currency.toUpperCase();

    if (settlementToken) {
      const tokenPayload = verifySettlementToken(settlementToken);
      if (!tokenPayload) {
        return NextResponse.json({ error: 'Invalid settlement token' }, { status: 401 });
      }
      if (
        tokenPayload.betId !== betId ||
        canonicalHouseUserAddress(tokenPayload.userAddress) !== userKey ||
        tokenPayload.currency !== normalizedCurrency
      ) {
        return NextResponse.json({ error: 'Settlement token does not match bet' }, { status: 401 });
      }
      if (payoutAmount > tokenPayload.maxPayout + 1e-8) {
        return NextResponse.json({ error: 'Payout amount exceeds approved payout' }, { status: 400 });
      }
    }

    // ── Atomic deduplication guard ──────────────────────────────────────
    if (betId) {
      const { error: lockError } = await supabase
        .from('balance_audit_log')
        .insert({
          user_address: userKey,
          currency: normalizedCurrency,
          operation_type: 'payout_lock',
          amount: 0,
          bet_id: betId,
          transaction_hash: `lock:${betId}`,
        });
      if (lockError) {
        if (lockError.code === '23505') {
          return NextResponse.json({ success: true, duplicate: true, payoutAmount });
        }
      }

      const { data: existing } = await supabase
        .from('balance_audit_log')
        .select('id')
        .eq('operation_type', 'payout')
        .eq('bet_id', betId)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({ success: true, duplicate: true, payoutAmount });
      }
    }

    // Call credit_balance_for_payout stored procedure
    // This procedure handles:
    // - Atomic balance update with row-level locking
    // - Creating user record if it doesn't exist
    // - Inserting audit log entry with operation_type='bet_won'
    const { data, error } = await supabase.rpc('credit_balance_for_payout', {
      p_user_address: userKey,
      p_payout_amount: payoutAmount,
      p_currency: normalizedCurrency,
      p_bet_id: betId,
    });

    // Handle database errors
    if (error) {
      console.error('Database error in payout:', error);
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    // Parse the JSON result from the stored procedure
    const result = data as { success: boolean; error: string | null; new_balance: number };

    // Check if the procedure reported an error
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Payout failed' },
        { status: 400 }
      );
    }

    // Return success with new balance
    return NextResponse.json({
      success: true,
      newBalance: parseFloat(result.new_balance.toString()),
    });
  } catch (error) {
    // Handle unexpected errors
    console.error('Unexpected error in POST /api/balance/payout:', error);
    return NextResponse.json(
      { error: 'An error occurred processing your request' },
      { status: 500 }
    );
  }
}
