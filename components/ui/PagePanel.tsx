'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Compass } from 'lucide-react';
import { AmbientGlow, GlowLayer, trackGlow } from '@/components/ui/Fx';

const EASE = [0.22, 1, 0.36, 1] as const;

function useEntrance(delay: number) {
  const reduce = useReducedMotion();
  return reduce
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: EASE, delay },
      };
}

export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div {...useEntrance(delay)} className={className}>
      {children}
    </motion.div>
  );
}

type HeroLogo = { src: string; light?: boolean };

export function PageHero({
  tour,
  eyebrow,
  logos,
  title,
  children,
  onGuide,
}: {
  tour: string;
  eyebrow: string;
  logos: HeroLogo[];
  title: string;
  children: ReactNode;
  onGuide?: () => void;
}) {
  return (
    <motion.header {...useEntrance(0)} data-tour={tour} className="relative isolate flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <AmbientGlow />
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3">
          <span className="flex -space-x-1.5">
            {logos.map((logo) => (
              <span
                key={logo.src}
                className="grid h-6 w-6 place-items-center rounded-full bg-[#15111B] ring-2 ring-[#070010]"
                style={logo.light ? { background: '#FCFBFF' } : undefined}
              >
                <img src={logo.src} alt="" className="h-3.5 w-3.5 object-contain" />
              </span>
            ))}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#DDD7FE]">{eyebrow}</span>
        </div>
        <h1 className="mt-4 text-3xl font-medium tracking-tight text-white sm:text-[40px] sm:leading-[1.1]">{title}</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[#DDD7FE]/80 sm:text-base sm:leading-7">{children}</p>
      </div>
      {onGuide ? (
        <button
          type="button"
          onClick={onGuide}
          className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/[0.02] px-4 text-sm text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:bg-[#7005FC]/10 hover:text-white lg:self-auto"
        >
          <Compass className="h-4 w-4" aria-hidden />
          Take the tour
        </button>
      ) : null}
    </motion.header>
  );
}

export function Panel({
  tour,
  eyebrow,
  title,
  logo,
  light = false,
  action,
  delay = 0,
  className = '',
  bodyClassName = '',
  children,
}: {
  tour?: string;
  eyebrow: string;
  title?: ReactNode;
  logo?: string;
  light?: boolean;
  action?: ReactNode;
  delay?: number;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      {...useEntrance(delay)}
      data-tour={tour}
      onMouseMove={trackGlow}
      className={`group/glow relative rounded-2xl border border-white/10 bg-[#15111B] shadow-[0_24px_48px_-32px_rgba(0,0,0,0.9)] transition-colors hover:border-white/[0.14] ${className}`}
    >
      <GlowLayer />
      <header className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5"
              style={light ? { background: '#FCFBFF' } : undefined}
            >
              <img src={logo} alt="" className="h-5 w-5 object-contain" />
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">{eyebrow}</p>
            {title ? <div className="truncate text-sm text-white">{title}</div> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={`relative p-5 sm:p-6 ${bodyClassName}`}>{children}</div>
    </motion.section>
  );
}

export function NoteList({ items }: { items: Array<{ icon: ReactNode; text: ReactNode }> }) {
  return (
    <ul className="grid gap-3">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-3 text-sm leading-6 text-[#DDD7FE]/85">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#7005FC]/15 text-[#B781FE]">{item.icon}</span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
