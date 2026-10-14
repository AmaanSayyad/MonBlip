'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { LiveChart } from './';
import { CreClose } from './CreClose';
import { HedgeDesk } from './HedgeDesk';
import { NansenDesk } from './NansenDesk';
import { SlipDesk } from './SlipDesk';
import { BalanceDisplay } from '@/components/balance';
import { startPriceFeed } from '@/lib/store/gameSlice';
import { blitzTokenForUsd, blitzTreasury, formatBlitzToken } from '@/lib/fees/blitzEntry';
import { useToast } from '@/lib/hooks/useToast';
import { OPEN_DEPOSIT_EVENT, OPEN_WITHDRAW_EVENT, hasPendingDeposit, hasPendingWithdraw } from '@/lib/ui/depositPrompt';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, ShieldCheck, Loader2, Wallet } from 'lucide-react';
import posthog from 'posthog-js';


export const GameBoard: React.FC = () => {
  const {
    address,
    isConnected,
    network,
    walletBalance,
    houseBalance,
    bets,
    gameMode,
    setGameMode,
    setTimeframeSeconds,
    selectedAsset,
    updatePrice,
    placeBetFromHouseBalance,
    isBlitzActive,
    blitzEndTime,
    nextBlitzTime,
    hasBlitzAccess,
    updateBlitzTimer,
    enableBlitzAccess,
    assetPrices,
    error,
    clearError,
    isLoading: isLoadingBalance,
    activeTab,
    setConnectModalOpen,
    setActiveTab,
    userTier,
    refreshWalletBalance,
    accessCode,
    fetchProfile,
    selectedCurrency,
    setSelectedCurrency,
  } = useStore();

  const toast = useToast();

  const [betAmount, setBetAmount] = useState<string>('0.1');
  // Default box-mode settings (when user lands on /trade):
  // - Quick Amount: 0.1
  // - Expiration Time: 5s
  const [selectedDuration, setSelectedDuration] = useState<number>(5);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sheetRef.current;
    const apply = () => {
      const mobile = window.matchMedia('(max-width: 639px)').matches;
      if (!mobile || !isPanelOpen || !node) {
        document.documentElement.style.setProperty('--trade-sheet', '0px');
        return;
      }
      const inset = Math.max(0, Math.ceil(window.innerHeight - node.getBoundingClientRect().top));
      document.documentElement.style.setProperty('--trade-sheet', `${inset}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    if (node) observer.observe(node);
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--trade-sheet');
    };
  }, [isPanelOpen, gameMode, activeTab]);
  const isTourOpen = useStore((state) => state.isTourOpen);
  useEffect(() => {
    if (isTourOpen) setIsPanelOpen(true);
  }, [isTourOpen]);
  useEffect(() => {
    const open = () => {
      setIsPanelOpen(true);
      setActiveTab('wallet');
    };
    if (hasPendingDeposit() || hasPendingWithdraw()) open();
    window.addEventListener(OPEN_DEPOSIT_EVENT, open);
    window.addEventListener(OPEN_WITHDRAW_EVENT, open);
    return () => {
      window.removeEventListener(OPEN_DEPOSIT_EVENT, open);
      window.removeEventListener(OPEN_WITHDRAW_EVENT, open);
    };
  }, [setActiveTab]);

  const [blitzCountdown, setBlitzCountdown] = useState<string>('');
  const [blitzTimeRemaining, setBlitzTimeRemaining] = useState<string>('');
  const [isActivatingBlitz, setIsActivatingBlitz] = useState(false);
  const [walletPanelBalance, setWalletPanelBalance] = useState<number | null>(null);
  const [accessInput, setAccessInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Refresh the on-chain wallet figure when the chain or account changes.
  useEffect(() => {
    if (!isConnected || !address || !network) return;
    void refreshWalletBalance();
  }, [selectedCurrency, isConnected, address, network, refreshWalletBalance]);

  useEffect(() => {
    if (!isConnected || !address || !network || activeTab !== 'wallet') return;
    const timer = window.setInterval(() => void refreshWalletBalance(), 12_000);
    return () => window.clearInterval(timer);
  }, [isConnected, address, network, activeTab, refreshWalletBalance]);

  useEffect(() => {
    let cancelled = false;
    const loadWalletPanelBalance = async () => {
      if (!isConnected || !address || !network) {
        if (!cancelled) setWalletPanelBalance(null);
        return;
      }
      try {
        if (!cancelled) setWalletPanelBalance(walletBalance);
      } catch {
        if (!cancelled) setWalletPanelBalance(walletBalance);
      }
    };

    void loadWalletPanelBalance();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, network, selectedCurrency, walletBalance]);

  // Unified balance and currency
  const currencySymbol = selectedCurrency === 'MON' ? 'MON' : 'AUSD';
  // $0.10 in the chain's play token, paid to that chain's treasury.
  const blitzEntryFee = blitzTokenForUsd(network, assetPrices);

  // Connection status
  const isWalletConnected = !!address;
  const isUnauthorized = false; // Access codes disabled

  const handleEnterBlitz = async () => {
    if (!isWalletConnected || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!isBlitzActive) {
      toast.error("Blitz Round is not currently active");
      return;
    }

    if (blitzEntryFee == null) {
      toast.error("The token price is not ready, so the $0.10 fee cannot be priced yet.");
      return;
    }

    const treasury = blitzTreasury(network);
    if (!treasury) {
      toast.error("This chain’s treasury is not configured.");
      return;
    }

    try {
      setIsActivatingBlitz(true);
      
      // Track Blitz entry attempt (no wallet address sent to third-party analytics)
      posthog.capture('blitz_entry_started', {
        network,
        entryFee: blitzEntryFee
      });

      const { sendPlayDeposit } = await import('@/lib/monad/playWallet');
      toast.info(`Confirming ${formatBlitzToken(blitzEntryFee)} AUSD ($0.10)…`);
      await sendPlayDeposit('AUSD', blitzEntryFee, treasury as `0x${string}`);

      toast.success("Payment successful! Blitz Mode enabled.");
      enableBlitzAccess();
      refreshWalletBalance();
      
      // Track successful Blitz entry (sanitized - no wallet address)
      posthog.capture('blitz_entry_success', {
        network,
        entryFee: blitzEntryFee
        // address removed to protect user privacy
      })
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Blitz entry failed:", err.message || err);
      }
      const errorMessage = err.message || "";
      
      // Track Blitz entry failure (sanitized - no wallet address)
      posthog.capture('blitz_entry_failed', {
        network,
        error: errorMessage
        // address removed to protect user privacy
      })
      
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('User rejected')) {
        toast.error("User rejected");
      } else {
        toast.error(errorMessage || "Failed to enter Blitz Round");
      }
    } finally {
      setIsActivatingBlitz(false);
    }
  };

  const handleValidateAccess = async () => {
    if (!accessInput || isValidating || !address) return;
    setIsValidating(true);
    setAccessError(null);

    try {
      const { balanceMutationHeaders } = await import('@/lib/balance/balanceClientHeaders');
      const res = await fetch('/api/validate-access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...balanceMutationHeaders() },
        body: JSON.stringify({
          code: accessInput.trim().toUpperCase(),
          walletAddress: address
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        await fetchProfile(address);
        toast.success("Access authorized!");
      } else {
        setAccessError(data.error || 'Invalid code');
      }
    } catch (err) {
      setAccessError('Neural connection failed');
    } finally {
      setIsValidating(false);
    }
  };

  // Update Blitz Timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      updateBlitzTimer();
      const now = Date.now();
      if (isBlitzActive && blitzEndTime) {
        const remaining = Math.max(0, blitzEndTime - now);
        setBlitzTimeRemaining(`${Math.floor(remaining / 1000)}s`);
        setBlitzCountdown('');
      } else {
        const timeToNext = Math.max(0, nextBlitzTime - now);
        const mins = Math.floor(timeToNext / 60000);
        const secs = Math.floor((timeToNext % 60000) / 1000);
        setBlitzCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
        setBlitzTimeRemaining('');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isBlitzActive, blitzEndTime, nextBlitzTime, updateBlitzTimer]);

  // Identify user when wallet connects — use a one-way hash of the address
  // so PostHog receives a stable anonymous ID without the raw wallet address.
  // This keeps session stitching while protecting user privacy.
  useEffect(() => {
    if (address) {
      // Simple deterministic hash: last 12 chars is NOT sufficient, use a digest approach
      // We XOR-fold a basic hash to create a stable non-reversible identifier
      const simpleHash = address
        .split('')
        .reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
      const anonymousId = `u_${Math.abs(simpleHash).toString(36)}_${address.slice(-6)}`;
      posthog.identify(anonymousId, {
        // Never send raw wallet address to third-party analytics
        network,
        hasBlitzAccess,
        userTier,
        hasAccessCode: !!accessCode
      });
    }
  }, [address, network, hasBlitzAccess, userTier, accessCode])


  // Sync selectedDuration with store's timeframeSeconds
  useEffect(() => {
    // Classic: duration picker affects both betting window & grid
    if (gameMode === 'binomo') {
      setTimeframeSeconds(selectedDuration);
      return;
    }

    // Box/Draw: keep draw sizing/parity stable with the reference behavior
    if (gameMode === 'draw') {
      setTimeframeSeconds(5);
      return;
    }

    // Box keeps the existing behavior
    setTimeframeSeconds(selectedDuration);
  }, [selectedDuration, setTimeframeSeconds, gameMode]);

  // Multiplier mapping based on duration
  const getMultiplier = (duration: number) => {
    switch (duration) {
      case 5: return 1.75;
      case 10: return 1.80;
      case 15: return 1.85;
      case 30: return 1.90;
      case 60: return 1.95;
      default: return 1.90;
    }
  };

  const stakeValue = parseFloat(betAmount || '0');
  const needsDeposit = !!error && (
    /no house balance|insufficient house|user not found/i.test(error) ||
    ((houseBalance || 0) < (Number.isFinite(stakeValue) ? stakeValue : 0) && /service unavailable|temporarily unavailable/i.test(error))
  );

  useEffect(() => {
    if (needsDeposit) setActiveTab('wallet');
  }, [needsDeposit, setActiveTab]);

  const placeClassicBet = async (direction: 'UP' | 'DOWN') => {
    if (!address || !isWalletConnected || gameMode !== 'binomo' || isUnauthorized) return;

    try {
      const multiplier = getMultiplier(selectedDuration);
      // Track bet placement (sanitized - no wallet address or specific amounts)
      posthog.capture('bet_placed', {
        direction,
        // amount removed to protect financial privacy
        multiplier,
        duration: selectedDuration,
        asset: selectedAsset,
        network,
        currency: currencySymbol
        // wallet address never sent to analytics
      })

      // House balance only — /api/balance/bet deducts Supabase balance; no on-chain stake per bet.
      await placeBetFromHouseBalance(
        betAmount,
        `${direction}-${multiplier}-${selectedDuration}`,
        address,
        undefined,
      );
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Failed to place bet:", err instanceof Error ? err.message : err);
      }
      
      // Track bet failure (sanitized - no wallet address or specific amounts)
      posthog.capture('bet_failed', {
        direction,
        // amount removed to protect financial privacy
        error: err instanceof Error ? err.message : 'Unknown error',
        network
        // wallet address never sent to analytics
      })
    }
  };

  const activeWalletBalance = walletPanelBalance ?? walletBalance;

  const formatAddress = (addr: string) => {
    if (!addr || addr.length <= 10) return addr || '---';
    return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
  };

  return (
    <div className="relative w-full h-full flex overflow-hidden">
      {/* Main Interactive Chart */}
      <div className="absolute inset-0">
        <LiveChart
          betAmount={betAmount}
          setBetAmount={setBetAmount}
        />
      </div>

      {/* Blitz Round Indicator - Top Right */}
      <div className={`absolute top-3 right-2 z-30 pointer-events-auto sm:top-6 sm:right-6 ${gameMode === 'binomo' ? '' : 'max-sm:hidden'}`}>
        <div className={`rounded-2xl border px-3 py-2 ${isBlitzActive ? 'border-[#7005FC] bg-[#141414]' : 'border-[#2a2a2a] bg-[#0c0c0c]/90'}`}>
          <div>
            {isBlitzActive ? (
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-[11px] text-[#7005FC]">Blitz live</p>
                  <p className="text-sm font-medium tabular-nums text-white">{blitzTimeRemaining}</p>
                </div>
                {hasBlitzAccess && (
                  <span className="rounded-full bg-[#7005FC] px-1.5 py-0.5 text-[10px] font-medium text-white">2x</span>
                )}
              </div>
            ) : (
              <div>
                <p className="text-[11px] text-[#DDD7FE]">Next blitz</p>
                <p className="text-sm font-medium tabular-nums text-white">{blitzCountdown}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Toggle Button - Fixed to bottom (Mobile only) */}
      {!isPanelOpen && (
        <div className="sm:hidden fixed bottom-24 left-4 z-40 animate-in slide-in-from-left duration-300">
          <div className="flex flex-col items-start gap-1">
            {/* Small win indicator if available */}
            {bets.length > 0 && bets[0].won && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="ml-8 text-[11px] font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] flex items-center gap-1"
              >
                <span>+{parseFloat(bets[0].payout).toFixed(2)} {currencySymbol}</span>
              </motion.div>
            )}
            <button
              onClick={() => setIsPanelOpen(true)}
              className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 px-4 flex items-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all active:scale-95 border-emerald-500/20"
            >
              <div className="w-9 h-9 rounded-xl bg-[#7005FC]/15 flex items-center justify-center text-[#7005FC] shadow-inner">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-none mb-1">House Balance</span>
                <span className="text-base font-black text-white leading-none font-mono">
                  {houseBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySymbol}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}


      {/* Modern Quick Bet Panel — height-capped + internal scroll so wallet/blitz never overflows under the viewport */}
      <div className={`absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 top-auto z-[110] flex min-h-0 flex-col justify-end pointer-events-none sm:bottom-12 sm:left-8 sm:right-auto sm:top-[12rem] sm:max-h-full ${gameMode === 'binomo' ? 'max-h-[min(55dvh,500px)] sm:max-h-[min(58dvh,520px)]' : 'max-h-[min(34dvh,300px)] sm:max-h-[min(42dvh,380px)]'}`}>
        <div ref={sheetRef} className={`max-h-full min-h-0 bg-[#15111B] border border-white/10 rounded-2xl overflow-hidden w-full sm:w-[272px] transition-all duration-300 ease-out pointer-events-auto flex flex-col ${isPanelOpen
          ? 'translate-y-0 opacity-100 scale-100'
          : 'translate-y-full opacity-0 scale-95 !pointer-events-none sm:translate-y-0 sm:opacity-100 sm:scale-100 sm:!pointer-events-auto'
          }`}>

          {/* Close button for mobile */}
          <button
            onClick={() => setIsPanelOpen(false)}
            className="sm:hidden absolute top-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm text-gray-300"
          >
            ✕
          </button>

          {/* Game Mode Selector */}
          <div className="flex shrink-0 gap-1 border-b border-white/10 p-1 pr-10 sm:pr-1" data-tour="game-mode-toggle">
            <button
              data-tour="classic-mode"
              onClick={() => setGameMode('binomo')}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition ${gameMode === 'binomo' ? 'bg-[#7005FC] text-white' : 'text-[#E4E4E4] hover:text-white'}`}
            >
              Classic
            </button>
            <button
              data-tour="box-mode"
              onClick={() => setGameMode('box')}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition ${gameMode === 'box' ? 'bg-[#7005FC] text-white' : 'text-[#E4E4E4] hover:text-white'}`}
            >
              Box
            </button>
            <button
              data-tour="draw-mode"
              onClick={() => setGameMode('draw')}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition ${gameMode === 'draw' ? 'bg-[#7005FC] text-white' : 'text-[#E4E4E4] hover:text-white'}`}
            >
              Draw
            </button>
          </div>

          <div className="flex shrink-0 gap-1 px-1 pt-1" data-tour="side-tabs">
            <button
              data-tour="bet-tab"
              onClick={() => setActiveTab('bet')}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition ${activeTab === 'bet' ? 'bg-white/10 text-white' : 'text-[#E4E4E4] hover:text-white'}`}
            >
              Bet
            </button>
            <button
              data-tour="wallet-tab"
              onClick={() => setActiveTab('wallet')}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition ${activeTab === 'wallet' ? 'bg-white/10 text-white' : 'text-[#E4E4E4] hover:text-white'}`}
            >
              Wallet
            </button>
            <button
              data-tour="blitz-tab"
              onClick={() => setActiveTab('blitz')}
              className={`flex-1 rounded-full py-1.5 text-[13px] font-medium transition ${activeTab === 'blitz' ? 'bg-white/10 text-white' : 'text-[#E4E4E4] hover:text-white'}`}
            >
              Blitz
            </button>
          </div>

          {/* Tab body — scrolls inside the card when content (e.g. wallet) is tall */}
          <div className="relative flex flex-1 min-h-0 flex-col overflow-y-auto p-2.5">
            {/* Overlay if not authorized */}
            {isUnauthorized && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                <div className="w-full space-y-4 text-center animate-in fade-in zoom-in duration-300">
                  <div className="w-12 h-12 bg-[#7005FC]/10 border border-[#7005FC]/20 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                    <Key className="w-6 h-6 text-[#7005FC]" />
                  </div>
                  <div>
                    <h4 className="text-white font-black uppercase tracking-[0.2em] text-[10px]">Access Restricted</h4>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={accessInput}
                      onChange={(e) => setAccessInput(e.target.value.toUpperCase())}
                      placeholder="ENTER CODE"
                      disabled={isValidating}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-3 text-center text-white font-mono text-base tracking-[0.2em] placeholder:tracking-normal placeholder:text-white/10 focus:outline-none focus:border-purple-500/50 transition-all"
                    />
                    <button
                      onClick={handleValidateAccess}
                      disabled={!accessInput || isValidating}
                      className="w-full bg-white text-black font-black uppercase tracking-widest text-[10px] py-3 rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
                    >
                      {isValidating ? 'Validating...' : 'Unlock Node'}
                    </button>
                    {accessError && (
                      <p className="text-red-500 text-[8px] font-black uppercase tracking-widest">{accessError}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className={`flex min-h-0 flex-col transition-all duration-700 ${isUnauthorized ? 'blur-xl grayscale opacity-20 pointer-events-none select-none' : ''}`}>
              {activeTab === 'bet' ? (
                <div className="space-y-3">
                  <div data-tour="stake-controls" className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-[11px] text-[#E4E4E4]">Stake</label>
                      <span className="text-[11px] font-medium text-[#B781FE]">{currencySymbol}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[0.1, 0.5, 1, 5, 10].map(amt => (
                        <button
                          key={amt}
                          onClick={() => setBetAmount(amt.toString())}
                          className={`rounded-lg py-1.5 text-xs font-medium transition ${betAmount === amt.toString()
                            ? 'bg-[#7005FC] text-white'
                            : 'border border-white/10 bg-[#070010] text-white/80 hover:border-white/20'
                          }`}
                        >
                          {amt}
                        </button>
                      ))}
                    </div>
                    <div className={`mt-1.5 items-center rounded-xl border border-white/10 bg-[#070010] px-2.5 ${gameMode === 'binomo' ? 'flex' : 'hidden sm:flex'}`}>
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] text-[#E4E4E4]">
                      Expires
                    </label>
                    {gameMode === 'draw' ? (
                      <p className="text-xs text-[#E4E4E4]">Fixed at 5s. Draw the box on the chart.</p>
                    ) : (
                    <div className="grid grid-cols-5 gap-1">
                      {[5, 10, 15, 30, 60].map(duration => (
                        <button
                          key={duration}
                          onClick={() => setSelectedDuration(duration)}
                          className={`rounded-lg py-1.5 text-[11px] font-medium transition ${selectedDuration === duration
                            ? 'bg-[#7005FC] text-white'
                            : 'border border-white/10 bg-[#070010] text-[#E4E4E4] hover:text-white'
                          }`}
                        >
                          <span className="block">{duration < 60 ? `${duration}s` : '1m'}</span>
                          {gameMode === 'binomo' && (
                            <span className={`mt-0.5 block text-[10px] ${selectedDuration === duration ? 'text-white/70' : 'text-[#B781FE]'}`}>
                              x{getMultiplier(duration)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    )}
                  </div>
                  </div>

                  {gameMode === 'box' ? (
                    <p className="text-[11px] leading-4 text-[#E4E4E4]">Tap a cell on the chart. Farther cells pay more.</p>
                  ) : gameMode === 'draw' ? (
                    <p className="text-[11px] leading-4 text-[#E4E4E4]">Draw a box on the chart, then confirm the stake.</p>
                  ) : null}

                  {gameMode === 'binomo' ? (
                    <details className="group rounded-xl border border-white/10 bg-[#070010] px-2.5 py-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-[#E4E4E4] [&::-webkit-details-marker]:hidden">
                        How this round settles
                        <span className="text-[#B781FE] transition group-open:rotate-180" aria-hidden>⌄</span>
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        <CreClose />
                        <NansenDesk address={address || null} />
                        <SlipDesk />
                        <HedgeDesk currency={currencySymbol} />
                        <p className="text-[11px] leading-4 text-[#E4E4E4]">
                          <span className="mr-2 font-medium text-[#B781FE]">Agent</span>
                          mm monblip fund. The passkey stays the account.
                        </p>
                      </div>
                    </details>
                  ) : null}

                  {/* ERROR MESSAGE DISPLAY */}
                  {error && (
                    <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl relative group">
                      <button
                        onClick={clearError}
                        className="absolute top-2 right-2 text-red-500/50 hover:text-red-500 p-1"
                      >
                        ✕
                      </button>
                      <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div className="flex-1">
                          <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Error</p>
                          <p className="text-red-300 text-[11px] leading-tight mt-0.5">
                            {needsDeposit
                              ? `Deposit ${currencySymbol} into your house balance, then place the round.`
                              : error}
                          </p>
                          {needsDeposit && (
                            <button
                              onClick={() => {
                                setActiveTab('wallet');
                                clearError();
                              }}
                              className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-[10px] font-bold transition-all"
                            >
                              Go to Deposit
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {!isWalletConnected && null}
                </div>

              ) : activeTab === 'wallet' ? (
                <div className="space-y-2" data-tour="deposit-section">
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#070010] p-1">
                    {(['AUSD', 'MON'] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setSelectedCurrency(choice)}
                        className={`h-8 rounded-lg text-xs font-medium ${currencySymbol === choice ? 'bg-[#7005FC] text-white' : 'text-[#E4E4E4] hover:bg-white/5'}`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  {isWalletConnected && address ? (
                    <>
                      <BalanceDisplay wallet={{ balance: activeWalletBalance, loading: isLoadingBalance }} />

                      <button
                        type="button"
                        onClick={() => {
                          const s = useStore.getState();
                          void import('@/lib/monad/playWallet').then(({ disconnectPlaySession }) => disconnectPlaySession());
                          s.setPreferredNetwork(null);
                          s.disconnect();
                        }}
                        className="h-9 w-full rounded-full text-xs text-white/50 transition hover:bg-white/5 hover:text-white"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <p className="py-6 text-center text-sm text-[#DDD7FE]">No wallet connected</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3" data-tour="blitz-panel">
                  <div className={`rounded-2xl border p-4 ${isBlitzActive ? 'border-[#7005FC]/50 bg-[#141414]' : 'border-[#2a2a2a] bg-[#141414]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-xs ${isBlitzActive ? 'text-[#7005FC]' : 'text-[#DDD7FE]'}`}>
                          {isBlitzActive ? 'Blitz is live' : 'Next blitz'}
                        </p>
                        <p className="mt-1 text-3xl font-medium tabular-nums text-white">
                          {isBlitzActive ? blitzTimeRemaining : blitzCountdown}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isBlitzActive ? 'bg-[#7005FC] text-white' : 'bg-[#070010] text-[#DDD7FE]'}`}>
                        {isBlitzActive ? '2x' : '1x'}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-xs text-[#DDD7FE]">
                        <span>Boost on marked cells</span>
                        <span className={isBlitzActive ? 'text-[#7005FC]' : ''}>{isBlitzActive ? '2.0x' : '1.0x'}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
                        <div className={`h-full rounded-full bg-[#7005FC] transition-all duration-700 ${isBlitzActive ? 'w-full' : 'w-0'}`} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleEnterBlitz}
                      disabled={!isWalletConnected || hasBlitzAccess || isActivatingBlitz || isUnauthorized}
                      className={`mt-4 h-11 w-full rounded-xl text-sm font-medium transition disabled:cursor-not-allowed ${hasBlitzAccess
                        ? 'border border-[#5cec8a]/40 bg-[#5cec8a]/10 text-[#5cec8a]'
                        : !isWalletConnected
                          ? 'border border-[#2a2a2a] bg-[#070010] text-[#B781FE]'
                          : 'bg-[#7005FC] text-white hover:bg-[#8F3BFF] disabled:opacity-70'
                        }`}
                    >
                      {isActivatingBlitz
                        ? 'Entering…'
                        : hasBlitzAccess
                          ? 'You’re in this round'
                          : !isWalletConnected
                            ? 'Connect a wallet'
                            : 'Enter blitz · $0.10'}
                    </button>

                    <p className="mt-3 text-center text-xs leading-5 text-[#DDD7FE]">
                      {isBlitzActive
                        ? 'Marked cells pay double until the timer ends.'
                        : 'A blitz opens every 3 minutes.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeTab === 'bet' && gameMode === 'binomo' && !isUnauthorized ? (
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 px-2.5 py-2" data-tour="direction-buttons">
              <button
                onClick={() => placeClassicBet('UP')}
                disabled={!isWalletConnected}
                className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#7005FC] py-3 text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80"
              >
                <span className="text-sm leading-none">▲</span>
                <span className="text-sm font-medium">Higher</span>
                {Number.isFinite(stakeValue) && stakeValue > 0 ? (
                  <span className="text-[10px] text-white/75">Pays {(stakeValue * getMultiplier(selectedDuration)).toFixed(2)}</span>
                ) : null}
              </button>
              <button
                onClick={() => placeClassicBet('DOWN')}
                disabled={!isWalletConnected}
                className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-[#FF5C7A]/40 bg-[#070010] py-3 text-[#FF5C7A] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80"
              >
                <span className="text-sm leading-none">▼</span>
                <span className="text-sm font-medium">Lower</span>
                {Number.isFinite(stakeValue) && stakeValue > 0 ? (
                  <span className="text-[10px] text-[#FF5C7A]/75">Risks {stakeValue.toFixed(2)}</span>
                ) : null}
              </button>
            </div>
          ) : null}

          <div className="shrink-0 border-t border-white/10 px-3 py-2">
            {!isWalletConnected ? (
              <button
                type="button"
                onClick={() => setConnectModalOpen(true)}
                className="neon-btn h-10 w-full text-sm"
              >
                Connect
              </button>
            ) : isUnauthorized ? (
              <p className="text-center text-sm text-[#DDD7FE]">
                Enter your access code
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7005FC]" />
                <span className="text-xs text-[#DDD7FE]">{currencySymbol} · {formatAddress(address)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
