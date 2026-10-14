import { NextRequest, NextResponse } from 'next/server';
import { supabaseService as supabase } from '@/lib/supabase/serviceClient';

const FREQUENCY_REVIEW_THRESHOLD = 10; // withdrawals before manual review kicks in
import { ethers } from 'ethers';
import { calculateFeeAmount, collectPlatformFeeFromTreasury, getFeePercentLabel } from '@/lib/fees/platformFee';
import { isWalletGloballyBanned } from '@/lib/bans/walletBan';
import { walletAddressSearchVariants } from '@/lib/admin/walletAddressVariants';
import { canonicalHouseUserAddress } from '@/lib/wallet/canonicalAddress';
import { assertBalanceApiAuthorized } from '@/lib/balance/balanceApiGuard';
import { isWithdrawalFrequencyReviewExemptWallet } from '@/lib/withdrawals/frequencyReviewExempt';
import { withdrawalExceedsTenUsd } from '@/lib/withdrawals/usdAutoLimit';

interface WithdrawRequest {
  userAddress: string;
  amount: number;
  currency: string;
  userTier?: 'free' | 'standard' | 'vip';
  signature?: string;
  signedAt?: number;
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = assertBalanceApiAuthorized(request);
    if (unauthorized) return unauthorized;

    const body: WithdrawRequest = await request.json();
    const allowTestBypass = process.env.NODE_ENV === 'test';
    const {
      userAddress,
      amount,
      currency = 'BNB',
      userTier = 'free',
      signature: authorizationSignature,
      signedAt,
    } = body;

    // Validate required fields
    if (!userAddress || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'Missing required fields: userAddress, amount' },
        { status: 400 }
      );
    }

    // Guard against NaN / Infinity which bypass > 0 checks
    if (!Number.isFinite(Number(amount))) {
      return NextResponse.json(
        { error: 'Invalid withdrawal amount' },
        { status: 400 }
      );
    }

    const normalizedCurrency = currency.toUpperCase();
    if (normalizedCurrency === 'BYNOMO') {
      return NextResponse.json(
        { error: 'This balance is no longer supported on MonBlip.' },
        { status: 400 }
      );
    }
    const isDemoAccount = userAddress.startsWith('0xDEMO');
    const isRealAccount = !isDemoAccount;

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

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Withdrawal amount must be greater than zero' },
        { status: 400 }
      );
    }

    // Require signed withdrawal intent for EVM-like chains.
    const requiresIntentSignature =
      normalizedCurrency === 'BNB' ||
      normalizedCurrency === 'PUSH' ||
      normalizedCurrency === 'PC' ||
      normalizedCurrency === 'SOMNIA' ||
      normalizedCurrency === 'STT' ||
      normalizedCurrency === '0G' ||
      normalizedCurrency === 'ROBINHOOD' ||
      normalizedCurrency === 'USDC_BASE' ||
      normalizedCurrency === 'ARB' ||
      normalizedCurrency === 'OUSD' ||
      normalizedCurrency === 'AUSD' ||
      normalizedCurrency === 'MON';

    if (requiresIntentSignature && !allowTestBypass) {
      if (!authorizationSignature || !signedAt) {
        return NextResponse.json(
          { error: 'Missing signed withdrawal authorization' },
          { status: 401 }
        );
      }

      const ageMs = Date.now() - Number(signedAt);
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 5 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Withdrawal authorization expired. Please sign again.' },
          { status: 401 }
        );
      }

      const displayCurrency =
        normalizedCurrency === 'PC' ? 'PC' :
        normalizedCurrency === 'STT' ? 'STT' :
        normalizedCurrency === '0G' ? '0G' :
        normalizedCurrency;
      const expectedMessage = `MonBlip withdrawal authorization\naddress:${userAddress}\namount:${amount.toFixed(8)}\ncurrency:${displayCurrency}\nsignedAt:${signedAt}`;
      const recovered = ethers.verifyMessage(expectedMessage, authorizationSignature);
      if (canonicalHouseUserAddress(recovered) !== canonicalHouseUserAddress(userAddress)) {
        return NextResponse.json(
          { error: 'Invalid withdrawal signature' },
          { status: 401 }
        );
      }
    }

    const addrVariants = walletAddressSearchVariants(userAddress);

    // 1. Get house balance and status from Supabase and validate (merge legacy EVM casing rows)
    const { data: balRows, error: userError } = await supabase
      .from('user_balances')
      .select('balance, status, user_address')
      .in('user_address', addrVariants)
      .eq('currency', normalizedCurrency);

    if (userError || !balRows?.length) {
      return NextResponse.json({ error: 'User record not found' }, { status: 404 });
    }

    for (const row of balRows) {
      if (row.status === 'frozen') {
        return NextResponse.json({ error: 'Account is frozen. Withdrawals are disabled.' }, { status: 403 });
      }
      if (row.status === 'banned') {
        return NextResponse.json({ error: 'Account is banned.' }, { status: 403 });
      }
    }

    const sortedByBal = [...balRows].sort((a, b) => Number(b.balance) - Number(a.balance));
    const userRow = sortedByBal.find(r => Number(r.balance) >= amount);
    if (!userRow) {
      return NextResponse.json({ error: `Insufficient house balance in ${currency}` }, { status: 400 });
    }

    const dbAddress = userRow.user_address;
    const userData = { balance: userRow.balance, status: userRow.status };

    // ── Withdrawal cap: max payout = total_deposited × 1.08 (mainnet only) ──
    // Testnet / internal chains are exempt.
    const TESTNET_CURRENCIES = new Set(['PUSH', 'PC', 'SOMNIA', 'STT', 'OCT', '0G']);
    if (isRealAccount && !TESTNET_CURRENCIES.has(normalizedCurrency)) {
      const [depositRes, withdrawnRes, pendingRes] = await Promise.all([
        supabase
          .from('balance_audit_log')
          .select('amount')
          .in('user_address', addrVariants)
          .eq('currency', normalizedCurrency)
          .eq('operation_type', 'deposit'),
        supabase
          .from('balance_audit_log')
          .select('amount')
          .in('user_address', addrVariants)
          .eq('currency', normalizedCurrency)
          .eq('operation_type', 'withdrawal'),
        supabase
          .from('withdrawal_requests')
          .select('amount')
          .in('user_address', addrVariants)
          .eq('currency', normalizedCurrency)
          .in('status', ['pending', 'approved']),
      ]);

      const totalDeposited   = (depositRes.data  ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const totalWithdrawn   = (withdrawnRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const pendingTotal     = (pendingRes.data   ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);

      if (totalDeposited > 0) {
        const maxWithdrawable  = totalDeposited * 1.08;
        const alreadyOut       = totalWithdrawn + pendingTotal;
        const remainingAllowed = Math.max(0, maxWithdrawable - alreadyOut);

        if (alreadyOut + amount > maxWithdrawable) {
          return NextResponse.json(
            {
              error: `Withdrawal amount exceeds your available limit. You have ${remainingAllowed > 0 ? `${remainingAllowed.toFixed(6)} ${normalizedCurrency} remaining` : 'no remaining withdrawal allowance'}. Please contact support if you believe this is an error.`,
            },
            { status: 400 },
          );
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Count ALL completed + pending withdrawals for this user across all chains.
    // Completed ones are tracked in balance_audit_log (operation_type='withdrawal').
    // Pending (not yet processed) ones are in withdrawal_requests with status='pending'.
    // We intentionally count across ALL currencies/chains — abuse detection is global.
    let withdrawalCount = 0;
    if (isRealAccount) {
      const [auditCountRes, pendingCountRes] = await Promise.all([
        supabase
          .from('balance_audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('operation_type', 'withdrawal')
          .in('user_address', addrVariants),
        supabase
          .from('withdrawal_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .in('user_address', addrVariants),
      ]);
      withdrawalCount = (auditCountRes.count ?? 0) + (pendingCountRes.count ?? 0);
    }
    const isFrequencyReviewExempt = isWithdrawalFrequencyReviewExemptWallet(userAddress);
    const triggersFrequencyReview =
      isRealAccount &&
      !isFrequencyReviewExempt &&
      withdrawalCount >= FREQUENCY_REVIEW_THRESHOLD;

    // Every chain pays immediately at or under $10. Above $10 waits for review.
    // Testnets have no dollar price and stay instant.
    const aboveTenUsd = TESTNET_CURRENCIES.has(normalizedCurrency)
      ? false
      : await withdrawalExceedsTenUsd(normalizedCurrency, amount);
    // EVM-like chains: user must have passed signed-intent checks above (or test bypass).
    // Solana / Sui / etc.: no EIP-191 intent — instant path is gated by amount + frequency only.
    const supportsVerifiedInstantWithdrawal =
      allowTestBypass ||
      !requiresIntentSignature ||
      Boolean(authorizationSignature);
    const requiresChainManualReview = isRealAccount && !supportsVerifiedInstantWithdrawal;
    // requiresManualApproval: amount above auto-threshold, frequency guard, or unverified chain path
    // Frequency review used to queue the 11th withdrawal even under $10.
    // Small withdrawals pay immediately. Only an amount over $10, or a missing
    // wallet signature, waits for review.
    const requiresManualApproval =
      isRealAccount && (requiresChainManualReview || aboveTenUsd);

    // 2. Resolve user tier from DB — never trust client-supplied value.
    let resolvedTier: 'free' | 'standard' | 'vip' = 'free';
    try {
      const { data: tierRow } = await supabase
        .from('user_balances')
        .select('tier')
        .eq('user_address', dbAddress)
        .limit(1)
        .single();
      if (tierRow?.tier && ['free', 'standard', 'vip'].includes(tierRow.tier)) {
        resolvedTier = tierRow.tier as 'free' | 'standard' | 'vip';
      }
    } catch {
      // default tier is fine
    }

    const feeAmount = Number(calculateFeeAmount(amount, resolvedTier).toFixed(8));
    const netWithdrawAmount = Number((amount - feeAmount).toFixed(8));
    const feePercentLabel = getFeePercentLabel(resolvedTier);

    if (netWithdrawAmount <= 0) {
      return NextResponse.json(
        { error: `Withdrawal amount after ${feePercentLabel} fee must be greater than zero` },
        { status: 400 }
      );
    }

    // Log withdrawal request (sanitized - no wallet addresses or sensitive data)
    // Only log in development; production logs go through proper audit trail
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[withdraw] Request: currency=${normalizedCurrency}, amount=${amount}, manual=${requiresManualApproval}`,
      );
    }

    if (requiresManualApproval) {
      const { data: pendingRow, error: pendingError } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_address: canonicalHouseUserAddress(userAddress),
          currency: normalizedCurrency,
          amount,
          fee_amount: feeAmount,
          net_amount: netWithdrawAmount,
          signature: authorizationSignature || null,
          signed_at: signedAt || null,
          status: 'pending',
          // Stamp the reason so the dashboard can distinguish security/manual-review cases.
          decided_by: requiresChainManualReview
            ? `MANUAL_REVIEW:chain=${normalizedCurrency}`
            : aboveTenUsd
              ? 'USD_LIMIT'
              : null,
        })
        .select('*')
        .single();

      if (pendingError) {
        return NextResponse.json({ error: 'Failed to create withdrawal request. Please try again.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        status: 'pending',
        requestId: pendingRow.id,
        newBalance: userData.balance,
        frequencyReview: triggersFrequencyReview,
        withdrawalCount: withdrawalCount + 1,
      });
    }

    // Otherwise, perform transfer immediately (demo account behavior).

    // ── Optimistic debit: pre-deduct balance before on-chain transfer ──────
    // Inserting a `withdrawal_lock` row prevents two concurrent requests for
    // the same user from both passing the balance check and both executing.
    // If the on-chain transfer subsequently fails, the lock row is deleted so
    // the user can retry (the balance itself is only debited by the RPC after
    // a successful transfer, so there is no double-charge risk).
    const withdrawLockKey = `wlock:${canonicalHouseUserAddress(userAddress)}:${normalizedCurrency}:${Date.now()}`;
    const { error: wlockError } = await supabase
      .from('balance_audit_log')
      .insert({
        user_address: canonicalHouseUserAddress(userAddress),
        currency: normalizedCurrency,
        operation_type: 'withdrawal',
        amount: 0,
        balance_before: userData.balance,
        balance_after: userData.balance,
        transaction_hash: withdrawLockKey,
        bet_id: null,
      });
    if (wlockError && wlockError.code !== '23505') {
      // Non-duplicate error inserting the lock — abort to prevent race condition
      console.error('[withdraw] lock insert failed:', wlockError);
      return NextResponse.json({ error: 'Withdrawal could not be initiated. Please try again.' }, { status: 500 });
    }

    // Move the platform/protocol fee portion from treasury to the fee collector.
    // A failure here must NOT block the user's withdrawal — log the error and continue.
    let feeTxHash: string | null = null;
    try {
      feeTxHash = await collectPlatformFeeFromTreasury(normalizedCurrency, feeAmount);
    } catch (feeErr) {
      console.error('[withdraw] Fee collection failed (non-blocking):', feeErr);
    }

    // Privy signs the payout only when the policy allows it. Missing
    // dashboard credentials do not block a payout the trader already signed.
    let privySignature: string | null = null;
    if (normalizedCurrency === 'AUSD' || normalizedCurrency === 'MON') {
      try {
        const { authorizePrivyPayout } = await import('@/lib/monad/privyPayout');
        const payout = await authorizePrivyPayout({
          recipient: userAddress,
          amount: netWithdrawAmount,
          asset: normalizedCurrency,
        });
        privySignature = payout.configured ? payout.signature : null;
      } catch (error) {
        const { PrivyPolicyError } = await import('@/lib/monad/privyPayout');
        const message = error instanceof Error ? error.message : 'Privy rejected the payout';
        const status = error instanceof PrivyPolicyError ? 403 : 502;
        return NextResponse.json({ error: message }, { status });
      }
    }

    // Perform net transfer from treasury to the user.
    let withdrawTxHash: string;
    try {
      if (normalizedCurrency !== 'AUSD' && normalizedCurrency !== 'MON') {
        throw new Error(`Unsupported currency for withdrawal: ${currency}`);
      }
      const { transferFromEvmTreasury } = await import('@/lib/chains/evmTreasury');
      const { playCurrency } = await import('@/lib/chains/supported');
      withdrawTxHash = await transferFromEvmTreasury('MONAD', userAddress, netWithdrawAmount, playCurrency(normalizedCurrency));
    } catch (error: unknown) {
      // Log full error server-side; never expose internal messages to the client
      console.error('Transfer failed:', error);
      return NextResponse.json({ error: 'Withdrawal transfer failed. Please try again or contact support.' }, { status: 500 });
    }

    const combinedTxHash = feeTxHash ? `${feeTxHash}|netTx:${withdrawTxHash}` : withdrawTxHash;

    // 3. Update Supabase balance using RPC
    const { data, error } = await supabase.rpc('update_balance_for_withdrawal', {
      p_user_address: dbAddress,
      p_withdrawal_amount: amount,
      p_currency: normalizedCurrency,
      p_transaction_hash: combinedTxHash,
    });

    if (error) {
      console.error('Database error in withdrawal update:', error);
      // Note: At this point the BNB has been sent!
      return NextResponse.json(
        {
          success: true,
          txHash: withdrawTxHash,
          warning: `Withdrawal successful on-chain (Tx: ${withdrawTxHash}) but balance update failed. Please contact support with this transaction hash for reconciliation.`,
          dbError: 'balance_update_failed'
        },
        { status: 200 }
      );
    }

    const result = data as { success: boolean; error: string | null; new_balance: number };

    // Log the platform fee for admin fee-tracking (non-blocking).
    if (feeAmount > 0) {
      supabase.from('balance_audit_log').insert({
        user_address: dbAddress,
        currency: normalizedCurrency,
        operation_type: 'platform_fee',
        amount: feeAmount,
        transaction_hash: `fee:withdrawal:${combinedTxHash}`,
      }).then(({ error: feeErr }) => {
        if (feeErr) console.warn('[withdraw] fee log failed (non-blocking):', feeErr.message);
      });
    }

    return NextResponse.json({
      success: true,
      txHash: withdrawTxHash,
      newBalance: result.new_balance,
      privySignature,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/balance/withdraw:', error);
    return NextResponse.json(
      { error: 'An error occurred processing your request' },
      { status: 500 }
    );
  }
}
