'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/hooks/useToast';
import { openReferralShareOnX, referralLandingUrl } from '@/lib/referral/shareOnX';
import { displayReferralCode } from '@/lib/brand/names';

function shorten(addr: string) {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function ReferralPage() {
    const {
        address,
        isConnected,
        referralCode,
        referralCount,
        referralLeaderboard,
        isLoadingReferrals,
        fetchReferralLeaderboard,
        fetchReferralInfo,
        setConnectModalOpen,
    } = useStore();

    const toast = useToast();
    const [copied, setCopied] = useState<'code' | 'link' | null>(null);

    useEffect(() => {
        fetchReferralLeaderboard();
    }, [fetchReferralLeaderboard]);

    useEffect(() => {
        if (isConnected && address) fetchReferralInfo(address);
    }, [isConnected, address, fetchReferralInfo]);

    const shownReferralCode = displayReferralCode(referralCode);
    const referralLink = shownReferralCode ? referralLandingUrl(shownReferralCode) : '';
    const ranked = (referralLeaderboard || []).filter((entry) => Number(entry.referral_count) > 0);

    const copy = async (text: string, kind: 'code' | 'link') => {
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(kind);
        toast.success(kind === 'code' ? 'Code copied' : 'Link copied');
        setTimeout(() => setCopied(null), 1600);
    };

    return (
        <div className="monad-page bg-[#FCFBFF] text-[#1A1330]">
            <div className="rh-container py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-12">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="rh-display text-[clamp(2rem,8vw,3.5rem)]">Referrals</h1>
                        <p className="mt-3 max-w-lg text-[15px] leading-6 text-[#DDD7FE]">
                            Share your link. Anyone who joins MonBlip with it is counted on your wallet.
                        </p>
                    </div>
                    <Link href="/trade" className="neon-btn h-11 w-full shrink-0 px-5 text-sm sm:h-10 sm:w-auto">Open the chart</Link>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#7005FC]/40 bg-[#7005FC]/10 px-4 py-4">
                        <p className="text-xs text-[#7005FC]">People joined</p>
                        <p className="mt-2 text-3xl text-white">{isConnected ? referralCount || 0 : '—'}</p>
                        <p className="mt-1 text-xs text-[#DDD7FE]">Counted once, when they register</p>
                    </div>
                    {[
                        ['1', 'Share the link', 'It opens MonBlip with your code already attached.'],
                        ['2', 'They connect', 'A new wallet that arrives from the link is stored as yours.'],
                    ].map(([step, title, body]) => (
                        <div key={step} className="rounded-2xl border border-[#232323] bg-[#101010] px-4 py-4">
                            <p className="text-xs text-[#B781FE]">Step {step}</p>
                            <p className="mt-2 text-sm text-white">{title}</p>
                            <p className="mt-1 text-xs leading-5 text-[#DDD7FE]">{body}</p>
                        </div>
                    ))}
                </div>

                <section className="panel mt-4 p-5 sm:p-6">
                    {isConnected ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                                <p className="text-xs text-[#B781FE]">Your code</p>
                                <p className="mt-2 break-all rounded-xl border border-[#2a2a2a] bg-black px-4 py-3 font-mono text-base text-white">{shownReferralCode || '—'}</p>
                                <button
                                    type="button"
                                    disabled={!shownReferralCode}
                                    onClick={() => copy(shownReferralCode || '', 'code')}
                                    className="mt-2 h-10 w-full rounded-full bg-[#7005FC] text-sm text-white disabled:opacity-40"
                                >
                                    {copied === 'code' ? 'Copied' : 'Copy code'}
                                </button>
                            </div>
                            <div>
                                <p className="text-xs text-[#B781FE]">Your link</p>
                                <p className="mt-2 break-all rounded-xl border border-[#2a2a2a] bg-black px-4 py-3 font-mono text-sm leading-6 text-[#DDD7FE]">{referralLink || '—'}</p>
                                <button
                                    type="button"
                                    disabled={!referralLink}
                                    onClick={() => copy(referralLink, 'link')}
                                    className="mt-2 h-10 w-full rounded-full border border-[#B781FE]/40 text-sm text-white disabled:opacity-40"
                                >
                                    {copied === 'link' ? 'Copied' : 'Copy link'}
                                </button>
                            </div>
                            <button
                                type="button"
                                disabled={!referralLink}
                                onClick={() => referralLink && openReferralShareOnX(referralLink)}
                                className="neon-btn h-11 text-sm disabled:opacity-40 lg:col-span-2"
                            >
                                Share on X
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-start gap-4 py-2">
                            <p className="text-base text-white">Connect a wallet to get a code.</p>
                            <p className="max-w-md text-sm leading-6 text-[#DDD7FE]">
                                The code stays with the wallet. Another wallet gets its own code.
                            </p>
                            <button type="button" onClick={() => setConnectModalOpen(true)} className="neon-btn h-11 w-full px-5 text-sm sm:w-auto">
                                Connect
                            </button>
                        </div>
                    )}
                </section>

                <section className="panel mt-4 overflow-hidden">
                    <div className="border-b border-[#232323] px-5 py-4">
                        <h2 className="text-base text-white">Top referrers</h2>
                    </div>
                    {isLoadingReferrals && ranked.length === 0 ? (
                        <p className="px-5 py-16 text-center text-sm text-[#DDD7FE]">Loading referrers.</p>
                    ) : ranked.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-sm text-white">No referrals yet.</p>
                            <p className="mt-2 text-sm text-[#DDD7FE]">The board fills in after the first wallet joins from a link.</p>
                        </div>
                    ) : (
                        <>
                        <ul className="sm:hidden">
                            {ranked.map((entry, index) => {
                                const mine = address != null && (
                                    address.toLowerCase() === entry.user_address.toLowerCase()
                                    || shorten(address) === entry.user_address
                                );
                                return (
                                    <li key={`${entry.user_address}-${index}`} className={`flex items-center gap-3 border-b border-[#232323] px-4 py-3.5 last:border-0 ${mine ? 'bg-[#7005FC]/10' : ''}`}>
                                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs ${index < 3 ? 'bg-[#7005FC] text-white' : 'bg-[#141414] text-[#DDD7FE]'}`}>
                                            {index + 1}
                                        </span>
                                        <p className="min-w-0 flex-1 truncate font-mono text-sm text-white">
                                            {shorten(entry.user_address)}
                                            {mine ? <span className="ml-2 font-sans text-xs text-[#7005FC]">You</span> : null}
                                        </p>
                                        <p className="font-mono text-sm text-[#7005FC]">{entry.referral_count}</p>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="hidden overflow-x-auto sm:block">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-[#232323] text-xs text-[#B781FE]">
                                        <th className="px-5 py-3 font-medium">#</th>
                                        <th className="px-5 py-3 font-medium">Wallet</th>
                                        <th className="px-5 py-3 text-right font-medium">Joined</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ranked.map((entry, index) => {
                                        const mine = Boolean(address) && (
                                            address!.toLowerCase() === entry.user_address.toLowerCase()
                                            || shorten(address!) === entry.user_address
                                        );
                                        return (
                                        <tr key={`${entry.user_address}-${index}`} className={`border-b border-[#232323] last:border-0 ${mine ? 'bg-[#7005FC]/10' : ''}`}>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs ${index < 3 ? 'bg-[#7005FC] text-white' : 'bg-[#141414] text-[#DDD7FE]'}`}>
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 font-mono text-sm text-white">
                                                {entry.user_address}
                                                {mine ? <span className="ml-2 font-sans text-xs text-[#7005FC]">You</span> : null}
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-mono text-sm text-[#7005FC]">{entry.referral_count}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
