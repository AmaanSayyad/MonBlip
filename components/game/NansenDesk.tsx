'use client';

import { useEffect, useState } from 'react';

type DeskRead = {
  configured?: boolean;
  title?: string;
  detail?: string;
};

export function NansenDesk({ address }: { address: string | null }) {
  const [line, setLine] = useState('Connect a wallet to read the label.');

  useEffect(() => {
    if (!address) {
      setLine('Connect a wallet to read the label.');
      return;
    }
    let stop = false;
    void fetch(`/api/monad/nansen?address=${address}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: DeskRead & { error?: string }) => {
        if (stop) return;
        if (data.error) {
          setLine(data.error);
          return;
        }
        setLine(data.title || data.detail || 'No label on this wallet.');
      })
      .catch(() => {
        if (!stop) setLine('Unavailable.');
      });
    return () => {
      stop = true;
    };
  }, [address]);

  return (
    <p className="text-[11px] leading-4 text-[#E4E4E4]">
      <span className="mr-2 font-medium text-[#B781FE]">Nansen</span>
      {line}
    </p>
  );
}
