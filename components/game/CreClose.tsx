'use client';

import { useEffect, useState } from 'react';

type RoundClose = {
  symbol?: string;
  direction?: string;
  price?: number;
  won?: boolean;
  chain?: string;
  ausdDecimals?: number | null;
};

export function CreClose() {
  const [line, setLine] = useState('No close in this session yet.');

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch('/api/monad/settle', { cache: 'no-store' });
        const data = await response.json();
        if (stop) return;
        const close = data.close as RoundClose | null;
        if (!close || !Number.isFinite(close.price)) {
          setLine('No close yet.');
          return;
        }
        const outcome = close.won ? 'win' : 'loss';
        setLine(
          `${close.symbol} ${close.direction} at ${Number(close.price).toFixed(2)}, ${outcome}.`,
        );
      } catch {
        if (!stop) setLine('Unavailable.');
      }
    };
    void load();
    const timer = window.setInterval(load, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <p className="text-[11px] leading-4 text-[#E4E4E4]">
      <span className="mr-2 font-medium text-[#B781FE]">CRE</span>
      {line}
    </p>
  );
}
