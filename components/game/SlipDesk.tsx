'use client';

import { useEffect, useState } from 'react';
import { lockSlip, readSealedSlips, sealedSlips, slipIsOpen, subscribeMera } from '@/lib/monad/account';

type Slip = { direction?: string; amount?: number; asset?: string };

export function SlipDesk() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setCount(sealedSlips().length);
      setOpen(slipIsOpen());
    };
    refresh();
    return subscribeMera(refresh);
  }, []);

  const read = async () => {
    setError(null);
    try {
      const rows = await readSealedSlips();
      setSlips(rows as Slip[]);
      setCount(sealedSlips().length);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The slip key was not opened.');
    }
  };

  return (
    <div className="space-y-1">
      <div className="text-[11px] leading-4 text-[#E4E4E4]">
        <span className="mr-2 font-medium text-[#B781FE]">Slip</span>
        {count === 0
          ? 'Encrypted with a second passkey salt.'
          : `${count} sealed. The key is not stored.`}
        {' '}
        <button type="button" onClick={() => void read()} className="text-[#FCFBFF] underline decoration-white/30 underline-offset-2">
          {open ? 'Read' : 'Open'}
        </button>
        {open ? (
          <button
            type="button"
            onClick={() => {
              lockSlip();
              setSlips([]);
            }}
            className="ml-2 text-[#E4E4E4] underline decoration-white/30 underline-offset-2"
          >
            Lock
          </button>
        ) : null}
      </div>
      {slips.length > 0 ? (
        <ul className="space-y-0.5 text-[11px] text-white">
          {slips.slice(0, 3).map((slip, index) => (
            <li key={index}>
              {slip.direction} {slip.amount} {slip.asset}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-[11px] text-[#ff5c5c]">{error}</p> : null}
    </div>
  );
}
