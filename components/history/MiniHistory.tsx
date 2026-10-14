'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';

export const MiniHistory: React.FC = () => {
    const bets = useStore((state) => state.bets);
    const network = useStore((state) => state.network);
    const isIndicatorsOpen = useStore((state) => state.isIndicatorsOpen);
    const setIsIndicatorsOpen = useStore((state) => state.setIsIndicatorsOpen);
    const activeIndicators = useStore((state) => state.activeIndicators);
    const gameMode = useStore((state) => state.gameMode);
    const [isOpen, setIsOpen] = useState(false);
    const [narrow, setNarrow] = useState(false);
    const parkLeft = (gameMode === 'box' || gameMode === 'draw') && narrow;

    React.useEffect(() => {
        const media = window.matchMedia('(max-width: 639px)');
        const apply = () => setNarrow(media.matches);
        apply();
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, []);

    React.useEffect(() => {
        const open = () => {
            setIsOpen(true);
            setIsIndicatorsOpen(false);
        };
        const close = () => setIsOpen(false);
        window.addEventListener('monblip-tour-history', open);
        window.addEventListener('monblip-tour-history-close', close);
        return () => {
            window.removeEventListener('monblip-tour-history', open);
            window.removeEventListener('monblip-tour-history-close', close);
        };
    }, [setIsIndicatorsOpen]);

    const recentBets = bets.slice(0, 10);
    const unit =
        network === 'BASE' ? 'USDC'
            : network === 'TEMPO' ? 'OUSD'
                : network === 'SOL' ? 'SOL'
                    : network === 'ROBINHOOD' || network === 'ARB' ? 'ETH'
                        : '';

    return (
        <div
            className="fixed bottom-[calc(var(--trade-sheet,0px)+max(0.75rem,env(safe-area-inset-bottom)))] right-3 z-[40] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:bottom-4 sm:right-4 sm:z-[60]"
            style={parkLeft ? { top: 248, left: 12, right: 'auto', bottom: 'auto', alignItems: 'flex-start' } : undefined}
        >
            {/* Mini History List */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        data-tour="history-panel"
                        className="mb-1 w-[min(100vw-2rem,20rem)] overflow-hidden rounded-3xl border border-[#2a2a2a] bg-[#0c0c0c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                    >
                        <div className="flex items-start justify-between px-4 pb-2 pt-4">
                            <div>
                                <h4 className="text-[15px] font-medium text-white">History</h4>
                                <p className="mt-0.5 text-xs text-[#DDD7FE]">Your last settled trades.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[#DDD7FE] transition hover:bg-white/10 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="max-h-[320px] overflow-y-auto px-2 pb-2">
                            {recentBets.length > 0 ? (
                                <div className="space-y-1.5">
                                    {recentBets.map((bet) => (
                                        <div key={bet.id} className="flex items-center gap-3 rounded-2xl border border-[#232323] bg-[#141414] px-3 py-2.5">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${bet.won ? 'bg-[#5cec8a]' : 'bg-[#ff5c5c]'}`} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-medium text-white">
                                                    {bet.target.label}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-[#DDD7FE]">
                                                    {new Date(bet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-[13px] font-medium tabular-nums ${bet.won ? 'text-[#5cec8a]' : 'text-[#ff5c5c]'}`}>
                                                    {bet.won
                                                        ? `+${parseFloat(bet.payout).toFixed(4)}`
                                                        : `-${parseFloat(bet.amount).toFixed(4)}`}
                                                </p>
                                                {unit && (
                                                    <p className="mt-0.5 text-[11px] text-[#DDD7FE]">{unit}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <p className="px-2 py-1.5 text-center text-[11px] text-[#B781FE]">Last 10 trades</p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-[#2a2a2a] px-4 py-8 text-center">
                                    <p className="text-sm text-white">No trades yet</p>
                                    <p className="mt-1 text-xs text-[#DDD7FE]">Settled bets will show up here.</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Trigger Buttons Row */}
            <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5 pb-1 sm:flex-nowrap sm:gap-2" style={parkLeft ? { flexDirection: 'column', alignItems: 'flex-start' } : undefined}>
                {/* Indicators Toggle */}
                <button
                    onClick={() => {
                        const next = !isIndicatorsOpen;
                        setIsIndicatorsOpen(next);
                        if (next) setIsOpen(false);
                    }}
                    data-tour="indicators-trigger"
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-medium transition sm:gap-2 sm:px-4 ${isIndicatorsOpen || Object.values(activeIndicators).some(v => v)
                        ? 'border-[#7005FC] bg-[#7005FC] text-white'
                        : 'border-[#2a2a2a] bg-[#141414] text-white hover:border-[#7005FC]'
                        }`}
                    style={parkLeft ? { padding: 8, position: 'relative' } : undefined}
                >
                    <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span style={parkLeft ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } : undefined}>Indicators</span>
                    {Object.values(activeIndicators).filter(Boolean).length > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#070010] px-1 text-[10px] text-[#7005FC]">
                            {Object.values(activeIndicators).filter(Boolean).length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => {
                        const next = !isOpen;
                        setIsOpen(next);
                        if (next) setIsIndicatorsOpen(false);
                    }}
                    data-tour="active-bets"
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-medium transition sm:gap-2 sm:px-4 ${isOpen
                        ? 'border-[#7005FC] bg-[#7005FC] text-white'
                        : 'border-[#2a2a2a] bg-[#141414] text-white hover:border-[#7005FC]'
                        }`}
                    style={parkLeft ? { padding: 8, position: 'relative' } : undefined}
                >
                    <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span style={parkLeft ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } : undefined}>History</span>
                    {bets.length > 0 && (
                        <span className={`h-1.5 w-1.5 rounded-full ${bets[0].won ? 'bg-[#5cec8a]' : 'bg-[#ff5c5c]'}`} />
                    )}
                </button>
            </div>

        </div>
    );
};
