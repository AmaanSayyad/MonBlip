'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 28, stiffness: 320 };

export type SpotlightStep = {
  id: string;
  target: string;
  fallback?: string;
  title: string;
  content: string;
  howTo?: string[];
  win?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
};

function overlaps(box: { left: number; top: number; width: number; height: number }, target: DOMRect, margin = 12) {
  return !(
    box.left + box.width + margin <= target.left ||
    target.right + margin <= box.left ||
    box.top + box.height + margin <= target.top ||
    target.bottom + margin <= box.top
  );
}

function placeCard(target: DOMRect, hint: SpotlightStep['position'], width: number, height: number) {
  const pad = 16;
  const gap = 18;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardHeight = Math.min(height, vh - pad * 2);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  const spots = {
    right: { left: target.right + gap, top: target.top + target.height / 2 - cardHeight / 2 },
    above: { left: target.left + target.width / 2 - width / 2, top: target.top - cardHeight - gap },
    below: { left: target.left + target.width / 2 - width / 2, top: target.bottom + gap },
    left: { left: target.left - width - gap, top: target.top + target.height / 2 - cardHeight / 2 },
  };
  const order: Array<keyof typeof spots> =
    hint === 'bottom' ? ['below', 'above', 'right', 'left']
    : hint === 'top' ? ['above', 'below', 'right', 'left']
    : hint === 'right' ? ['left', 'above', 'below', 'right']
    : ['right', 'above', 'below', 'left'];

  const placed = order.map((key) => {
    const spot = spots[key];
    const left = clamp(spot.left, pad, Math.max(pad, vw - width - pad));
    const top = clamp(spot.top, pad, Math.max(pad, vh - cardHeight - pad));
    const shifted = Math.abs(left - spot.left) + Math.abs(top - spot.top);
    return { left, top, shifted, hits: overlaps({ left, top, width, height: cardHeight }, target) };
  });

  return placed.find((spot) => !spot.hits && spot.shifted < 8)
    ?? placed.find((spot) => !spot.hits)
    ?? placed.slice().sort((a, b) => a.shifted - b.shifted)[0];
}

function isVisible(node: Element) {
  const rect = node.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function SpotlightTour({
  isOpen,
  onClose,
  steps,
  onStep,
}: {
  isOpen: boolean;
  onClose: () => void;
  steps: SpotlightStep[];
  onStep?: (step: SpotlightStep) => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const step = steps[index];

  const find = useCallback((item: SpotlightStep | undefined) => {
    if (!item) return null;
    const pick = (selector: string) => Array.from(document.querySelectorAll(selector)).find(isVisible) || null;
    return pick(item.target) || (item.fallback ? pick(item.fallback) : null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIndex(0);
      setBox(null);
      return;
    }
    if (step) onStepRef.current?.(step);
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen || !step) return;
    let attempts = 0;
    let timer = 0;
    const settle: number[] = [];
    const measure = () => {
      const node = find(step);
      if (node) setBox(node.getBoundingClientRect());
    };
    const tick = () => {
      const node = find(step);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        setBox(node.getBoundingClientRect());
        // Entrance animations and smooth scrolling move the target after the first read.
        for (const delay of [250, 550, 900]) settle.push(window.setTimeout(measure, delay));
        return;
      }
      attempts += 1;
      if (attempts < 12) timer = window.setTimeout(tick, 150);
    };
    timer = window.setTimeout(tick, 40);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(timer);
      settle.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, step, find]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const measure = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setCardHeight((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOpen, index, box]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(steps.length - 1, current + 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, steps.length]);

  if (!isOpen || !box || !step) return null;

  const width = Math.min(360, window.innerWidth - 24);
  const pos = placeCard(box, step.position || 'bottom', width, cardHeight);
  const last = index === steps.length - 1;
  const hole = { x: box.left - 8, y: box.top - 8, width: box.width + 16, height: box.height + 16 };

  return (
    <div className="pointer-events-none fixed inset-0 z-[160]">
      <svg className="pointer-events-auto absolute inset-0 h-full w-full">
        <defs>
          <mask id="spotlight-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <motion.rect initial={false} animate={hole} transition={spring} rx="16" fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(7,0,16,0.72)" mask="url(#spotlight-tour-mask)" onClick={onClose} />
      </svg>
      <motion.div
        initial={false}
        animate={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }}
        transition={spring}
        className="pointer-events-none absolute rounded-2xl border-2 border-[#7005FC]"
      />
      <motion.div
        ref={cardRef}
        initial={false}
        animate={{ left: pos.left, top: pos.top, opacity: 1 }}
        transition={spring}
        className="pointer-events-auto absolute flex max-h-[min(420px,calc(100dvh-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#15111B] shadow-2xl"
        style={{ width }}
      >
        <div className="shrink-0 px-4 pt-4">
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#7005FC] transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="text-base font-medium text-white">{step.title}</h3>
            <span className="shrink-0 font-mono text-xs text-[#B781FE]">{index + 1}/{steps.length}</span>
          </div>
        </div>
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="max-h-[min(280px,46dvh)] space-y-3 overflow-y-auto px-4"
        >
          <p className="text-sm leading-6 text-[#E4E4E4]">{step.content}</p>
          {step.howTo?.length ? (
            <ol className="space-y-2">
              {step.howTo.map((item, i) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-5 text-white">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7005FC] text-[11px] font-medium text-white">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {step.win ? (
            <p className="rounded-xl border border-[#7005FC]/30 bg-[#7005FC]/10 px-3 py-2 text-sm leading-5 text-white">{step.win}</p>
          ) : null}
        </motion.div>
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onClose} className="text-sm text-[#E4E4E4] hover:text-white">Skip</button>
            <div className="hidden items-center gap-1 sm:flex" role="tablist" aria-label="Tour steps">
              {steps.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Step ${i + 1}: ${item.title}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-4 bg-[#B781FE]' : i < index ? 'w-1.5 bg-[#7005FC]' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
                />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {index > 0 ? (
              <button type="button" onClick={() => setIndex(index - 1)} className="h-9 rounded-full border border-white/10 px-4 text-sm text-white">Back</button>
            ) : null}
            <button type="button" onClick={() => (last ? onClose() : setIndex(index + 1))} className="neon-btn h-9 px-4 text-sm">
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
