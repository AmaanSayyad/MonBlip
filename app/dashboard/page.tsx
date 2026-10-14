'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CurrencyStat {
    totalBalance: number;
    userCount: number;
}

interface NetworkPnLRow {
    volume: number;
    payout: number;
    platformPnL: number;
}

interface ModeStats {
    totalVolume: number;
    totalBets: number;
    platformPnL: number;
    /** House edge Σ(stake−payout) per `bet_history.network` in that chain's native units */
    platformPnLByNetwork?: Record<string, NetworkPnLRow>;
    totalUsers: number;
    totalReferrals: number;
    /** Mean session length from `user_sessions` (ping tracker); seconds. */
    averageSessionSeconds?: number;
    sessionSampleCount?: number;
}

interface Stats {
    // Overall (demo + real) fallback fields
    totalVolume: number;
    totalBets: number;
    totalUsers: number;
    platformPnL: number;
    revenue: number;
    currencyStats: Record<string, CurrencyStat>;
    // Split metrics
    demo: ModeStats;
    real: ModeStats;
}

interface User {
    user_address: string;
    username: string | null;
    currency: string;
    balance: number;
    updated_at: string;
    activity: {
        totalBets: number;
        totalVolume: number;
        wins: number;
    };
    referral?: {
        referral_code: string;
        referral_count: number;
        referred_by: string | null;
    };
}

interface Transaction {
    id: number;
    user_address: string;
    operation_type: 'deposit' | 'withdrawal';
    amount: number;
    currency: string;
    transaction_hash: string;
    created_at: string;
}

interface MarketToken {
    symbol: string;
    pythId: string;
    price: number;
    category: string;
}

const MARKET_CATEGORY_ORDER = ['Crypto', 'Forex', 'Metals', 'Stocks', 'Commodities'] as const;

const LEDGER_TOKEN: Record<string, { src: string; label: string; chain?: string }> = {
    AUSD: { src: '/logos/sponsors/agora.svg', label: 'AUSD', chain: '/logos/chains/monad.svg' },
    MON: { src: '/logos/chains/monad.svg', label: 'MON', chain: '/logos/chains/monad.svg' },
    MONAD: { src: '/logos/chains/monad.svg', label: 'MON', chain: '/logos/chains/monad.svg' },
    ARB: { src: '/logos/ticker/eth.svg', label: 'ETH', chain: '/logos/chains/arbitrum.png' },
    ETH: { src: '/logos/ticker/eth.svg', label: 'ETH' },
    USDC_BASE: { src: '/logos/ticker/usdc.svg', label: 'USDC', chain: '/logos/chains/base.png' },
    BASE: { src: '/logos/ticker/usdc.svg', label: 'USDC', chain: '/logos/chains/base.png' },
    USDC: { src: '/logos/ticker/usdc.svg', label: 'USDC' },
    SOL: { src: '/logos/ticker/sol.svg', label: 'SOL' },
    OUSD: { src: '/logos/ticker/ousd.svg', label: 'OUSD', chain: '/logos/chains/tempo.png' },
    TEMPO: { src: '/logos/ticker/ousd.svg', label: 'OUSD', chain: '/logos/chains/tempo.png' },
    BNB: { src: '/logos/ticker/bnb.svg', label: 'BNB' },
    SUI: { src: '/logos/ticker/sui.svg', label: 'SUI' },
    NEAR: { src: '/logos/ticker/near.svg', label: 'NEAR' },
    XLM: { src: '/logos/ticker/xlm.svg', label: 'XLM' },
    XTZ: { src: '/logos/ticker/xtz.svg', label: 'XTZ' },
    STRK: { src: '/logos/starknet-strk-logo.svg', label: 'STRK' },
};

function LedgerToken({ currency, compact = false }: { currency: string; compact?: boolean }) {
    const mark = LEDGER_TOKEN[(currency || '').toUpperCase()];
    if (!mark) {
        const fallback = (currency || '').toUpperCase() === 'BYNOMO' ? 'Legacy' : currency;
        return <span className="text-xs font-medium uppercase text-white/50">{fallback || '—'}</span>;
    }
    return (
        <span className="inline-flex items-center gap-2" title={mark.label}>
            <span className={`relative inline-flex shrink-0 ${compact ? 'h-4 w-4' : 'h-6 w-6'}`}>
                <img src={mark.src} alt="" className={`${compact ? 'h-4 w-4' : 'h-6 w-6'} rounded-full object-cover`} />
                {!compact && mark.chain ? (
                    <img src={mark.chain} alt="" className="absolute -bottom-0.5 -right-1 h-3.5 w-3.5 rounded-full bg-black object-contain ring-2 ring-black" />
                ) : null}
            </span>
            {compact ? null : <span className="text-xs font-medium text-white/80">{mark.label}</span>}
        </span>
    );
}

interface BetHistory {
    id: string;
    wallet_address: string;
    asset: string;
    direction: 'UP' | 'DOWN';
    amount: number;
    payout: number;
    won: boolean;
    created_at: string;
}

interface BannedWalletRow {
    wallet_address: string;
    reason: string | null;
    created_at: string;
}

interface TreasuryBalanceApiRow {
    chain: string;
    label: string;
    address: string;
    asset: string;
    balance: number | null;
    formatted: string;
    balanceUsd: number | null;
    formattedUsd: string;
    unitUsd: number | null;
    explorerUrl: string | null;
    error: string | null;
}

function fmtPnL(n: number | undefined | null) {
    if (n === undefined || n === null || !Number.isFinite(n)) return '0';
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Human-readable mean session length for terminal stats. */
function fmtAvgSession(seconds: number | undefined, sampleCount: number | undefined): string {
    if (!sampleCount || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '—';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${r}s`;
    return `${r}s`;
}

/** Play asset for a bet_history network code. */
function tokenSymbolForNetwork(net: string): string {
    const u = net.trim().toUpperCase();
    if (u === 'MONAD' || u === 'AUSD') return 'AUSD';
    if (u === 'MON') return 'MON';
    if (u === 'BASE' || u === 'USDC_BASE' || u === 'USDC') return 'USDC';
    if (u === 'TEMPO' || u === 'OUSD') return 'OUSD';
    if (u === 'SOL') return 'SOL';
    if (u === 'BYNOMO') return 'Legacy';
    return u || '?';
}

/** Bet rows for the live desk. */
const ENABLED_ECONOMICS = [
    { keys: ['MONAD', 'AUSD'], chain: 'Monad', token: 'AUSD' },
    { keys: ['MON'], chain: 'Monad', token: 'MON' },
] as const;

function NetworkTokenEconomicsTable({ rows, title }: { rows?: Record<string, NetworkPnLRow>; title: string }) {
    const sorted = ENABLED_ECONOMICS.map((spec) => {
        const row = { volume: 0, payout: 0, platformPnL: 0 };
        for (const [net, data] of Object.entries(rows || {})) {
            if ((spec.keys as readonly string[]).includes(net.trim().toUpperCase())) {
                row.volume += data.volume;
                row.payout += data.payout;
                row.platformPnL += data.platformPnL;
            }
        }
        return { ...spec, row };
    });
    return (
        <div className="panel overflow-hidden">
            <div className="space-y-1 border-b border-[#232323] px-4 py-3">
                <p className="text-sm text-white">{title}</p>
                <p className="text-sm leading-6 text-[#DDD7FE]">
                    Each row is one chain, in that chain’s play asset. Do not add the column across chains.
                </p>
            </div>
            <ul className="sm:hidden">
                {sorted.map(({ chain, token, row }) => {
                    const sym = token;
                    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
                    return (
                        <li key={chain} className="border-b border-[#232323] px-4 py-3.5 last:border-0">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-white">{chain} <span className="text-[#DDD7FE]">{sym}</span></p>
                                <p className={`font-mono text-sm ${row.platformPnL >= 0 ? 'text-[#7005FC]' : 'text-white'}`}>{fmt(row.platformPnL)}</p>
                            </div>
                            <p className="mt-1 text-xs text-[#DDD7FE]">Staked {fmt(row.volume)} · Paid {fmt(row.payout)}</p>
                        </li>
                    );
                })}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-[#232323] text-xs text-[#B781FE]">
                            <th className="px-4 py-3">Chain</th>
                            <th className="px-4 py-3">Token</th>
                            <th className="px-4 py-3 text-right">Staked</th>
                            <th className="px-4 py-3 text-right">Paid to players</th>
                            <th className="px-4 py-3 text-right">Net (house)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(({ chain, token, row }) => {
                            const sym = token;
                            const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });
                            return (
                                <tr key={chain} className="border-b border-white/5 font-mono text-white/85">
                                    <td className="px-4 py-2.5">{chain}</td>
                                    <td className="px-4 py-2.5 text-white/50">{sym}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">
                                        {fmt(row.volume)} <span className="text-xs text-white/35">{sym}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">
                                        {fmt(row.payout)} <span className="text-xs text-white/35">{sym}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">
                                        <span className={row.platformPnL >= 0 ? 'text-[#7005FC]' : 'text-white'}>
                                            {fmt(row.platformPnL)} <span className="text-xs opacity-70">{sym}</span>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
    const [marketTokens, setMarketTokens] = useState<MarketToken[]>([]);
    const [gameHistory, setGameHistory] = useState<BetHistory[]>([]);
    const [modeAnalytics, setModeAnalytics] = useState<{ real: any[]; demo: any[]; combined: any[] } | null>(null);
    const [suspiciousUsers, setSuspiciousUsers] = useState<any[]>([]);
    const [frequencyUsers, setFrequencyUsers] = useState<any[]>([]);
    const [bannedWallets, setBannedWallets] = useState<BannedWalletRow[]>([]);
    const [banAddressInput, setBanAddressInput] = useState('');
    const [banReasonInput, setBanReasonInput] = useState('');
    const [unbanningAddress, setUnbanningAddress] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    // Default to Waitlist so collected emails are visible immediately.
    const [activeTab, setActiveTab] = useState<
        | 'wallet_intel'
        | 'users'
        | 'financial'
        | 'markets'
        | 'gameplay'
        | 'danger'
        | 'referrals'
        | 'waitlist'
        | 'access_codes'
        | 'player_pnl'
    >('wallet_intel');
    const [desk, setDesk] = useState<'real' | 'demo'>('real');
    const [playerPnl, setPlayerPnl] = useState<any[]>([]);
    const [pnlSort, setPnlSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'first_deposit_at', dir: 'asc' });
    const [waitlist, setWaitlist] = useState<any[]>([]);
    const [waitlistError, setWaitlistError] = useState<string | null>(null);
    const [accessCodes, setAccessCodes] = useState<any[]>([]);

    const [walletIntelQuery, setWalletIntelQuery] = useState('');
    const [walletIntel, setWalletIntel] = useState<any | null>(null);
    const [walletIntelLoading, setWalletIntelLoading] = useState(false);
    const [walletIntelError, setWalletIntelError] = useState<string | null>(null);

    const [treasurySnapshot, setTreasurySnapshot] = useState<{
        generatedAt: string;
        rows: TreasuryBalanceApiRow[];
        usdNote?: string;
    } | null>(null);
    const [treasuryLoading, setTreasuryLoading] = useState(false);
    const [treasuryError, setTreasuryError] = useState<string | null>(null);

    const [isAuthorized, setIsAuthorized] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [sessionExpired, setSessionExpired] = useState(false);
    const [gameplayFilter, setGameplayFilter] = useState<'all' | 'real' | 'demo'>('all');
    const [chainFilter, setChainFilter] = useState<string>('ALL');

    const getExplorerUrl = (currency: string, hash: string) => {
        if (!hash || hash === 'INTERNAL') return null;
        switch (currency.toUpperCase()) {
            case 'BNB': return `https://bscscan.com/tx/${hash}`;
            case 'NEAR': return `https://nearblocks.io/txns/${hash}`;
            case 'SOL':
            case 'BYNOMO':
                return `https://solscan.io/tx/${hash}`;
            case 'SUI':
            case 'USDC':
                return `https://suiscan.xyz/tx/${hash}`;
            case 'APT':
                return `https://explorer.aptoslabs.com/txn/${encodeURIComponent(hash)}`;
            case 'XTZ': return `https://tzkt.io/${hash}`;
            case 'XLM': return `https://stellar.expert/explorer/public/tx/${hash}`;
            case 'STRK': return `https://starkscan.co/tx/${hash}`;
            case 'PUSH':
            case 'PC':
                return `https://monadvision.com/tx/${hash}`;
            default: return null;
        }
    };

    const fetchTreasuryBalances = async () => {
        setTreasuryLoading(true);
        setTreasuryError(null);
        try {
            const res = await fetch('/api/admin/treasury-balances', { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load on-chain balances');
            setTreasurySnapshot({
                generatedAt: data.generatedAt,
                rows: Array.isArray(data.rows) ? data.rows : [],
                usdNote: typeof data.usdNote === 'string' ? data.usdNote : undefined,
            });
        } catch (e: unknown) {
            setTreasuryError(e instanceof Error ? e.message : 'Failed to load balances');
            setTreasurySnapshot(null);
        } finally {
            setTreasuryLoading(false);
        }
    };

    const runWalletIntel = async () => {
        const q = walletIntelQuery.trim();
        if (!q) return;
        setWalletIntelLoading(true);
        setWalletIntelError(null);
        try {
            const res = await fetch(`/api/admin/wallet-insights?address=${encodeURIComponent(q)}`, { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lookup failed');
            setWalletIntel(data);
        } catch (e: unknown) {
            setWalletIntelError(e instanceof Error ? e.message : 'Lookup failed');
            setWalletIntel(null);
        } finally {
            setWalletIntelLoading(false);
        }
    };

    const exportAccessCodes = () => {
        const headers = ["Access Code", "Status", "Wallet Link", "Authorized At"];
        const rows = accessCodes.map(c => [
            c.code,
            c.is_used ? "Consumed" : "Ready",
            c.wallet_address || "UNLINKED",
            c.used_at ? new Date(c.used_at).toLocaleString() : "---"
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `monblip_access_codes_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // On mount, probe the server to see if a valid session cookie already exists
    useEffect(() => {
        fetch('/api/admin/stats', { credentials: 'include' })
            .then(r => {
                if (r.ok) {
            setIsAuthorized(true);
            fetchData();
        }
            })
            .catch(() => {/* not logged in */});
        // Clean up old localStorage keys from the previous auth system
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_authorized');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password: passwordInput }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.ok) {
            setIsAuthorized(true);
                    setSessionExpired(false);
            fetchData();
                    return;
                }
            }
            alert('Wrong password.');
        } catch {
            alert('Auth check failed. Try again.');
        }
    };

    const handleLogout = async () => {
        await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
        setIsAuthorized(false);
        setPasswordInput('');
    };

    useEffect(() => {
        if (isAuthorized) {
            fetchData();
            fetchTreasuryBalances();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on auth gate only
    }, [isAuthorized]);

    const fetchData = async () => {
        setLoading(true);
        setWaitlistError(null);
        try {
            const opts = { credentials: 'include' as const };
            const [
                statsRes,
                usersRes,
                txRes,
                mktRes,
                gameRes,
                dangerRes,
                bannedRes,
                waitlistRes,
                accessCodesRes,
                pendingWithdrawalsRes,
                playerLedgerRes,
                modeRes,
            ] = await Promise.all([
                fetch('/api/admin/stats', opts),
                fetch('/api/admin/users', opts),
                fetch('/api/admin/transactions', opts),
                fetch('/api/admin/currencies', opts),
                fetch('/api/admin/game-history', opts),
                fetch('/api/admin/danger-zone', opts),
                fetch('/api/admin/banned-wallets', opts),
                fetch('/api/admin/waitlist', opts),
                fetch('/api/admin/access-codes', opts),
                fetch('/api/admin/withdrawal-requests/pending', opts),
                fetch('/api/admin/player-ledger', opts),
                fetch('/api/admin/mode-analytics', opts),
            ]);
            // If any critical fetch returns 401, the session has expired
            if (statsRes.status === 401) {
                setIsAuthorized(false);
                setSessionExpired(true);
                return;
            }
            if (statsRes.ok) setStats(await statsRes.json());
            if (usersRes.ok) {
                const data = await usersRes.json();
                setUsers(data.users || []);
            }
            if (txRes.ok) {
                const data = await txRes.json();
                setTransactions(data.transactions || []);
            }
            if (mktRes.ok) {
                const data = await mktRes.json();
                setMarketTokens(data.tokens || []);
            }
            if (gameRes.ok) {
                const data = await gameRes.json();
                setGameHistory(data.bets || []);
            }
            if (dangerRes.ok) {
                const data = await dangerRes.json();
                setSuspiciousUsers(data.suspiciousUsers || []);
                setFrequencyUsers(data.frequencyUsers || []);
            }
            if (bannedRes.ok) {
                const data = await bannedRes.json();
                setBannedWallets(data.bans || []);
            }
            if (waitlistRes.ok) {
                const data = await waitlistRes.json();
                setWaitlist(data.waitlist || []);
                setWaitlistError(null);
            } else {
                try {
                    const data = await waitlistRes.json();
                    setWaitlistError(data?.error || `Failed to load waitlist (HTTP ${waitlistRes.status})`);
                } catch {
                    setWaitlistError(`Failed to load waitlist (HTTP ${waitlistRes.status})`);
                }
            }
            if (accessCodesRes.ok) {
                const data = await accessCodesRes.json();
                setAccessCodes(data.codes || []);
            }
            if (pendingWithdrawalsRes.ok) {
                const data = await pendingWithdrawalsRes.json();
                setPendingWithdrawals(data.requests || []);
            }
            if (playerLedgerRes.ok) {
                const data = await playerLedgerRes.json();
                setPlayerPnl(data.players || []);
            }
            if (modeRes.ok) {
                setModeAnalytics(await modeRes.json());
            }
        } catch (error) {
            console.error('Failed to fetch admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const generateAccessCodes = async (count: number = 5) => {
        try {
            const res = await fetch('/api/admin/access-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ count })
            });
            if (res.ok) {
                fetchData();
                return;
            }
            const err = await res.json().catch(() => ({}));
            alert(err?.error || `Failed to generate codes (HTTP ${res.status})`);
        } catch (error) {
            console.error('Failed to generate codes:', error);
            alert('Failed to generate codes. Check the console and server logs.');
        }
    };

    const addGlobalBan = async () => {
        const addr = banAddressInput.trim();
        if (!addr) return;
        try {
            const res = await fetch('/api/admin/banned-wallets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    walletAddress: addr,
                    reason: banReasonInput.trim() || 'Banned by administrator',
                }),
            });
            if (res.ok) {
                setBanAddressInput('');
                setBanReasonInput('');
                fetchData();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err?.error || 'Failed to add ban');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const removeGlobalBan = async (walletAddress: string) => {
        try {
            const res = await fetch(
                `/api/admin/banned-wallets?walletAddress=${encodeURIComponent(walletAddress)}`,
                { method: 'DELETE', credentials: 'include' }
            );
            if (res.ok) fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    // Unban from Player P&L table — removes ban AND zeroes the wallet balance so they start fresh
    const handleUnbanFromPnl = async (walletAddress: string) => {
        if (!confirm(`Unban ${walletAddress}?\n\nThis will:\n• Remove the ban\n• Zero their available balance (they start fresh)\n\nContinue?`)) return;
        setUnbanningAddress(walletAddress);
        try {
            const res = await fetch('/api/admin/unban-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ walletAddress }),
            });
            if (res.ok) {
                fetchData();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err?.error || 'Failed to unban wallet');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setUnbanningAddress(null);
        }
    };

    const updateUserStatus = async (userAddress: string, status: string) => {
        try {
            const res = await fetch('/api/admin/users/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userAddress, status })
            });
            if (res.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    const acceptWithdrawalRequest = async (requestId: number) => {
        try {
            const res = await fetch(`/api/admin/withdrawal-requests/${requestId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await fetchData();
            } else {
                alert(data?.error || `Accept failed (HTTP ${res.status})`);
            }
        } catch (e) {
            console.error('Failed to accept withdrawal request:', e);
        }
    };

    const rejectWithdrawalRequest = async (requestId: number) => {
        try {
            const res = await fetch(`/api/admin/withdrawal-requests/${requestId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await fetchData();
            } else {
                alert(data?.error || `Reject failed (HTTP ${res.status})`);
            }
        } catch (e) {
            console.error('Failed to reject withdrawal request:', e);
        }
    };

    const marketSummary = useMemo(() => {
        const summary = Object.fromEntries(
            MARKET_CATEGORY_ORDER.map((cat) => [cat, 0]),
        ) as Record<(typeof MARKET_CATEGORY_ORDER)[number], number>;
        marketTokens.forEach((t) => {
            const category = MARKET_CATEGORY_ORDER.includes(t.category as (typeof MARKET_CATEGORY_ORDER)[number])
                ? (t.category as (typeof MARKET_CATEGORY_ORDER)[number])
                : 'Crypto';
            summary[category] += 1;
        });
        return summary;
    }, [marketTokens]);

    if (!isAuthorized) {
        return (
            <div className="monad-page flex min-h-screen items-center justify-center bg-[#FCFBFF] p-4 text-[#1A1330]">
                <div className="panel w-full max-w-sm p-8">
                    <div className="mb-8">
                        <h2 className="rh-display text-4xl text-white">Admin</h2>
                        <p className="mt-2 text-sm text-[#DDD7FE]">Enter the access key.</p>
                        {sessionExpired && (
                            <p className="mt-3 text-xs text-amber-400/80 font-mono">Session expired — please log in again.</p>
                        )}
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="relative">
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="Access key"
                                className="h-11 w-full rounded-full border border-[#2a2a2a] bg-black px-4 text-center font-mono text-sm text-white outline-none placeholder:text-[#B781FE] focus:border-[#7005FC]"
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            className="neon-btn h-11 w-full text-sm"
                        >
                            Authorize
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const shortenAddress = (addr: string) => addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : 'N/A';

    const getExplorerAddressUrl = (address: string, currency: string): string => {
        const c = (currency || '').toUpperCase();
        const addr = encodeURIComponent(address);
        switch (c) {
            case 'MONAD':
            case 'AUSD':
            case 'MON':
                return `https://monadvision.com/address/${addr}`;
            case 'BNB':   return `https://bscscan.com/address/${addr}`;
            case 'SOL':
            case 'BYNOMO':
                return `https://solscan.io/account/${addr}`;
            case 'ROBINHOOD':
            case 'ETH':
                return `https://robinhoodchain.blockscout.com/address/${addr}`;
            case 'BASE':
            case 'USDC':
            case 'USDC_BASE':
                return `https://basescan.org/address/${addr}`;
            case 'ARB':
                return `https://arbiscan.io/address/${addr}`;
            case 'TEMPO':
            case 'OUSD':
                return `https://explore.tempo.xyz/address/${addr}`;
            case 'SUI':
                return `https://suiscan.xyz/mainnet/account/${addr}`;
            case 'APT':
                return `https://explorer.aptoslabs.com/account/${addr}`;
            case 'XLM':   return `https://stellar.expert/explorer/public/account/${addr}`;
            case 'NEAR':  return `https://nearblocks.io/address/${addr}`;
            case 'STRK':  return `https://starkscan.co/contract/${addr}`;
            case 'PUSH':
            case 'PC':
                return `https://monadvision.com/address/${address}`;
            case 'STT':   return `${process.env.NEXT_PUBLIC_SOMNIA_TESTNET_EXPLORER || 'https://shannon-explorer.somnia.network'}/address/${addr}`;
            case 'ONE':
            case 'OCT':
                return `${process.env.NEXT_PUBLIC_ONECHAIN_EXPLORER || 'https://explorer-testnet.onechain.one'}/address/${addr}`;
            case 'ZG':    return `${process.env.NEXT_PUBLIC_ZG_MAINNET_EXPLORER || 'https://chainscan.0g.ai'}/address/${addr}`;
            case 'INIT':  return `https://scan.initia.xyz/initiation-2/accounts/${addr}`;
            default:      return `https://bscscan.com/address/${addr}`;
        }
    };

    return (
        <div className="monad-page min-h-screen bg-[#FCFBFF] px-4 py-6 text-[#1A1330] sm:px-6 lg:p-10">
            <div className="mx-auto max-w-[1400px] space-y-8">

                <div className="flex flex-col gap-5 border-b border-[#232323] pb-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="rh-display text-[clamp(2rem,7vw,3.5rem)] text-white">Admin</h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-[#DDD7FE]">
                            House balances, settled rounds, and treasury balances for the live chains.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={fetchData} className="neon-btn h-11 flex-1 px-5 text-sm sm:h-10 sm:flex-none">
                            {loading ? 'Refreshing' : 'Refresh'}
                        </button>
                        <button type="button" onClick={handleLogout} className="ghost-btn h-11 flex-1 px-5 text-sm sm:h-10 sm:flex-none">
                            Log out
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex w-full rounded-full border border-[#232323] bg-[#101010] p-1 sm:w-fit">
                        {(['real', 'demo'] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setDesk(key)}
                                className={`h-10 flex-1 rounded-full px-4 text-sm sm:flex-none ${desk === key ? 'bg-[#7005FC] text-white' : 'text-[#DDD7FE]'}`}
                            >
                                {key === 'real' ? 'Real play' : 'Demo play'}
                            </button>
                        ))}
                    </div>
                    <NetworkTokenEconomicsTable
                        rows={stats?.[desk]?.platformPnLByNetwork}
                        title={desk === 'real' ? 'Betting economics by chain' : 'Demo betting economics by chain'}
                    />
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatBox
                            title="Settled bets"
                            value={(stats?.[desk]?.totalBets ?? 0).toLocaleString()}
                            label="Rounds in history"
                        />
                        <StatBox
                            title="Staked"
                            value={fmtPnL(stats?.[desk]?.totalVolume)}
                            label="Sum of stakes. Chains are not one currency."
                        />
                        <StatBox title="Wallets" value={stats?.[desk]?.totalUsers.toString() || '0'} label="Unique addresses" />
                        <StatBox title="Referrals" value={(stats?.[desk]?.totalReferrals ?? 0).toString()} label="Joined from a code" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <StatBox title="Markets" value={marketTokens.length.toString()} label="Assets with a price feed" />
                        <StatBox
                            title="Time on the desk"
                            value={fmtAvgSession(stats?.[desk]?.averageSessionSeconds, stats?.[desk]?.sessionSampleCount)}
                            label={`${(stats?.[desk]?.sessionSampleCount ?? 0).toLocaleString()} sessions in the last 7 days`}
                        />
                    </div>
                </div>

                {/* On-chain treasury EOAs (read-only RPC) */}
                <div className="space-y-4">
                    <div className="flex flex-col gap-4 border-b border-[#232323] pb-5 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-2">
                            <h2 className="text-xl text-white">Treasury balances</h2>
                            <p className="max-w-3xl text-sm leading-6 text-[#DDD7FE]">
                                Deposit treasuries from the public env. Balances are in each chain’s play asset, with an approximate USD figure beside them.
                            </p>
                            {treasurySnapshot?.usdNote && (
                                <p className="text-[11px] text-white/35 leading-relaxed max-w-3xl border-l border-white/10 pl-3">
                                    {treasurySnapshot.usdNote}
                                </p>
                            )}
                            {treasurySnapshot?.generatedAt && (
                                <p className="text-[10px] font-mono text-white/25">
                                    Snapshot: {new Date(treasurySnapshot.generatedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={fetchTreasuryBalances}
                            disabled={treasuryLoading}
                            className="ghost-btn h-11 w-full shrink-0 px-5 text-sm disabled:opacity-50 sm:h-10 sm:w-auto"
                        >
                            {treasuryLoading ? 'Querying chains…' : 'Refresh balances'}
                        </button>
                    </div>
                    {treasuryError && (
                        <p className="text-sm text-rose-400 font-mono">{treasuryError}</p>
                    )}
                    {!treasurySnapshot && !treasuryError && treasuryLoading && (
                        <p className="text-sm text-white/35 font-mono">Loading on-chain snapshot…</p>
                    )}
                    {treasurySnapshot && treasurySnapshot.rows.length === 0 && !treasuryLoading && (
                        <p className="text-sm text-white/35">No treasury addresses resolved from environment (check NEXT_PUBLIC_* vars).</p>
                    )}
                    {treasurySnapshot && treasurySnapshot.rows.length > 0 && (
                        <div className="panel overflow-hidden">
                            <ul className="sm:hidden">
                                {treasurySnapshot.rows.map((r, i) => (
                                    <li key={`${r.label}-m-${i}`} className="border-b border-[#232323] px-4 py-3.5 last:border-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm text-white">{r.chain} <span className="text-[#DDD7FE]">{r.asset}</span></p>
                                            <p className="font-mono text-sm text-white">{r.error ? '—' : r.formatted}</p>
                                        </div>
                                        <p className="mt-1 text-xs text-[#DDD7FE]">{r.error ? r.error : r.formattedUsd}</p>
                                    </li>
                                ))}
                            </ul>
                            <div className="hidden overflow-x-auto sm:block">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-[#232323] text-xs text-[#B781FE]">
                                            <th className="px-4 py-3">Chain</th>
                                            <th className="px-4 py-3">Label</th>
                                            <th className="px-4 py-3">Address</th>
                                            <th className="px-4 py-3">Asset</th>
                                            <th className="px-4 py-3 text-right">Balance</th>
                                            <th className="px-4 py-3 text-right">≈ USD</th>
                                            <th className="px-4 py-3">Explorer</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {treasurySnapshot.rows.map((r, i) => {
                                            const short =
                                                r.address.length > 18
                                                    ? `${r.address.slice(0, 10)}…${r.address.slice(-8)}`
                                                    : r.address;
                                            return (
                                                <tr
                                                    key={`${r.label}-${r.address}-${i}`}
                                                    className="border-b border-[#232323] font-mono text-white/80"
                                                >
                                                    <td className="px-4 py-2.5">{r.chain}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white/70 max-w-[220px]">{r.label}</td>
                                                    <td className="px-4 py-2.5 text-[11px] text-white/50" title={r.address}>
                                                        {short}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-white/45">{r.asset}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-white">
                                                        {r.error ? '—' : r.formatted}
                                                    </td>
                                                    <td
                                                        className="px-4 py-2.5 text-right tabular-nums text-[#7005FC]"
                                                        title={
                                                            r.unitUsd != null && Number.isFinite(r.unitUsd)
                                                                ? `~$${r.unitUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })} / unit`
                                                                : undefined
                                                        }
                                                    >
                                                        {r.error ? '—' : r.formattedUsd}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {r.explorerUrl ? (
                                                            <a
                                                                href={r.explorerUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm text-[#7005FC]"
                                                            >
                                                                View
                                                            </a>
                                                        ) : (
                                                            <span className="text-white/20">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation & Search */}
                <div className="sticky top-0 z-20 space-y-3 bg-black/95 py-3 backdrop-blur">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                            <TabBtn active={activeTab === 'wallet_intel'} onClick={() => setActiveTab('wallet_intel')} label="Wallet" />
                            <TabBtn active={activeTab === 'users'} onClick={() => setActiveTab('users')} label="Ledger" />
                            <TabBtn active={activeTab === 'player_pnl'} onClick={() => setActiveTab('player_pnl')} label="Player P&L" />
                            <TabBtn active={activeTab === 'gameplay'} onClick={() => setActiveTab('gameplay')} label="Gameplay" />
                            <TabBtn active={activeTab === 'financial'} onClick={() => setActiveTab('financial')} label="Financials" />
                            <TabBtn active={activeTab === 'markets'} onClick={() => setActiveTab('markets')} label="Markets" />
                            <TabBtn active={activeTab === 'referrals'} onClick={() => setActiveTab('referrals')} label="Referrals" />
                            <TabBtn active={activeTab === 'waitlist'} onClick={() => setActiveTab('waitlist')} label="Waitlist" />
                            <TabBtn active={activeTab === 'access_codes'} onClick={() => setActiveTab('access_codes')} label="Access codes" />
                            <TabBtn active={activeTab === 'danger'} onClick={() => setActiveTab('danger')} label="Danger" />
                        </div>
                        <div className="relative w-full md:w-80">
                            <input
                                type="text"
                                placeholder="Search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-10 w-full rounded-full border border-[#2a2a2a] bg-[#141414] px-4 text-sm text-white outline-none placeholder:text-[#B781FE] focus:border-[#7005FC]"
                            />
                        </div>
                    </div>

                    {/* Data Display */}
                    <div className="panel overflow-hidden">
                        <div className="overflow-x-auto">
                            <AnimatePresence mode="wait">
                                {activeTab === 'wallet_intel' && (
                                    <div key="wallet_intel" className="space-y-6 p-4 text-left sm:p-6">
                                        <div className="space-y-2">
                                            <p className="text-sm text-white">Wallet</p>
                                            <p className="text-sm text-white/60 max-w-3xl leading-relaxed">
                                                Enter any address (EVM, Solana, Sui, etc.). We match stored variants (e.g. EVM checksum) and aggregate{' '}
                                                <span className="text-white/70">house balances</span>,{' '}
                                                <span className="text-white/70">audit log</span>,{' '}
                                                <span className="text-white/70">bets</span>, and{' '}
                                                <span className="text-white/70">withdrawal requests</span>.
                                                Amounts are <span className="text-amber-200/90">native units per currency</span>, not USD.
                                            </p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center max-w-4xl">
                                            <input
                                                value={walletIntelQuery}
                                                onChange={e => setWalletIntelQuery(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && runWalletIntel()}
                                                placeholder="e.g. Csx2cq3q7GeV79hFUuRR4Pa2T6JUBoC2UjWGbkVqQ4t4 or 0x…"
                                                className="h-11 flex-1 rounded-full border border-[#2a2a2a] bg-black px-4 font-mono text-sm text-white outline-none placeholder:text-[#B781FE] focus:border-[#7005FC]"
                                            />
                                            <button
                                                type="button"
                                                onClick={runWalletIntel}
                                                disabled={walletIntelLoading}
                                                className="neon-btn h-11 px-5 text-sm disabled:opacity-50"
                                            >
                                                {walletIntelLoading ? 'Scanning…' : 'Analyze wallet'}
                                            </button>
                                        </div>
                                        {walletIntelError && (
                                            <p className="text-sm text-rose-400 font-mono">{walletIntelError}</p>
                                        )}
                                        {walletIntel && (
                                            <div className="space-y-8 border-t border-white/10 pt-8">
                                                <div className="flex flex-wrap gap-3 text-sm">
                                                    <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-white/80">
                                                        Query: <span className="text-white">{walletIntel.query}</span>
                                                    </span>
                                                    {walletIntel.bannedGlobally && (
                                                        <span className="px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 font-black uppercase text-xs">
                                                            Globally banned
                                                        </span>
                                                    )}
                                                    {walletIntel.aggregates?.audit?.auditTruncated && (
                                                        <span className="text-amber-400/90">Audit log truncated (cap {walletIntel.aggregates.audit.cappedAt})</span>
                                                    )}
                                                    {walletIntel.aggregates?.betting?.betsTruncated && (
                                                        <span className="text-amber-400/90">Bets truncated (cap {walletIntel.aggregates.betting.betsCappedAt})</span>
                                                    )}
                                                </div>

                                                {/* Time on platform */}
                                                {walletIntel.timeOnPlatform && (
                                                    <div className="rounded-2xl border border-[#232323] bg-[#101010] p-6 space-y-4">
                                                        <p className="text-xs font-black uppercase tracking-widest text-[#DDD7FE]">Time on platform</p>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                            <div>
                                                                <p className="text-xs uppercase text-white/35">Total dwell time</p>
                                                                <p className="font-mono text-2xl text-[#7005FC]">
                                                                    {walletIntel.timeOnPlatform.formatted || '0s'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs uppercase text-white/35">Sessions</p>
                                                                <p className="font-mono text-2xl text-white">
                                                                    {walletIntel.timeOnPlatform.totalSessions}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs uppercase text-white/35">First seen</p>
                                                                <p className="font-mono text-xs text-white/70 mt-1">
                                                                    {walletIntel.timeOnPlatform.firstSeen
                                                                        ? new Date(walletIntel.timeOnPlatform.firstSeen).toLocaleString()
                                                                        : '—'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs uppercase text-white/35">Last seen</p>
                                                                <p className="font-mono text-xs text-white/70 mt-1">
                                                                    {walletIntel.timeOnPlatform.lastSeen
                                                                        ? new Date(walletIntel.timeOnPlatform.lastSeen).toLocaleString()
                                                                        : '—'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {walletIntel.timeOnPlatform.recentSessions?.length > 0 && (
                                                            <details className="mt-2">
                                                                <summary className="text-xs text-white/40 uppercase cursor-pointer hover:text-white/60 transition-colors">
                                                                    Session history ({walletIntel.timeOnPlatform.recentSessions.length} shown)
                                                                </summary>
                                                                <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
                                                                    {walletIntel.timeOnPlatform.recentSessions.map((s: any) => (
                                                                        <div key={s.id} className="flex flex-wrap gap-2 text-xs font-mono border-b border-white/5 pb-1 text-white/50">
                                                                            <span className="text-[#DDD7FE]">{s.network}</span>
                                                                            <span>{new Date(s.started_at).toLocaleString()}</span>
                                                                            <span className="text-white/30">→</span>
                                                                            <span>{s.ended_at ? new Date(s.ended_at).toLocaleString() : <span className="text-emerald-400">active</span>}</span>
                                                                            <span className="ml-auto text-[#DDD7FE]">{s.durationSeconds}s</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        )}
                                                        {walletIntel.timeOnPlatform.totalSessions === 0 && (
                                                            <p className="text-xs text-white/25">No session data yet. Sessions are recorded once the user connects their wallet.</p>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
                                                        <p className="text-xs font-black uppercase tracking-widest text-white/40">House balances (per currency)</p>
                                                        {(!walletIntel.balances || walletIntel.balances.length === 0) && (
                                                            <p className="text-white/30 text-sm">No balance rows for this address.</p>
                                                        )}
                                                        <div className="space-y-2">
                                                            {walletIntel.balances?.map((b: any) => (
                                                                <div key={b.currency + (b.status || '')} className="flex flex-wrap justify-between gap-2 text-sm border-b border-white/5 pb-2">
                                                                    <span className="font-mono text-white/70">{b.currency}</span>
                                                                    <span className="font-mono text-white">Balance {Number(b.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                                    <span className={`text-xs font-black uppercase ${b.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>{b.status}</span>
                                                                    <span className="text-xs text-white/40 w-full sm:w-auto">
                                                                        Withdrawable now:{' '}
                                                                        <span className="text-emerald-300/90 font-mono">{Number(b.withdrawableNow).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                                        {walletIntel.bannedGlobally && ' (0 if banned)'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
                                                        <p className="text-xs font-black uppercase tracking-widest text-white/40">Deposits & withdrawals (audit log)</p>
                                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                                            <div>
                                                                <p className="text-xs uppercase text-white/35">Deposits count</p>
                                                                <p className="font-mono text-lg text-emerald-400">{walletIntel.aggregates?.audit?.depositCount ?? 0}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs uppercase text-white/35">Withdrawals count</p>
                                                                <p className="font-mono text-lg text-rose-300">{walletIntel.aggregates?.audit?.withdrawalCount ?? 0}</p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1 text-xs font-mono">
                                                            <p className="text-xs text-white/40 uppercase">Σ deposits by currency</p>
                                                            {Object.entries(walletIntel.aggregates?.audit?.totalDepositsByCurrency || {}).map(([c, v]) => (
                                                                <div key={c} className="flex justify-between text-emerald-300/90">
                                                                    <span>{c}</span>
                                                                    <span>+{Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                                </div>
                                                            ))}
                                                            {Object.keys(walletIntel.aggregates?.audit?.totalDepositsByCurrency || {}).length === 0 && (
                                                                <span className="text-white/25">—</span>
                                                            )}
                                                        </div>
                                                        <div className="space-y-1 text-xs font-mono">
                                                            <p className="text-xs text-white/40 uppercase">Σ withdrawals by currency</p>
                                                            {Object.entries(walletIntel.aggregates?.audit?.totalWithdrawalsByCurrency || {}).map(([c, v]) => (
                                                                <div key={c} className="flex justify-between text-rose-300/90">
                                                                    <span>{c}</span>
                                                                    <span>-{Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                                </div>
                                                            ))}
                                                            {Object.keys(walletIntel.aggregates?.audit?.totalWithdrawalsByCurrency || {}).length === 0 && (
                                                                <span className="text-white/25">—</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-6">
                                                    <p className="text-xs font-black uppercase tracking-widest text-white/40">Betting performance</p>
                                                    {['real', 'demo'].map(mode => {
                                                        const b = walletIntel.aggregates?.betting?.[mode];
                                                        if (!b) return null;
                                                        return (
                                                            <div key={mode} className="border border-white/5 rounded-xl p-4 space-y-2">
                                                                <p className="text-xs font-black uppercase text-white/50">{mode === 'all' ? 'All bets' : mode === 'real' ? 'Real wallets only' : 'Demo wallets only'}</p>
                                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                                                    <div><span className="text-white/35 text-xs uppercase block">Bets</span><span className="font-mono text-white">{b.totalBets}</span></div>
                                                                    <div><span className="text-white/35 text-xs uppercase block">Wins</span><span className="font-mono text-emerald-400">{b.wins}</span></div>
                                                                    <div><span className="text-white/35 text-xs uppercase block">Losses</span><span className="font-mono text-rose-400">{b.losses}</span></div>
                                                                    <div><span className="text-white/35 text-xs uppercase block">Win rate</span><span className="font-mono text-white">{(b.winRate * 100).toFixed(1)}%</span></div>
                                                                    <div><span className="text-white/35 text-xs uppercase block">Total wagered</span><span className="font-mono text-white">{b.totalWagered.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
                                                                    <div><span className="text-white/35 text-xs uppercase block">Total payout</span><span className="font-mono text-white">{b.totalPayoutReceived.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
                                                                    <div><span className="text-white/35 text-xs uppercase block">User net (payout−wager)</span><span className={`font-mono ${b.netBettingPLUser >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{b.netBettingPLUser.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
                                                                </div>
                                                                {b.byNetwork && Object.keys(b.byNetwork).length > 0 && (
                                                                    <div className="mt-3 pt-3 border-t border-white/5 text-sm font-mono space-y-1">
                                                                        <p className="text-xs uppercase text-white/30 mb-1">By network</p>
                                                                        {Object.entries(b.byNetwork).map(([net, row]: [string, any]) => (
                                                                            <div key={net} className="flex flex-wrap gap-x-4 justify-between text-white/70">
                                                                                <span className="text-white">{net}</span>
                                                                                <span>net {Number(row.net).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                                                                <span className="text-white/40">{row.bets} bets · {row.wins}W/{row.losses}L</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                                                        <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Withdrawal requests</p>
                                                        <p className="text-xs text-white/50 mb-2">
                                                            Pending: {walletIntel.aggregates?.withdrawals?.pending?.length ?? 0} · Accepted: {walletIntel.aggregates?.withdrawals?.accepted?.length ?? 0} · Rejected: {walletIntel.aggregates?.withdrawals?.rejected?.length ?? 0}
                                                        </p>
                                                        <div className="text-xs font-mono space-y-1">
                                                            <p className="text-xs uppercase text-white/35">Pending amount by currency</p>
                                                            {Object.entries(walletIntel.aggregates?.withdrawals?.pendingTotalByCurrency || {}).map(([c, v]) => (
                                                                <div key={c} className="flex justify-between text-amber-200/90">
                                                                    <span>{c}</span>
                                                                    <span>{Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                                </div>
                                                            ))}
                                                            {Object.keys(walletIntel.aggregates?.withdrawals?.pendingTotalByCurrency || {}).length === 0 && (
                                                                <span className="text-white/25">No pending withdrawals</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-2">
                                                        <p className="text-xs font-black uppercase tracking-widest text-white/40">Profile & referrals</p>
                                                        <p className="text-sm text-white/60">
                                                            Username:{' '}
                                                            <span className="text-white font-mono">{walletIntel.profile?.username || '—'}</span>
                                                        </p>
                                                        {walletIntel.referral && (
                                                            <p className="text-xs text-white/50 font-mono">
                                                                Code {walletIntel.referral.referral_code} · {walletIntel.referral.referral_count} referrals
                                                                {walletIntel.referral.referred_by ? ` · referred by ${walletIntel.referral.referred_by}` : ''}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 overflow-x-auto">
                                                    <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Recent audit (latest 80)</p>
                                                    <table className="w-full text-left text-sm font-mono">
                                                        <thead>
                                                            <tr className="text-white/35 border-b border-white/10">
                                                                <th className="py-2 pr-4">Time</th>
                                                                <th className="py-2 pr-4">Type</th>
                                                                <th className="py-2 pr-4">CCY</th>
                                                                <th className="py-2 pr-4">Amount</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {walletIntel.recentAudit?.map((r: any) => (
                                                                <tr key={r.id} className="border-b border-white/5 text-white/70">
                                                                    <td className="py-2 pr-4 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                                                                    <td className="py-2 pr-4">{r.operation_type}</td>
                                                                    <td className="py-2 pr-4">{r.currency}</td>
                                                                    <td className="py-2 pr-4">{Number(r.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 overflow-x-auto">
                                                    <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Recent bets (latest 80)</p>
                                                    <table className="w-full text-left text-sm font-mono">
                                                        <thead>
                                                            <tr className="text-white/35 border-b border-white/10">
                                                                <th className="py-2 pr-4">Time</th>
                                                                <th className="py-2 pr-4">Asset</th>
                                                                <th className="py-2 pr-4">Net</th>
                                                                <th className="py-2 pr-4">Won</th>
                                                                <th className="py-2 pr-4">Network</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {walletIntel.recentBets?.map((r: any) => (
                                                                <tr key={r.id} className="border-b border-white/5 text-white/70">
                                                                    <td className="py-2 pr-4 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                                                                    <td className="py-2 pr-4">{r.asset}</td>
                                                                    <td className="py-2 pr-4">{(Number(r.payout) - Number(r.amount)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                                                    <td className="py-2 pr-4">{r.won ? 'yes' : 'no'}</td>
                                                                    <td className="py-2 pr-4">{r.network}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {activeTab === 'users' && (
                                    <Table key="users">
                                        <THead labels={['Identity', 'Token', 'Liquidity', 'Volume']} />
                                        <tbody>
                                            {loading ? <LoadingRow /> : users
                                                .filter(u => !searchTerm || u.user_address.toLowerCase().includes(searchTerm.toLowerCase()) || (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase())))
                                                .map(u => (
                                                    <tr key={u.user_address + u.currency} className="hover:bg-white/[0.02] transition-colors group border-b border-white/5">
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex flex-col">
                                                                <span className="text-white text-sm font-bold">{u.username || 'Anonymous'}</span>
                                                                <a
                                                                    href={getExplorerAddressUrl(u.user_address, u.currency)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    title={u.user_address}
                                                                    className="font-mono text-white/30 text-xs hover:text-white/70 hover:underline transition-colors"
                                                                >
                                                                    {shortenAddress(u.user_address)} ↗
                                                                </a>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5"><LedgerToken currency={u.currency} /></td>
                                                        <td className="px-4 py-3.5 text-white font-mono font-bold">{u.balance.toFixed(4)}</td>
                                                        <td className="px-4 py-3.5 text-white font-mono font-black">
                                                            <span className="inline-flex items-center gap-2">
                                                                {u.activity.totalVolume.toLocaleString()}
                                                                <LedgerToken currency={u.currency} compact />
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </Table>
                                )}

                                {activeTab === 'player_pnl' && (() => {
                                    const bannedSet = new Set(bannedWallets.map(b => b.wallet_address.toLowerCase()));
                                    const sortedPnl = [...playerPnl]
                                        .filter(p => !searchTerm || p.user_address.toLowerCase().includes(searchTerm.toLowerCase()) || (p.username && p.username.toLowerCase().includes(searchTerm.toLowerCase())))
                                        .sort((a, b) => {
                                            const col = pnlSort.col;
                                            const dir = pnlSort.dir;
                                            if (col === 'first_deposit_at') {
                                                const da = a.first_deposit_at ?? '';
                                                const db = b.first_deposit_at ?? '';
                                                return dir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
                                            }
                                            const v = (x: any) => x[col] ?? 0;
                                            return dir === 'desc' ? v(b) - v(a) : v(a) - v(b);
                                        });
                                    const SortTh = ({ col, label }: { col: string; label: string }) => (
                                        <th
                                            className="px-4 py-3 text-left text-xs font-black text-white/30 uppercase tracking-widest cursor-pointer hover:text-white/70 select-none transition-colors"
                                            onClick={() => setPnlSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })}
                                        >
                                            {label}{pnlSort.col === col ? (pnlSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                                        </th>
                                    );
                                    const fmt = (n: number, dec = 6) => n.toFixed(dec).replace(/\.?0+$/, '') || '0';
                                    const fmtJoinedAt = (iso: string) =>
                                        new Date(iso).toLocaleString('en-GB', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                            hour12: false,
                                        });
                                    return (
                                        <div key="player_pnl" className="space-y-4">
                                            <div className="px-8 pt-6 pb-2 text-xs text-white/30 leading-relaxed">
                                                Per-wallet financial summary across all currencies. <strong className="text-white/50">Deposited</strong> = on-chain top-ups. <strong className="text-white/50">Withdrawn</strong> = confirmed payouts. <strong className="text-white/50">Avail. Balance</strong> = funds sitting in the house they can still withdraw. <strong className="text-emerald-400/70">Player P&L</strong> = (Withdrawn + Avail. Balance) − Deposited; positive = user is net-up.
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-white/10">
                                                            <th className="px-4 py-3 text-left text-xs font-black text-white/30 uppercase tracking-widest">Player</th>
                                                            <th className="px-4 py-3 text-left text-xs font-black text-white/30 uppercase tracking-widest">Currency</th>
                                                            <SortTh col="first_deposit_at" label="Joined" />
                                                            <SortTh col="total_deposited" label="Deposited" />
                                                            <SortTh col="total_withdrawn" label="Withdrawn" />
                                                            <SortTh col="current_balance" label="Avail. Balance" />
                                                            <SortTh col="net_pnl" label="Player P&L" />
                                                            <SortTh col="total_bets" label="Bets" />
                                                            <SortTh col="total_wagered" label="Wagered" />
                                                            <SortTh col="total_fees_paid" label="Fees Paid" />
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {loading ? <tr><td colSpan={10} className="px-8 py-10 text-center text-white/20 text-xs">Loading…</td></tr>
                                                         : sortedPnl.length === 0 ? <tr><td colSpan={10} className="px-8 py-10 text-center text-white/20 text-xs">No player data yet.</td></tr>
                                                         : sortedPnl.map((p, i) => {
                                                            const isWinner = p.net_pnl > 0;
                                                            const isLoser  = p.net_pnl < 0;
                                                            const isBanned = bannedSet.has(p.user_address.toLowerCase());
                                                            return (
                                                                <tr key={p.user_address + p.currency} className={`hover:bg-white/[0.02] transition-colors border-b border-white/5 ${isBanned ? 'bg-rose-950/20' : ''}`}>
                                                                    {/* Rank + identity */}
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="text-white/20 font-mono text-xs w-5">#{i + 1}</span>
                                                            <div className="flex flex-col gap-1">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="text-white text-sm font-bold">{p.username || 'Anonymous'}</span>
                                                                                    {isBanned && (
                                                                                        <>
                                                                                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                                                                                ⊘ Banned
                                                                                            </span>
                                                                                            <button
                                                                                                onClick={() => handleUnbanFromPnl(p.user_address)}
                                                                                                disabled={unbanningAddress === p.user_address}
                                                                                                className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                                                                                            >
                                                                                                {unbanningAddress === p.user_address ? '…' : '↑ Unban'}
                                                                                            </button>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                                <a
                                                                                    href={getExplorerAddressUrl(p.user_address, p.currency)}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    title={p.user_address}
                                                                                    className="font-mono text-white/30 text-xs hover:text-white/70 hover:underline transition-colors"
                                                                                >
                                                                                    {shortenAddress(p.user_address)} ↗
                                                                                </a>
                                                                            </div>
                                                            </div>
                                                        </td>
                                                                    {/* Currency */}
                                                                    <td className="px-4 py-3">
                                                                        <LedgerToken currency={p.currency} />
                                                                    </td>
                                                                    {/* Joined */}
                                                                    <td className="px-4 py-3 font-mono text-white/40 text-xs whitespace-nowrap">
                                                                        {p.first_deposit_at
                                                                            ? fmtJoinedAt(p.first_deposit_at)
                                                                            : '—'}
                                                                    </td>
                                                                    {/* Deposited */}
                                                                    <td className="px-4 py-3 font-mono text-white text-sm">{fmt(p.total_deposited)}</td>
                                                                    {/* Withdrawn */}
                                                                    <td className="px-4 py-3 font-mono text-white/70 text-sm">{fmt(p.total_withdrawn)}</td>
                                                                    {/* Available balance — what they can still withdraw */}
                                                                    <td className="px-4 py-3">
                                                                        <span className={`font-mono text-sm font-bold ${p.current_balance > 0 ? 'text-amber-400' : 'text-white/20'}`}>
                                                                            {fmt(p.current_balance)}
                                                            </span>
                                                        </td>
                                                                    {/* Player net P&L */}
                                                                    <td className="px-4 py-3">
                                                                        <span className={`font-mono text-sm font-black ${isWinner ? 'text-emerald-400' : isLoser ? 'text-rose-400' : 'text-white/30'}`}>
                                                                            {isWinner ? '+' : ''}{fmt(p.net_pnl)}
                                                                        </span>
                                                                    </td>
                                                                    {/* Bets */}
                                                                    <td className="px-4 py-3 font-mono text-white/50 text-sm">
                                                                        {p.total_bets}
                                                                        {p.total_bets > 0 && <span className="text-white/20 text-xs"> ({Math.round(p.total_wins / p.total_bets * 100)}% W)</span>}
                                                                    </td>
                                                                    {/* Wagered */}
                                                                    <td className="px-4 py-3 font-mono text-white/50 text-sm">{fmt(p.total_wagered)}</td>
                                                                    {/* Fees Paid */}
                                                                    <td className="px-4 py-3">
                                                                        <span className="font-mono text-xs font-bold text-[#7005FC]" title="Platform fees collected (1% Free, 0.9% Standard, 0.8% VIP on deposits and withdrawals). Historical rows are estimated.">
                                                                            {fmt(p.total_fees_paid)}
                                                                            {(!p._has_explicit_fee) && <span className="text-white/20 text-[10px] ml-1">~</span>}
                                                                        </span>
                                                                    </td>
                                                    </tr>
                                                            );
                                                        })}
                                        </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {activeTab === 'gameplay' && (
                                    <div key="gameplay" className="space-y-6">

                                        {/* ── Mode Analytics Panel ─────────────────────────────── */}
                                        {modeAnalytics && (
                                            <div className="px-8 pt-8 pb-6 border-b border-white/5 space-y-6">
                                                {/* Section header — same style as rest of dashboard */}
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-black uppercase tracking-widest text-white/30">Game Mode P&amp;L</p>
                                                        <p className="text-white/60 text-sm">Real wallets only — per-mode house performance</p>
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 border border-white/10 rounded px-2 py-1">
                                                        {(modeAnalytics.real ?? []).reduce((s: number, m: any) => s + m.totalBets, 0).toLocaleString()} rounds
                                                    </span>
                                                </div>

                                                {/* Mode cards — match rounded-2xl border border-white/10 bg-white/[0.02] */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    {(['binomo', 'box', 'draw'] as const).map(modeKey => {
                                                        const modeLabels: Record<string, string> = { binomo: 'Classic', box: 'Box', draw: 'Draw' };
                                                        const m = (modeAnalytics.real ?? []).find((x: any) => x.mode === modeKey);

                                                        if (!m) return (
                                                            <div key={modeKey} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col gap-2">
                                                                <p className="text-xs font-black uppercase tracking-widest text-white/40">{modeLabels[modeKey]}</p>
                                                                <p className="text-xs text-white/20">No rounds recorded yet</p>
                                                            </div>
                                                        );

                                                        const housePnLPositive = m.housePnL >= 0;
                                                        return (
                                                            <div key={modeKey} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
                                                                {/* Card header */}
                                                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                                                    <p className="text-xs font-black uppercase tracking-widest text-white/50">{modeLabels[modeKey]}</p>
                                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${housePnLPositive ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' : 'border-rose-500/20 text-rose-400 bg-rose-500/5'}`}>
                                                                        {housePnLPositive ? '▲ House profit' : '▼ House loss'}
                                                                    </span>
                                                                </div>

                                                                {/* Key stats — 2×2 grid matching dashboard stat style */}
                                                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">Rounds</p>
                                                                        <p className="text-2xl font-black tabular-nums text-white">{m.totalBets.toLocaleString()}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">Win Rate</p>
                                                                        <p className={`text-2xl font-black tabular-nums ${m.winRate > 52.6 ? 'text-rose-400' : 'text-emerald-400'}`}>{m.winRate}%</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">Wins / Losses</p>
                                                                        <p className="text-sm font-bold tabular-nums">
                                                                            <span className="text-emerald-400">{m.wins.toLocaleString()}</span>
                                                                            <span className="text-white/20"> / </span>
                                                                            <span className="text-rose-400">{m.losses.toLocaleString()}</span>
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">Avg Multiplier</p>
                                                                        <p className="text-sm font-bold tabular-nums text-white/60">{m.avgMultiplier}×</p>
                                                                    </div>
                                                                </div>

                                                                {/* Win-rate bar */}
                                                                <div className="space-y-1.5">
                                                                    <div className="flex justify-between text-[10px] text-white/25">
                                                                        <span className="font-black uppercase tracking-widest">User win rate</span>
                                                                        <span className={`font-bold ${m.winRate > 52.6 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                                            {m.winRate > 52.6
                                                                                ? `+${(m.winRate - 52.6).toFixed(1)}% above break-even`
                                                                                : `${(52.6 - m.winRate).toFixed(1)}% below break-even`}
                                                                        </span>
                                                                    </div>
                                                                    <div className="relative h-1 w-full bg-white/5 rounded-full overflow-visible">
                                                                        <div
                                                                            className={`h-full rounded-full ${m.winRate > 52.6 ? 'bg-rose-500/60' : 'bg-emerald-500/60'}`}
                                                                            style={{ width: `${Math.min(m.winRate, 100)}%` }}
                                                                        />
                                                                        <div className="absolute top-0 h-full w-px bg-white/25" style={{ left: '52.6%' }} />
                                                                    </div>
                                                                </div>

                                                                {/* Per-chain P&L */}
                                                                {Object.keys(m.byChain).length > 0 && (
                                                                    <div className="space-y-2 pt-1 border-t border-white/5">
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25">House P&amp;L by Chain (native units)</p>
                                                                        {Object.entries(m.byChain as Record<string, any>)
                                                                            .filter(([chain]) => ['AUSD', 'MON', 'MONAD'].includes(chain.trim().toUpperCase()))
                                                                            .sort((a, b) => Math.abs(b[1].housePnL) - Math.abs(a[1].housePnL))
                                                                            .slice(0, 4)
                                                                            .map(([chain, c]) => (
                                                                                <div key={chain} className="flex items-center justify-between">
                                                                                    <span className="text-xs font-mono text-white/35">{chain}</span>
                                                                                    <span className="font-mono text-xs font-bold tabular-nums">
                                                                                        <span className={c.housePnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                                                            {c.housePnL >= 0 ? '+' : ''}{c.housePnL.toFixed(4)}
                                                                                        </span>
                                                                                        <span className="text-white/20 text-[10px] ml-1.5">
                                                                                            ({c.wins}/{c.totalBets} wins)
                                                                                        </span>
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                    </div>
                                                                )}

                                                                {/* Top assets */}
                                                                {m.topAssets && m.topAssets.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
                                                                        {m.topAssets.map((a: { asset: string; count: number }) => (
                                                                            <span key={a.asset} className="text-[10px] font-bold px-2 py-0.5 rounded border border-white/8 text-white/30">
                                                                                {a.asset} <span className="text-white/15">{a.count}</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <p className="text-[10px] text-white/20 leading-relaxed">
                                                    Break-even win rate at 1.9× multiplier is 52.6%. Rates <span className="text-rose-400">above</span> this mean the house loses money on that mode.
                                                    P&amp;L values are in each chain&apos;s native token — <span className="text-white/40">do not sum across chains.</span>
                                                </p>
                                            </div>
                                        )}

                                        {/* Filter bar */}
                                        <div className="p-6 border-b border-white/5 flex flex-wrap gap-6 items-center bg-white/[0.01]">
                                            <div className="flex gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
                                                <button
                                                    onClick={() => setGameplayFilter('all')}
                                                    className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${gameplayFilter === 'all' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                                                >
                                                    All Modes
                                                </button>
                                                <button
                                                    onClick={() => setGameplayFilter('real')}
                                                    className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${gameplayFilter === 'real' ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'text-white/40 hover:text-white'}`}
                                                >
                                                    Real Wallet
                                                </button>
                                                <button
                                                    onClick={() => setGameplayFilter('demo')}
                                                    className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${gameplayFilter === 'demo' ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'text-white/40 hover:text-white'}`}
                                                >
                                                    Demo Mode
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { label: 'AUSD', value: 'AUSD' },
                                                    { label: 'MON', value: 'MON' },
                                                ].map(({ label, value }) => (
                                                    <button
                                                        key={value}
                                                        onClick={() => setChainFilter(prev => prev === value ? 'ALL' : value)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight border transition-all ${chainFilter === value ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-white/5 text-white/30 hover:border-white/20'}`}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <Table>
                                            <THead labels={['Time', 'Asset', 'Direction', 'Wager (native)', 'Outcome (native)', 'Node', 'Account']} />
                                            <tbody>
                                                {loading ? <LoadingRow /> : gameHistory
                                                    .filter(b => {
                                                        const isDemo = b.id.toString().startsWith('demo-');
                                                        if (gameplayFilter === 'real' && isDemo) return false;
                                                        if (gameplayFilter === 'demo' && !isDemo) return false;
                                                        return true;
                                                    })
                                                    .filter(b => chainFilter === 'ALL' || (b as any).network === chainFilter)
                                                    .map(b => {
                                                        const isDemo = b.id.toString().startsWith('demo-');
                                                        const net = String((b as { network?: string }).network || 'BNB');
                                                        const tok = tokenSymbolForNetwork(net);
                                                        return (
                                                            <tr key={b.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                                                                <td className="px-4 py-3.5 text-xs font-mono">{new Date(b.created_at).toLocaleString()}</td>
                                                                <td className="px-4 py-3.5 font-black text-white">{b.asset}</td>
                                                                <td className="px-4 py-3.5">
                                                                    <span className={b.direction === 'UP' ? 'text-emerald-400' : 'text-rose-400'}>{b.direction}</span>
                                                                </td>
                                                                <td className="px-4 py-3.5 text-white font-mono tabular-nums">
                                                                    {b.amount.toFixed(4)} <span className="text-xs text-white/35">{tok}</span>
                                                                </td>
                                                                <td className="px-4 py-3.5">
                                                                    <span className={b.won ? 'text-emerald-400 font-bold' : 'text-white/20'}>
                                                                        {b.won
                                                                            ? `+${b.payout.toFixed(4)} ${tok}`
                                                                            : `−${b.amount.toFixed(4)} ${tok}`}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3.5 font-mono text-xs">{shortenAddress(b.wallet_address)}</td>
                                                                <td className="px-4 py-3.5 text-right">
                                                                    <span className={`px-3 py-1 rounded text-xs font-black uppercase ${isDemo ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                                                        {isDemo ? 'Demo' : 'Real'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}

                                {activeTab === 'financial' && (
                                    <div key="financial">
                                    <Table>
                                        <THead labels={['Time', 'Identity', 'Operation', 'Amount', 'Ref']} />
                                        <tbody>
                                            {loading ? <LoadingRow /> : (
                                                <>
                                                    {/* Pending house-balance withdrawals require manual acceptance */}
                                                    {pendingWithdrawals && pendingWithdrawals.length > 0 && pendingWithdrawals.map((w: any) => (
                                                        <tr key={w.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                                                            <td className="px-4 py-3.5 text-xs font-mono">
                                                                {w.requested_at ? new Date(w.requested_at).toLocaleString() : '---'}
                                                            </td>
                                                            <td className="px-4 py-3.5 font-mono text-xs">{shortenAddress(w.user_address)}</td>
                                                            <td className="px-4 py-3.5">
                                                                <span className="text-amber-300 bg-amber-300/10 px-2 py-0.5 rounded uppercase text-xs font-black">
                                                                    pending_withdrawal
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3.5 text-white font-mono font-bold">
                                                                -{Number(w.amount).toFixed(4)} {w.currency}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right">
                                                                <div className="flex gap-2 justify-end">
                                                                    <button
                                                                        onClick={() => acceptWithdrawalRequest(w.id)}
                                                                        className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded text-xs font-black uppercase hover:bg-emerald-500/20 transition-colors"
                                                                    >
                                                                        Accept
                                                                    </button>
                                                                    <button
                                                                        onClick={() => rejectWithdrawalRequest(w.id)}
                                                                        className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded text-xs font-black uppercase hover:bg-rose-500/20 transition-colors"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}

                                                    {/* Existing deposits/withdrawals audit log */}
                                                    {transactions.map(t => {
                                                const explorerUrl = getExplorerUrl(t.currency, t.transaction_hash);
                                                return (
                                                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                                                                <td className="px-4 py-3.5 text-xs font-mono">{new Date(t.created_at).toLocaleString()}</td>
                                                        <td className="px-4 py-3.5 font-mono text-xs">{shortenAddress(t.user_address)}</td>
                                                        <td className="px-4 py-3.5">
                                                                    <span className={t.operation_type === 'deposit' ? 'text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded uppercase text-xs font-black' : 'text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded uppercase text-xs font-black'}>
                                                                {t.operation_type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-white font-mono font-bold">{t.operation_type === 'deposit' ? '+' : '-'}{t.amount.toFixed(4)} {t.currency}</td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            {explorerUrl ? (
                                                                <a
                                                                    href={explorerUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                            className="font-mono text-xs text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-blue-400/30"
                                                                >
                                                                    {t.transaction_hash.slice(0, 10)}...
                                                                </a>
                                                            ) : (
                                                                        <span className="font-mono text-xs text-white/20">{t.transaction_hash || 'INTERNAL'}</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                                </>
                                            )}
                                        </tbody>
                                    </Table>
                                    </div>
                                )}

                                {activeTab === 'markets' && (
                                    <div key="markets" className="p-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                                        {Object.entries(marketSummary).map(([cat, count]) => (
                                            <div key={cat} className="p-8 bg-white/[0.03] border border-white/10 rounded-[2rem] space-y-4">
                                                <p className="text-xs font-black uppercase tracking-widest text-white/40">{cat}</p>
                                                <div className="flex items-end justify-between">
                                                    <h4 className="text-5xl font-black text-white tracking-tight">{count}</h4>
                                                    <p className="text-xs font-bold text-white/20 uppercase pb-2">Active Feeds</p>
                                                </div>
                                                <div className="w-full h-1 bg-white/5 rounded-full">
                                                    <div className="h-full bg-white/40 rounded-full" style={{ width: `${(count / marketTokens.length) * 100}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        <div className="p-8 bg-white/5 border border-white/20 rounded-[2rem] flex flex-col justify-center">
                                            <p className="text-xs font-bold text-white uppercase tracking-widest text-center mb-1">Total Inventory</p>
                                            <p className="text-4xl font-black text-white text-center tracking-tight">{marketTokens.length}</p>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'referrals' && (
                                    <Table key="referrals">
                                        <THead labels={['Identity', 'Personal Code', 'Referred By', 'Network Size', 'Status']} />
                                        <tbody>
                                            {loading ? <LoadingRow /> : users
                                                .filter(u => u.referral?.referral_code && u.referral.referral_code !== 'NONE')
                                                .sort((a, b) => (b.referral?.referral_count || 0) - (a.referral?.referral_count || 0))
                                                .map(u => (
                                                    <tr key={u.user_address} className="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                                                        <td className="px-4 py-3.5 font-mono text-white text-sm">{shortenAddress(u.user_address)}</td>
                                                        <td className="px-4 py-3.5 font-black text-white uppercase tracking-widest">{u.referral?.referral_code}</td>
                                                        <td className="px-4 py-3.5 text-white/40 font-mono text-xs">{u.referral?.referred_by ? shortenAddress(u.referral.referred_by) : 'DIRECT'}</td>
                                                        <td className="px-4 py-3.5">
                                                            <span className="text-xl font-black text-white">{u.referral?.referral_count || 0}</span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <span className={`px-3 py-1 rounded text-sm font-black uppercase ${(u.referral?.referral_count || 0) > 10 ? 'text-[#7005FC] bg-[#7005FC]/10' : (u.referral?.referral_count || 0) > 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/20 bg-white/5'}`}>
                                                                {(u.referral?.referral_count || 0) > 10 ? 'Ambassador' : (u.referral?.referral_count || 0) > 0 ? 'Pro' : 'Starter'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </Table>
                                )}

                                {activeTab === 'danger' && (
                                    <div key="danger" className="space-y-10">

                                    {/* ── High-Frequency Withdrawal Review Queue ─────────── */}
                                    {(frequencyUsers.length > 0 || !loading) && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 px-1">
                                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                            <span className="text-xs font-black uppercase tracking-widest text-amber-400">Manual Review Queue — High Withdrawal Frequency</span>
                                            {frequencyUsers.length > 0 && (
                                                <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-black">{frequencyUsers.length}</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-white/30 px-1 leading-relaxed">
                                            Wallets with <strong className="text-white/50">{10}+ total withdrawals</strong> across any chain. From withdrawal #{10 + 1} onwards every request is queued for manual approval regardless of amount. Review each user's full financial profile before approving.
                                        </p>
                                        {loading ? (
                                            <div className="px-8 py-10 text-center text-xs text-white/20 animate-pulse">Loading…</div>
                                        ) : frequencyUsers.length === 0 ? (
                                            <div className="px-8 py-8 text-center text-xs text-white/20 border border-white/5 rounded-2xl">No frequency-flagged wallets yet.</div>
                                        ) : (
                                        <div className="space-y-4">
                                            {frequencyUsers.map(u => {
                                                const isWinner = u.net_pnl > 0;
                                                const fmt = (n: number) => n.toFixed(6).replace(/\.?0+$/, '') || '0';
                                                return (
                                                <div key={u.user_address} className="border border-amber-400/20 bg-amber-400/[0.03] rounded-2xl p-6 space-y-5">
                                                    {/* Header row */}
                                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <a
                                                                    href={getExplorerAddressUrl(u.user_address, u.currencies?.[0] || 'BNB')}
                                                                    target="_blank" rel="noopener noreferrer"
                                                                    title={u.user_address}
                                                                    className="font-mono text-white text-sm hover:underline hover:text-amber-300 transition-colors"
                                                                >
                                                                    {shortenAddress(u.user_address)} ↗
                                                                </a>
                                                                {u.has_frequency_flag && (
                                                                    <span className="px-2 py-0.5 text-xs font-black uppercase rounded bg-amber-400/20 border border-amber-400/40 text-amber-300 tracking-wider">Frequency Flag</span>
                                                                )}
                                                                {u.currencies?.map((c: string) => (
                                                                    <span key={c} className="px-2 py-0.5 text-xs font-black border border-white/10 rounded uppercase">{c}</span>
                                                                ))}
                                                            </div>
                                                            <p className="text-xs text-white/30">Full wallet: <span className="font-mono">{u.user_address}</span></p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => { setBanAddressInput(u.user_address); setBanReasonInput('High-frequency withdrawal — automated flag'); }}
                                                                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-xs font-bold text-rose-400 uppercase tracking-wide transition-all"
                                                            >
                                                                Pre-fill Ban
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Stats grid */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                                        {[
                                                            { label: 'Total Withdrawals', value: u.total_withdrawals, color: 'text-amber-400', big: true },
                                                            { label: 'Completed', value: u.completed_withdrawals, color: 'text-white' },
                                                            { label: 'Pending Review', value: u.pending_withdrawals, color: u.pending_withdrawals > 0 ? 'text-amber-300' : 'text-white/30' },
                                                            { label: 'Total Deposited', value: fmt(u.total_deposited), color: 'text-white' },
                                                            { label: 'Total Withdrawn', value: fmt(u.total_withdrawn), color: 'text-white/70' },
                                                            { label: 'Avail. Balance', value: fmt(u.total_available_balance), color: u.total_available_balance > 0 ? 'text-amber-300' : 'text-white/30' },
                                                        ].map(s => (
                                                            <div key={s.label} className="bg-black/30 border border-white/5 rounded-xl px-4 py-3 space-y-1">
                                                                <p className="text-white/30 text-xs uppercase tracking-wider">{s.label}</p>
                                                                <p className={`font-mono font-black ${s.color} ${(s as any).big ? 'text-xl' : 'text-sm'}`}>{s.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Player P&L */}
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs text-white/30 uppercase tracking-widest">Player P&L</span>
                                                        <span className={`font-mono font-black text-lg ${isWinner ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                            {isWinner ? '+' : ''}{fmt(u.net_pnl)}
                                                            <span className="text-xs ml-1 font-normal">{isWinner ? '(user is net-UP — house lost)' : '(user is net-DOWN — house won)'}</span>
                                                        </span>
                                                    </div>

                                                    {/* Pending withdrawal requests */}
                                                    {u.pending_requests?.length > 0 && (
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-black uppercase tracking-widest text-white/40">Pending Withdrawal Requests ({u.pending_requests.length})</p>
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full">
                                                                    <thead>
                                                                        <tr className="border-b border-white/10">
                                                                            {['ID', 'Currency', 'Amount', 'Requested', 'Flag', 'Actions'].map(h => (
                                                                                <th key={h} className="px-4 py-2 text-left text-xs font-black text-white/30 uppercase tracking-wider">{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {u.pending_requests.map((r: any) => {
                                                                            const isFreqFlag = typeof r.decided_by === 'string' && r.decided_by.startsWith('FREQUENCY_REVIEW');
                                                                            return (
                                                                                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                                                                    <td className="px-4 py-3 font-mono text-xs text-white/50">#{r.id}</td>
                                                                                    <td className="px-4 py-3"><LedgerToken currency={r.currency} /></td>
                                                                                    <td className="px-4 py-3 font-mono text-white font-bold">{Number(r.amount).toFixed(6)}</td>
                                                                                    <td className="px-4 py-3 text-xs text-white/30 font-mono">{r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}</td>
                                                                                    <td className="px-4 py-3">
                                                                                        {isFreqFlag
                                                                                            ? <span className="text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded">FREQUENCY</span>
                                                                                            : <span className="text-xs text-white/20">AMOUNT</span>
                                                                                        }
                                                                                    </td>
                                                                                    <td className="px-4 py-3">
                                                                                        <div className="flex gap-2">
                                                                                            <button onClick={() => acceptWithdrawalRequest(r.id)} className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded text-xs font-bold text-emerald-400 uppercase transition-all">Accept</button>
                                                                                            <button onClick={() => rejectWithdrawalRequest(r.id)} className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-xs font-bold text-rose-400 uppercase transition-all">Reject</button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                        )}
                                    </div>
                                    )}

                                    {/* ── Global ban list ───────────────────────────── */}
                                    <div className="p-8 bg-rose-500/5 border border-rose-500/20 rounded-[2rem] space-y-4">
                                        <p className="text-xs font-black uppercase tracking-wider text-rose-400/80">Global wallet ban list</p>
                                        <p className="text-sm text-white/40 leading-relaxed max-w-2xl">
                                            Blocks deposits, bets, payouts, and withdrawals for an address across every currency. EVM addresses are matched case-insensitively; Solana and other non-EVM addresses must match exactly.
                                        </p>
                                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-sm font-black uppercase tracking-wider text-white/50">Wallet address</label>
                                                <input
                                                    value={banAddressInput}
                                                    onChange={e => setBanAddressInput(e.target.value)}
                                                    placeholder="0x… or Solana base58…"
                                                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm font-mono placeholder:text-white/20"
                                                />
                                            </div>
                                            <div className="flex-[2] space-y-1">
                                                <label className="text-xs font-black uppercase tracking-widest text-white/30">Reason (optional)</label>
                                                <input
                                                    value={banReasonInput}
                                                    onChange={e => setBanReasonInput(e.target.value)}
                                                    placeholder="e.g. manipulation / abuse"
                                                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-white/20"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={addGlobalBan}
                                                className="px-6 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-black uppercase text-xs tracking-widest rounded-xl transition-all"
                                            >
                                                Ban wallet
                                            </button>
                                        </div>
                                        <Table>
                                            <THead labels={['Address', 'Reason', 'Added', '']} />
                                            <tbody>
                                                {loading ? (
                                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-xs font-black uppercase tracking-widest animate-pulse text-white/20">Loading…</td></tr>
                                                ) : bannedWallets.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="px-4 py-8 text-center text-xs font-black uppercase tracking-widest text-white/15">
                                                            No global bans yet
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    bannedWallets.map(b => (
                                                        <tr key={b.wallet_address} className="border-b border-white/5">
                                                            <td className="px-4 py-4 font-mono text-xs text-white break-all">{b.wallet_address}</td>
                                                            <td className="px-4 py-4 text-white/50 text-xs max-w-xs">{b.reason || '—'}</td>
                                                            <td className="px-4 py-4 text-white/30 text-xs font-mono whitespace-nowrap">
                                                                {new Date(b.created_at).toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeGlobalBan(b.wallet_address)}
                                                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-bold text-white/70 uppercase"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </Table>
                                    </div>

                                    {/* ── Win-streak suspicious users ───────────────── */}
                                    <Table key="danger-table">
                                        <THead labels={['Node Identity', 'Max Streak', 'Pattern', 'Current Status', 'Operations']} />
                                        <tbody>
                                            {loading ? <LoadingRow /> : suspiciousUsers.map(u => (
                                                <tr key={u.user_address} className="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-white text-sm">{shortenAddress(u.user_address)}</span>
                                                            <span className="text-xs text-white/20">Balance: {parseFloat(u.balance).toFixed(4)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className="text-rose-500 font-black text-2xl">{u.maxStreak} wins</span>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex gap-1">
                                                            {u.latestBets.map((won: boolean, i: number) => (
                                                                <div key={i} className={`w-1.5 h-4 rounded-full ${won ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500/20'}`} />
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className={`text-xs font-black uppercase px-2 py-1 rounded ${u.status === 'banned' ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' :
                                                            u.status === 'frozen' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' :
                                                                'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                            }`}>
                                                            {u.status || 'active'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            {u.status !== 'frozen' && u.status !== 'banned' && (
                                                                <button
                                                                    onClick={() => updateUserStatus(u.user_address, 'frozen')}
                                                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded text-xs font-bold text-amber-500 uppercase transition-all"
                                                                >
                                                                    Freeze
                                                                </button>
                                                            )}
                                                            {u.status !== 'banned' && (
                                                                <button
                                                                    onClick={() => updateUserStatus(u.user_address, 'banned')}
                                                                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-xs font-bold text-rose-500 uppercase transition-all"
                                                                >
                                                                    Ban
                                                                </button>
                                                            )}
                                                            {(u.status === 'frozen' || u.status === 'banned') && (
                                                                <button
                                                                    onClick={() => updateUserStatus(u.user_address, 'active')}
                                                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-bold text-white uppercase transition-all"
                                                                >
                                                                    Reactivate
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {suspiciousUsers.length === 0 && !loading && (
                                                <tr>
                                                    <td colSpan={5} className="px-8 py-32 text-center text-sm font-black uppercase tracking-widest text-white/20"> No suspicious activity detected in core neural layers.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </Table>
                                    </div>
                                )}

                                {activeTab === 'waitlist' && (
                                    <Table key="waitlist">
                                        <THead labels={['Position', 'Email Instance', 'Timestamp', 'Status']} />
                                        <tbody>
                                            {loading ? (
                                                <LoadingRow />
                                            ) : waitlist.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-8 py-32 text-center text-xs font-black uppercase tracking-widest text-white/10">
                                                        {waitlistError ? waitlistError : 'No waitlist emails yet.'}
                                                    </td>
                                                </tr>
                                            ) : waitlist.map((w, i) => (
                                                <tr key={w.id} className="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                                                    <td className="px-4 py-3.5 font-mono text-white/20 text-xs">#{waitlist.length - i}</td>
                                                    <td className="px-4 py-3.5 font-bold text-white tracking-tight">{w.email}</td>
                                                    <td className="px-4 py-3.5 text-white/40 text-xs uppercase font-mono">{new Date(w.created_at).toLocaleString()}</td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-black uppercase text-white/40">Registered</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                )}

                                {activeTab === 'access_codes' && (
                                    <div key="access_codes">
                                        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                                            <p className="text-xs font-black uppercase tracking-wider text-white/30">Code Generator</p>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={exportAccessCodes}
                                                    className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-black uppercase text-xs tracking-widest rounded-lg hover:bg-blue-500/20 transition-all"
                                                >
                                                    Export to Google Sheets (CSV)
                                                </button>
                                                <button
                                                    onClick={() => generateAccessCodes(5)}
                                                    className="px-4 py-2 bg-white text-black font-black uppercase text-xs tracking-widest rounded-lg hover:bg-gray-200 transition-all"
                                                >
                                                    Generate 5 Codes
                                                </button>
                                            </div>
                                        </div>
                                        <Table>
                                            <THead labels={['Access Code', 'Status', 'Wallet Link', 'Authorized At']} />
                                            <tbody>
                                                {loading ? <LoadingRow /> : accessCodes.map(c => (
                                                    <tr key={c.code} className="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                                                        <td className="px-4 py-3.5 font-mono font-black text-white text-xl tracking-widest uppercase">{c.code}</td>
                                                        <td className="px-4 py-3.5">
                                                            <span className={`px-3 py-1 rounded text-sm font-black uppercase ${c.is_used ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                                                {c.is_used ? 'Consumed' : 'Ready'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 font-mono text-xs text-white/40">
                                                            {c.wallet_address ? shortenAddress(c.wallet_address) : 'UNLINKED'}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right text-white/20 text-xs font-mono">
                                                            {c.used_at ? new Date(c.used_at).toLocaleString() : '---'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}

                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Minimal Components
const StatBox = ({ title, value, label }: any) => (
    <div className="rounded-2xl border border-[#232323] bg-[#101010] px-4 py-4">
        <p className="text-xs text-[#B781FE]">{title}</p>
        <p className="mt-2 text-2xl text-white">{value}</p>
        <p className="mt-1 text-xs leading-5 text-[#DDD7FE]">{label}</p>
    </div>
);

const TabBtn = ({ active, onClick, label }: any) => (
    <button type="button" onClick={onClick} className={`h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-sm ${active ? 'bg-[#7005FC] text-white' : 'border border-[#2a2a2a] bg-[#141414] text-[#DDD7FE]'}`}>
        {label}
    </button>
);

const Table = ({ children }: any) => <table className="w-full min-w-[640px] text-left border-collapse">{children}</table>;

const THead = ({ labels }: { labels: string[] }) => (
    <thead>
        <tr className="border-b border-[#232323] text-xs text-[#B781FE]">
            {labels.map((l, i) => (
                <th key={l} className={`px-4 py-3.5 ${i === labels.length - 1 ? 'text-right' : ''}`}>{l}</th>
            ))}
        </tr>
    </thead>
);

const LoadingRow = () => (
    <tr><td colSpan={10} className="px-8 py-16 text-center text-sm text-[#DDD7FE]">Loading.</td></tr>
);
