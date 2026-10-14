'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { CheckCircle2, Clock3, ExternalLink, Search, XCircle } from 'lucide-react';

type WithdrawalRow = {
  id: number;
  user_address: string;
  currency: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  status: 'pending' | 'accepted' | 'rejected';
  requested_at: string;
  decided_at?: string | null;
  tx_hash?: string | null;
  fee_tx_hash?: string | null;
};

function getExplorerUrl(_currency: string, hash: string | null | undefined) {
  if (!hash || hash === 'INTERNAL' || hash === 'PENDING') return null;
  return `https://monadvision.com/tx/${hash}`;
}

const MONAD_ASSETS = new Set(['AUSD', 'MON']);

function assetLabel(currency: string) {
  return currency.toUpperCase() === 'MON' ? 'MON' : 'AUSD';
}

function shortHash(hash: string) {
  if (hash.length < 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const text = n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return text || '0';
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusPill({ status }: { status: WithdrawalRow['status'] }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#B781FE]">
        <Clock3 className="h-3.5 w-3.5" />
        Waiting
      </span>
    );
  }
  if (status === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#82FF68]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#FF5C7A]">
      <XCircle className="h-3.5 w-3.5" />
      Rejected
    </span>
  );
}

export default function WithdrawalsPage() {
  const address = useStore((s) => s.address);
  const isConnected = useStore((s) => s.isConnected);
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | WithdrawalRow['status']>('all');
  const [query, setQuery] = useState('');

  const fetchRows = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/withdrawals?address=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error('Failed to load withdrawals');
      const data = await res.json();
      setRows(data.withdrawals || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    const int = setInterval(fetchRows, 30_000);
    return () => clearInterval(int);
  }, [address]);

  const monadRows = useMemo(
    () => rows.filter((row) => MONAD_ASSETS.has(String(row.currency || '').toUpperCase())),
    [rows],
  );

  const counts = useMemo(() => {
    const pending = monadRows.filter((r) => r.status === 'pending').length;
    const accepted = monadRows.filter((r) => r.status === 'accepted').length;
    const rejected = monadRows.filter((r) => r.status === 'rejected').length;
    return { pending, accepted, rejected };
  }, [monadRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monadRows
      .filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter))
      .filter((r) => {
        if (!q) return true;
        const tx = String(r.tx_hash || '').toLowerCase();
        const feeTx = String(r.fee_tx_hash || '').toLowerCase();
        const cur = String(r.currency || '').toLowerCase();
        return tx.includes(q) || feeTx.includes(q) || cur.includes(q);
      })
      .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
  }, [monadRows, statusFilter, query]);

  if (!isConnected || !address) {
    return (
      <div className="monad-page mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-2xl text-white">Withdrawals</h1>
        <p className="mt-2 text-sm leading-6 text-[#E4E4E4]">Connect a wallet to see AUSD and MON withdrawals on Monad.</p>
        <Link href="/trade" className="neon-btn mt-6 h-11 w-fit px-5 text-sm">
          Go to trade
        </Link>
      </div>
    );
  }

  return (
    <div className="monad-page mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Monad</p>
          <h1 className="mt-1 text-2xl text-white">Withdrawals</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#E4E4E4]">
            AUSD and MON payouts. Amounts at or under $10 are sent from the treasury. Larger ones stay here until they are reviewed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchRows}
            className="h-10 rounded-full border border-white/10 px-4 text-sm text-[#E4E4E4] transition hover:text-white"
          >
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <Link href="/trade" className="neon-btn h-10 px-4 text-sm">
            Back to trade
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto">
          {([
            ['all', `All ${monadRows.length}`],
            ['pending', `Waiting ${counts.pending}`],
            ['accepted', `Sent ${counts.accepted}`],
            ['rejected', `Rejected ${counts.rejected}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`h-9 shrink-0 rounded-full px-3 text-sm ${
                statusFilter === key
                  ? 'bg-[#7005FC] text-white'
                  : 'border border-white/10 text-[#E4E4E4] hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B781FE]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a transaction"
            className="h-10 w-full rounded-full border border-white/10 bg-[#15111B] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#E4E4E4]/70 focus:border-[#7005FC]"
          />
        </div>
      </div>

      <div className="mt-4">
        {loading && rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#15111B] px-5 py-10 text-center text-sm text-[#E4E4E4]">Loading withdrawals.</div>
        ) : monadRows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#15111B] px-5 py-10 text-center">
            <p className="text-base text-white">No Monad withdrawals</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#E4E4E4]">
              This wallet has no AUSD or MON withdrawals yet.
            </p>
            <Link href="/trade" className="neon-btn mt-5 inline-flex h-11 px-5 text-sm">
              Back to trade
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#15111B] px-5 py-10 text-center">
            <p className="text-base text-white">No matches</p>
            <p className="mt-2 text-sm text-[#E4E4E4]">Try another status or clear the search.</p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setQuery('');
              }}
              className="mt-5 h-10 rounded-full border border-white/10 px-4 text-sm text-white"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => {
              const link = getExplorerUrl(r.currency, r.tx_hash || null);
              return (
                <li key={r.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#15111B] px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg text-white">
                      {formatAmount(Number(r.net_amount))} <span className="font-sans text-sm text-[#7005FC]">{assetLabel(r.currency)}</span>
                    </p>
                    <p className="mt-1 text-xs text-[#E4E4E4]">
                      {formatWhen(r.requested_at)}
                      {Number(r.fee_amount) > 0 ? ` · fee ${formatAmount(Number(r.fee_amount))}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill status={r.status} />
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-[#B781FE] hover:text-white"
                      >
                        {shortHash(r.tx_hash || '')}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
