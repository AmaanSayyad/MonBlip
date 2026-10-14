'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useOverflowStore } from '@/lib/store';
import { meraPhase, subscribeMera } from '@/lib/monad/account';

export const WalletConnectModal: React.FC = () => {
  const isOpen = useOverflowStore((state) => state.isConnectModalOpen);
  const setOpen = useOverflowStore((state) => state.setConnectModalOpen);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'unlock' | 'create' | 'metamask' | null>(null);
  const [phase, setPhase] = useState<'new' | 'locked' | 'live'>('new');
  useEffect(() => setMounted(true), []);
  useEffect(() => subscribeMera(() => setPhase(meraPhase())), []);
  useEffect(() => {
    if (isOpen) setPhase(meraPhase());
  }, [isOpen]);

  if (!mounted) return null;

  const connect = async (kind: 'unlock' | 'create' | 'metamask') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'metamask') {
        const { connectMetaMask } = await import('@/lib/monad/injectedWallet');
        await connectMetaMask();
      } else if (kind === 'create') {
        const { createMera } = await import('@/lib/monad/account');
        await createMera();
      } else {
        const { connectMera } = await import('@/lib/monad/account');
        await connectMera();
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The passkey was not confirmed.');
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[#070010]/75 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-labelledby="session-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="relative w-full max-w-[22rem] rounded-2xl border border-white/10 bg-[#15111B] p-6 shadow-[0_24px_80px_rgba(7,0,16,0.65)]"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
                  <img src="/logos/sponsors/mera.svg" alt="" className="h-5 w-5" />
                </span>
                <h2 id="session-title" className="text-lg font-medium tracking-[-0.02em] text-[#FCFBFF]">
                  {phase === 'locked' ? 'Welcome back' : 'Your account'}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#E4E4E4] hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#E4E4E4]">
              {phase === 'locked'
                ? 'The 15-minute passkey session ended. Confirm the passkey to keep trading. Your house balance and rounds are where you left them.'
                : 'One passkey. No seed phrase and no extension. Rounds stay prompt-free for 15 minutes. A deposit or withdrawal asks again.'}
            </p>
            <div className="mt-6 space-y-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void connect('unlock')}
                className="neon-btn h-11 w-full text-sm disabled:opacity-60"
              >
                {busy === 'unlock' ? 'Waiting for the passkey…' : phase === 'locked' ? 'Unlock' : 'Continue'}
              </button>
              {phase !== 'locked' ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void connect('create')}
                  className="ghost-btn h-11 w-full text-sm text-[#E4E4E4] disabled:opacity-60"
                >
                  {busy === 'create' ? 'Waiting for the passkey…' : 'Create a passkey'}
                </button>
              ) : null}
              <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/35" aria-hidden>
                <span className="h-px flex-1 bg-white/10" />
                or
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void connect('metamask')}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm text-[#E4E4E4] hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                <img src="/logos/sponsors/metamask.svg" alt="" className="h-4 w-4" />
                {busy === 'metamask' ? 'Waiting for MetaMask…' : 'Continue with MetaMask'}
              </button>
            </div>
            {error ? <p className="mt-3 text-sm leading-6 text-[#FF5C7A]">{error}</p> : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
