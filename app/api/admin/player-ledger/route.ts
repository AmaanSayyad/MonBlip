import { NextRequest, NextResponse } from 'next/server';
import { isDemoBetHistoryRow } from '@/lib/admin/walletAddressVariants';
import { resolveHouseLedgerCurrency } from '@/lib/balance/houseLedgerCurrency';
import { requireAdminAuth } from '@/lib/admin/requireAdminAuth';
import { logDbOnce, supabaseService as supabase } from '@/lib/supabase/serviceClient';
import { canonicalHouseUserAddress } from '@/lib/wallet/canonicalAddress';
import { displayUsername } from '@/lib/brand/names';
import { isEnabledPlayCurrency } from '@/lib/chains/supported';

/**
 * Returns true when the wallet address format is plausibly valid for the given
 * currency. Filters out cross-chain noise (e.g. a Solana address stored under
 * STRK currency) and obvious zero/test addresses.
 */
function isAddressCompatible(address: string, currency: string): boolean {
  const a = address.trim();
  const c = currency.toUpperCase();

  // Always reject obvious zero / test addresses
  if (/^0x0+1?$/i.test(a)) return false;
  if (a === '0x0000000000000000000000000000000000000001') return false;
  if (/^0x0{60,}/.test(a)) return false; // mostly-zero addresses

  // EVM chains — 40-char hex checksum address
  const isEVM = /^0x[0-9a-fA-F]{40}$/.test(a);
  // Sui — 64-char hex
  const isSui = /^0x[0-9a-fA-F]{64}$/.test(a);
  // Starknet — 0x + 1-64 hex chars (can be padded shorter than 64)
  const isStarknet = /^0x[0-9a-fA-F]{1,64}$/.test(a);
  // Solana — base58, 32-44 chars, no 0x prefix
  const isSolana = !a.startsWith('0x') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  // Stellar — G + 55 base32 chars
  const isStellar = /^G[A-Z2-7]{55}$/.test(a);
  // Tezos
  const isTezos = /^(tz1|tz2|tz3|KT1)[a-zA-Z0-9]{33}$/.test(a);
  // NEAR — named (.near/.testnet) or 64-char implicit hex
  const isNear = /^[a-z0-9_-]+\.(near|testnet)$/.test(a) || /^[0-9a-f]{64}$/.test(a);
  // Initia bech32
  const isInitia = /^init1[a-z0-9]{38}$/.test(a);

  switch (c) {
    case 'BNB': case 'PC': case 'PUSH': case 'STT': case 'SOMNIA': case '0G': case 'ZG':
      return isEVM;
    case 'SUI':
      return isSui;
    case 'STRK':
      return isStarknet && !isEVM; // Starknet addresses are longer than 40 chars
    case 'SOL': case 'BYNOMO':
      return isSolana;
    case 'XLM':
      return isStellar;
    case 'XTZ':
      return isTezos;
    case 'NEAR':
      return isNear;
    case 'INIT':
      return isInitia;
    case 'USDC':
      // USDC on Sui
      return isSui;
    case 'OCT':
      // OneChain uses Sui-compatible addresses
      return isSui;
    default:
      return true; // unknown currency — don't filter
  }
}

export async function GET(_request: NextRequest) {
    const deny = requireAdminAuth(_request);
    if (deny) return deny;
    try {
        // All deposit / withdrawal / fee events grouped by (user_address, currency)
        const { data: auditRows, error: auditErr } = await supabase
            .from('balance_audit_log')
            .select('user_address, currency, operation_type, amount, created_at')
            .in('operation_type', ['deposit', 'withdrawal', 'platform_fee']);

        if (auditErr) throw auditErr;

        // Current spendable balances per (user_address, currency)
        const { data: balanceRows, error: balErr } = await supabase
            .from('user_balances')
            .select('user_address, currency, balance');

        if (balErr) throw balErr;

        // Real bet counts/volume per wallet — paginate to avoid 1000-row truncation
        const betRows: any[] = [];
        {
            const PAGE = 1000;
            let from = 0;
            for (;;) {
                const { data, error: betErr } = await supabase
                    .from('bet_history')
                    .select('id, wallet_address, amount, payout, won, network, asset')
                    .order('id', { ascending: true })
                    .range(from, from + PAGE - 1);
                if (betErr) throw betErr;
                const chunk = data ?? [];
                betRows.push(...chunk);
                if (chunk.length < PAGE) break;
                from += PAGE;
            }
        }

        // User display names
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('user_address, username');

        const profileMap: Record<string, string> = {};
        (profiles ?? []).forEach((p: any) => {
            profileMap[canonicalHouseUserAddress(p.user_address)] = displayUsername(p.username) || '';
        });

        // Aggregate audit events → deposited / withdrawn per (address, currency)
        type Row = {
            user_address: string;
            currency: string;
            total_deposited: number;
            total_withdrawn: number;
            current_balance: number;
            total_bets: number;
            total_wins: number;
            total_wagered: number;
            total_payout: number;
            total_fees_paid: number;
            username: string | null;
            first_deposit_at: string | null;
        };

        const key = (addr: string, cur: string) => `${canonicalHouseUserAddress(addr)}::${cur}`;
        const map: Record<string, Row> = {};

        (auditRows ?? []).forEach((r: any) => {
            if (!isEnabledPlayCurrency(r.currency)) return;
            if (!isAddressCompatible(r.user_address, r.currency)) return;
            const k = key(r.user_address, r.currency);
            if (!map[k]) map[k] = {
                user_address: canonicalHouseUserAddress(r.user_address),
                currency: r.currency,
                total_deposited: 0,
                total_withdrawn: 0,
                current_balance: 0,
                total_bets: 0,
                total_wins: 0,
                total_wagered: 0,
                total_payout: 0,
                total_fees_paid: 0,
                username: profileMap[canonicalHouseUserAddress(r.user_address)] ?? null,
                first_deposit_at: null,
            };
            if (r.operation_type === 'deposit') {
                map[k].total_deposited  += Number(r.amount);
                // Track the earliest deposit across all currencies for this wallet
                if (!map[k].first_deposit_at || r.created_at < map[k].first_deposit_at!) {
                    map[k].first_deposit_at = r.created_at;
                }
            }
            if (r.operation_type === 'withdrawal') map[k].total_withdrawn += Number(r.amount);
            if (r.operation_type === 'platform_fee') map[k].total_fees_paid += Number(r.amount);
        });

        // Fold in current balances (may include wallets with no audit rows yet)
        (balanceRows ?? []).forEach((b: any) => {
            if (!isEnabledPlayCurrency(b.currency)) return;
            if (!isAddressCompatible(b.user_address, b.currency)) return;
            const k = key(b.user_address, b.currency);
            if (!map[k]) map[k] = {
                user_address: canonicalHouseUserAddress(b.user_address),
                currency: b.currency,
                total_deposited: 0,
                total_withdrawn: 0,
                current_balance: 0,
                total_bets: 0,
                total_wins: 0,
                total_wagered: 0,
                total_payout: 0,
                total_fees_paid: 0,
                username: profileMap[canonicalHouseUserAddress(b.user_address)] ?? null,
                first_deposit_at: null,
            };
            map[k].current_balance += Number(b.balance);
        });

        // Fold in real bet stats (one row per wallet + resolved house currency)
        (betRows ?? [])
            .filter((b: any) => !isDemoBetHistoryRow(b))
            .forEach((b: any) => {
                const bw = canonicalHouseUserAddress(b.wallet_address ?? '');
                const cur = resolveHouseLedgerCurrency({
                    network: b.network ?? 'BNB',
                    selectedCurrency: b.asset,
                });
                if (!isEnabledPlayCurrency(cur) || !isAddressCompatible(bw, cur)) return;
                const k = key(bw, cur);
                if (!map[k]) {
                    map[k] = {
                        user_address: bw,
                        currency: cur,
                        total_deposited: 0,
                        total_withdrawn: 0,
                        current_balance: 0,
                        total_bets: 0,
                        total_wins: 0,
                        total_wagered: 0,
                        total_payout: 0,
                        total_fees_paid: 0,
                        username: profileMap[bw] ?? null,
                        first_deposit_at: null,
                    };
                }
                const row = map[k];
                row.total_bets += 1;
                row.total_wagered += Number(b.amount ?? 0);
                row.total_payout += Number(b.payout ?? 0);
                if (b.won) row.total_wins += 1;
            });

        // Back-calculate historical fees for rows that pre-date explicit fee logging.
        // The deposit RPC stores the NET amount (after 10% free-tier fee), so:
        //   gross = net / 0.90  →  fee = gross − net = net × (1/9)
        // Withdrawal fees = withdrawn × 10%.
        // We only apply the estimate when no explicit platform_fee entries exist yet.
        for (const r of Object.values(map)) {
            if (r.total_fees_paid === 0 && r.total_deposited > 0) {
                const estimatedDepositFee    = r.total_deposited / 9;         // 10% of gross
                const estimatedWithdrawalFee = r.total_withdrawn * 0.10;
                r.total_fees_paid = estimatedDepositFee + estimatedWithdrawalFee;
            }
        }

        // Build final array with derived fields
        const players = Object.values(map).map(r => ({
            ...r,
            // From user's perspective: money they got back vs money they put in.
            // Includes what's still sitting in their balance.
            net_pnl: (r.total_withdrawn + r.current_balance) - r.total_deposited,
            // From the house: positive = house profited
            house_pnl: r.total_deposited - (r.total_withdrawn + r.current_balance),
            // total_fees_paid already on r — re-exported for clarity
            total_fees_paid: r.total_fees_paid,
        }));

        // Sort by first_deposit_at asc (earliest joiners first)
        players.sort((a, b) => {
            if (!a.first_deposit_at && !b.first_deposit_at) return 0;
            if (!a.first_deposit_at) return 1;
            if (!b.first_deposit_at) return -1;
            return a.first_deposit_at < b.first_deposit_at ? -1 : 1;
        });

        return NextResponse.json({ players });
    } catch (e: any) {
        logDbOnce('player ledger', e);
        return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
}
