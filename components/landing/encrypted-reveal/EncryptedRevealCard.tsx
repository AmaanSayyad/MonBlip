'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Lock, Shield, Handshake } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

export type EncryptedRevealTheme = 'violet' | 'emerald';

export type EncryptedBlurredSlot = {
  logoSrc?: string;
  /** Visible affiliation handle (advisors only). Omit on partner tiles. */
  handle?: string;
  /** Shown blurred (hidden) or clearly (revealed) depending on card state. */
  nameLine?: string;
};

export interface EncryptedRevealCardProps {
  sectionLabel: string;
  signalId: string;
  phase: string;
  icon: LucideIcon;
  description: string;
  theme?: EncryptedRevealTheme;
  blurredSlots?: EncryptedBlurredSlot[];
  /** When true: logos + names shown clearly, badge flips to Confirmed. */
  revealed?: boolean;
}

// ─── cipher animation ─────────────────────────────────────────────────────────

const CHARSET = '█▓░╳▀▒01X7Z9KΩΞØ∆●○┼';
const FLASH_HIDDEN = 'REDACTED';
const FLASH_REVEALED = 'CONFIRMED';
const WIDTH = 24;

function useCipherLine(revealed: boolean) {
  const flash = revealed ? FLASH_REVEALED : FLASH_HIDDEN;
  const [line, setLine] = useState(
    Array.from({ length: WIDTH }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join(''),
  );
  const tick = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      tick.current += 1;
      const t = tick.current;
      const chars = Array.from({ length: WIDTH }, (_, i) => {
        const startFlash = 6;
        const inFlash = i >= startFlash && i < startFlash + flash.length;
        const wave = (t + i * 3) % 55;
        if (inFlash && wave > 38 && wave < 44) return flash[i - startFlash]!;
        return CHARSET[Math.floor(Math.random() * CHARSET.length)]!;
      });
      setLine(chars.join(''));
    }, 80);
    return () => window.clearInterval(id);
  }, [flash]);
  return line;
}

// ─── theme tokens ─────────────────────────────────────────────────────────────

const THEME = {
  violet: {
    accent: '#a855f7',
    accentSoft: 'rgba(168,85,247,0.13)',
    ring: 'border-purple-500/[0.12]',
    glow: 'bg-purple-600/[0.09]',
    glowShadow: '0 0 40px 0 rgba(168,85,247,0.12)',
    bar: 'linear-gradient(180deg, #a855f7, #a855f788)',
    barGlow: 'rgba(168,85,247,0.18)',
    badge: { bg: 'rgba(168,85,247,0.13)', color: '#a855f7', ring: 'rgba(168,85,247,0.22)' },
    dot: 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]',
    handle: 'text-purple-400/90',
  },
  emerald: {
    accent: '#10b981',
    accentSoft: 'rgba(16,185,129,0.13)',
    ring: 'border-emerald-500/[0.12]',
    glow: 'bg-emerald-600/[0.09]',
    glowShadow: '0 0 40px 0 rgba(16,185,129,0.12)',
    bar: 'linear-gradient(180deg, #10b981, #10b98188)',
    barGlow: 'rgba(16,185,129,0.18)',
    badge: { bg: 'rgba(16,185,129,0.13)', color: '#10b981', ring: 'rgba(16,185,129,0.22)' },
    dot: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
    handle: 'text-emerald-400/90',
  },
} satisfies Record<EncryptedRevealTheme, object>;

// ─── main card ────────────────────────────────────────────────────────────────

export function EncryptedRevealCard({
  sectionLabel,
  signalId,
  phase,
  icon: Icon,
  description,
  theme = 'violet',
  blurredSlots,
  revealed = false,
}: EncryptedRevealCardProps) {
  const t = THEME[theme];
  const cipher = useCipherLine(revealed);

  return (
    <motion.article
      initial={{ opacity: 1, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border ${t.ring} bg-[#0b0b12]/90 p-5 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.92)] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 sm:p-6 lg:rounded-3xl lg:p-7 lg:hover:-translate-y-1`}
      style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.4)' }}
    >
      {/* Corner colour glow */}
      <div
        className={`pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full opacity-[0.28] blur-3xl transition-[opacity,transform] duration-500 group-hover:opacity-[0.42] group-hover:scale-105 ${t.glow}`}
        aria-hidden
      />
      {/* Top-left shimmer */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.055] via-transparent to-transparent"
        aria-hidden
      />

      {/* Left accent bar */}
      <div
        className="absolute bottom-5 left-0 top-5 w-1 rounded-full sm:bottom-6 sm:top-6"
        style={{ background: t.bar, boxShadow: `0 0 28px ${t.barGlow}` }}
        aria-hidden
      />

      <div className="relative z-[1] flex flex-1 flex-col gap-4 pl-4 sm:gap-5 sm:pl-5 lg:gap-6">
        {/* ── Top row: icon + lock badge ── */}
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] transition-transform duration-300 group-hover:scale-[1.05] group-hover:border-white/15 sm:h-[3.25rem] sm:w-[3.25rem]"
            style={{
              backgroundColor: t.accentSoft,
              boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.08), 0 10px 32px -10px ${t.accent}`,
            }}
          >
            <Icon
              className="h-6 w-6 sm:h-7 sm:w-7"
              style={{ color: t.accent }}
              strokeWidth={1.65}
              aria-hidden
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
            {revealed ? (
              <>
                <span
                  className="h-2 w-2 rounded-full animate-pulse"
                  style={{ backgroundColor: t.accent, boxShadow: `0 0 8px ${t.accent}` }}
                  aria-hidden
                />
                <span className="font-mono text-[7px] font-black uppercase tracking-[0.22em]" style={{ color: t.accent }}>
                  Confirmed
                </span>
              </>
            ) : (
              <>
                <Lock className="h-2.5 w-2.5 text-white/30" aria-hidden />
                <span className="font-mono text-[7px] font-black uppercase tracking-[0.22em] text-white/25">
                  Sealed
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Phase + heading ── */}
        <div className="space-y-2">
          <span
            className="inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ring-inset sm:tracking-[0.2em]"
            style={{
              backgroundColor: t.badge.bg,
              color: t.badge.color,
              boxShadow: `ring-inset 0 0 0 1px ${t.badge.ring}`,
              // @ts-expect-error ring via inline style
              '--tw-ring-color': t.badge.ring,
            }}
          >
            {phase}
          </span>
          <h3
            className="text-lg font-black leading-snug tracking-tight text-white sm:text-xl lg:text-2xl"
            style={{ fontFamily: 'var(--font-orbitron), system-ui, sans-serif' }}
          >
            {sectionLabel}
          </h3>
          <p className="text-[12px] leading-relaxed text-white/50 sm:text-[0.8125rem]">
            {description}
          </p>
        </div>

        {/* ── Slots grid ── */}
        {blurredSlots?.length ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-hidden={!revealed}>
            {blurredSlots.map((slot, i) => (
              <div
                key={slot.handle || slot.logoSrc || `s${i}`}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.07] bg-black/40 px-1.5 py-3 sm:rounded-2xl sm:py-4 transition-all duration-500"
                style={revealed ? { borderColor: `${t.accent}25`, backgroundColor: `${t.accentSoft}` } : {}}
              >
                {/* Logo / avatar */}
                <div
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] sm:h-14 sm:w-14 transition-all duration-500"
                  style={revealed ? { borderColor: `${t.accent}30` } : {}}
                >
                  {slot.logoSrc ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slot.logoSrc}
                        alt={revealed ? (slot.nameLine ?? '') : ''}
                        className="h-10 w-10 scale-110 object-contain sm:h-11 sm:w-11 transition-all duration-500"
                        style={revealed ? { filter: 'none', opacity: 1 } : { filter: 'blur(10px)', opacity: 0.7 }}
                      />
                      {!revealed && (
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" />
                      )}
                    </>
                  ) : (
                    <div
                      className="h-7 w-7 rounded-full sm:h-8 sm:w-8 transition-all duration-500"
                      style={{
                        backgroundColor: t.accentSoft,
                        boxShadow: `0 0 18px ${t.barGlow}`,
                        filter: revealed ? 'none' : 'blur(4px)',
                      }}
                    />
                  )}
                </div>

                {/* Handle (advisors) */}
                {slot.handle ? (
                  <span className={`max-w-full truncate px-0.5 text-center font-mono text-[8px] font-bold uppercase tracking-wider sm:text-[9px] ${t.handle}`}>
                    {slot.handle}
                  </span>
                ) : null}

                {/* Name / org */}
                <span
                  className={`max-w-[90%] truncate text-center text-[9px] font-semibold leading-tight select-none sm:text-[10px] transition-all duration-500 ${slot.handle ? '' : 'mt-0.5'}`}
                  style={
                    revealed
                      ? { filter: 'none', color: 'rgba(255,255,255,0.80)', fontWeight: 700 }
                      : { filter: 'blur(5.5px)', color: 'rgba(255,255,255,0.55)' }
                  }
                >
                  {slot.nameLine ?? '████ ██████'}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Cipher line ── */}
        <div className="rounded-xl border border-white/[0.05] bg-black/50 px-3 py-2.5 sm:px-4 sm:py-3">
          <p
            className="font-mono text-[10px] tracking-widest text-white/35 sm:text-[11px]"
            aria-hidden
          >
            {cipher}
          </p>
          <p className="sr-only">
            {revealed
              ? `${sectionLabel} confirmed: ${blurredSlots?.map((s) => s.nameLine).join(', ')}.`
              : `${sectionLabel} is not yet public. Coming soon.`}
          </p>
        </div>

        {/* ── Footer: signal + id ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.05] pt-3.5 font-mono text-[7px] font-bold uppercase tracking-[0.2em] text-white/20 sm:text-[8px]">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${t.dot} shrink-0`} />
            {signalId}
          </span>
          <span className="text-white/10">·</span>
          <span style={{ color: `${t.accent}${revealed ? 'dd' : '99'}` }}>
            {revealed ? 'Partnership active' : 'Signal masked'}
          </span>
        </div>
      </div>

      {/* Bottom hover shimmer */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />
    </motion.article>
  );
}
