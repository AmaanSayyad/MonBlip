'use client';

import { useEffect, type MouseEvent } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

const BRAND = ['#7005FC', '#B781FE', '#DDD7FE', '#82FF68', '#FFFFFF'];

export function AnimatedNumber({ value, decimals = 2, className }: { value: number; decimals?: number; className?: string }) {
  const reduce = useReducedMotion();
  const current = useMotionValue(reduce ? value : 0);
  const text = useTransform(current, (next) =>
    next.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));

  useEffect(() => {
    if (reduce) {
      current.set(value);
      return;
    }
    const controls = animate(current, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, current]);

  return <motion.span className={`tabular-nums ${className ?? ''}`}>{text}</motion.span>;
}

/** Sets the cursor position as CSS variables so GlowLayer can follow it. */
const pendingGlow = new WeakMap<HTMLElement, { x: number; y: number }>();

export function trackGlow(event: MouseEvent<HTMLElement>) {
  const node = event.currentTarget;
  const queued = pendingGlow.has(node);
  pendingGlow.set(node, { x: event.clientX, y: event.clientY });
  if (queued) return;
  requestAnimationFrame(() => {
    const point = pendingGlow.get(node);
    pendingGlow.delete(node);
    if (!point) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--glow-x', `${point.x - rect.left}px`);
    node.style.setProperty('--glow-y', `${point.y - rect.top}px`);
  });
}

export function GlowLayer() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/glow:opacity-100"
      style={{
        background: 'radial-gradient(420px circle at var(--glow-x, 50%) var(--glow-y, 0%), rgba(112, 5, 252, 0.13), transparent 45%)',
      }}
    />
  );
}

/**
 * Static gradients only. Blur filters or per-frame motion here sit under the
 * sticky header's backdrop blur and make every scroll frame re-blur them.
 */
export function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-16 inset-x-0 -z-10 h-[420px] overflow-hidden"
      style={{ contain: 'layout paint' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 40% 55% at 16% 28%, rgba(112, 5, 252, 0.22), transparent 70%), radial-gradient(ellipse 32% 45% at 84% 34%, rgba(183, 129, 254, 0.11), transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 60% 70% at 30% 30%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 70% at 30% 30%, black, transparent 75%)',
        }}
      />
    </div>
  );
}

let burst: ((options: import('canvas-confetti').Options) => void) | null = null;

export async function celebrate() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!burst) {
    const { default: confetti } = await import('canvas-confetti');
    const instance = confetti.create(undefined, { resize: true, useWorker: false });
    burst = (options) => void instance(options);
  }
  const confetti = burst;
  const base = { colors: BRAND, zIndex: 220, ticks: 220, disableForReducedMotion: true };
  confetti({ ...base, particleCount: 90, spread: 80, startVelocity: 40, origin: { y: 0.55 } });
  window.setTimeout(() => {
    confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
    confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
  }, 180);
}
