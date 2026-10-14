'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { GlowLayer, trackGlow } from '@/components/ui/Fx';

export type FlowState = 'done' | 'current' | 'waiting';

export type FlowStep = {
  key: string;
  logo: string;
  light?: boolean;
  name: string;
  detail: string;
  status: string;
  state: FlowState;
  target: string;
};

const STATUS_TONE: Record<FlowState, string> = {
  done: 'border-[#82FF68]/30 bg-[#82FF68]/10 text-[#82FF68]',
  current: 'border-[#B781FE]/40 bg-[#7005FC]/15 text-[#DDD7FE]',
  waiting: 'border-white/10 bg-white/[0.03] text-white/45',
};

const RING_TONE: Record<FlowState, string> = {
  done: 'ring-[#82FF68]/50',
  current: 'ring-[#B781FE]',
  waiting: 'ring-white/10',
};

function jumpTo(target: string) {
  const node = document.querySelector(`[data-tour="${target}"]`);
  if (!node) return;
  const top = node.getBoundingClientRect().top + window.scrollY - 88;
  window.scrollTo({ top, behavior: 'smooth' });
}

function Connector({ from, to }: { from: FlowState; to: FlowState }) {
  const filled = from === 'done';
  const moving = filled && to === 'current';
  return (
    <>
      <span
        aria-hidden
        className="absolute left-[calc(50%+34px)] right-[calc(-50%+34px)] top-[26px] hidden h-0.5 overflow-visible rounded-full bg-white/10 lg:block"
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#7005FC] to-[#B781FE] transition-[width] duration-700 ${filled ? 'w-full' : 'w-0'}`}
        />
        {moving ? (
          <span className="monblip-flow-x absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_2px_rgba(183,129,254,0.8)]" />
        ) : null}
      </span>
      <span
        aria-hidden
        className="absolute bottom-0 left-[25px] top-[60px] w-0.5 overflow-visible rounded-full bg-white/10 lg:hidden"
      >
        <span
          className={`absolute inset-x-0 top-0 rounded-full bg-gradient-to-b from-[#7005FC] to-[#B781FE] transition-[height] duration-700 ${filled ? 'h-full' : 'h-0'}`}
        />
        {moving ? (
          <span className="monblip-flow-y absolute left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_2px_rgba(183,129,254,0.8)]" />
        ) : null}
      </span>
    </>
  );
}

export function StepFlow({ steps, title, tour }: { steps: FlowStep[]; title: string; tour: string }) {
  const done = steps.filter((step) => step.state === 'done').length;

  return (
    <div data-tour={tour} onMouseMove={trackGlow} className="group/glow relative mt-6 rounded-2xl border border-white/10 bg-[#15111B] p-4 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.9)] sm:p-5">
      <GlowLayer />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">{title}</p>
        <p className="text-xs tabular-nums text-[#DDD7FE]">
          {done === steps.length ? 'All set' : `${done} of ${steps.length} ready`}
        </p>
      </div>

      <ol className="relative mt-5 flex flex-col lg:flex-row">
        {steps.map((step, index) => {
          const next = steps[index + 1];
          return (
            <li key={step.key} className={`relative lg:flex-1 ${next ? 'pb-5 lg:pb-0' : ''}`}>
              {next ? <Connector from={step.state} to={next.state} /> : null}
              <button
                type="button"
                onClick={() => jumpTo(step.target)}
                aria-current={step.state === 'current' ? 'step' : undefined}
                className="group flex w-full items-start gap-4 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#B781FE]/70 lg:flex-col lg:items-center lg:gap-0 lg:px-2 lg:text-center"
              >
                <span className="relative shrink-0">
                  {step.state === 'current' ? (
                    <span className="absolute inset-0 rounded-2xl bg-[#7005FC]/40 motion-safe:animate-ping" aria-hidden />
                  ) : null}
                  <span
                    className={`relative grid h-[52px] w-[52px] place-items-center rounded-2xl ring-2 transition group-hover:scale-105 ${RING_TONE[step.state]} ${step.light ? '' : 'bg-[#0E0A14]'}`}
                    style={step.light ? { background: '#FCFBFF' } : undefined}
                  >
                    <img
                      src={step.logo}
                      alt=""
                      className={`h-7 w-7 object-contain ${step.state === 'waiting' ? 'opacity-50 grayscale' : ''}`}
                    />
                  </span>
                  {step.state === 'done' ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.1 + index * 0.06 }}
                      className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#82FF68] text-[#070010] ring-2 ring-[#15111B]"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </motion.span>
                  ) : null}
                </span>
                <span className="min-w-0 lg:mt-3">
                  <span className={`block text-sm font-medium ${step.state === 'waiting' ? 'text-white/60' : 'text-white'}`}>
                    {step.name}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#E4E4E4]/80">{step.detail}</span>
                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${STATUS_TONE[step.state]}`}
                  >
                    {step.state === 'current' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B781FE] motion-safe:animate-pulse" aria-hidden />
                    ) : null}
                    {step.status}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
