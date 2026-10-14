'use client';

import { useEffect, useState } from 'react';

type HedgeReply = {
  submitted?: boolean;
  detail?: string;
  error?: string;
  dynamic?: { address?: string; signature?: string } | null;
};

const short = (value: string, head = 6, tail = 4) =>
  value.length > head + tail ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

export function HedgeDesk({ currency }: { currency: string }) {
  const [reply, setReply] = useState<HedgeReply | null>(null);

  useEffect(() => {
    const onHedge = (event: Event) => setReply((event as CustomEvent<HedgeReply>).detail);
    window.addEventListener('monblip:hedge', onHedge);
    return () => window.removeEventListener('monblip:hedge', onHedge);
  }, []);

  const signer = reply?.dynamic?.address;
  const signature = reply?.dynamic?.signature;

  return (
    <div className="space-y-0.5 text-[11px] leading-4 text-[#E4E4E4]">
      <p>
        <span className="mr-2 font-medium text-[#B781FE]">Dynamic</span>
        {signer && signature ? (
          <>
            Server wallet{' '}
            <a
              href={`https://monadvision.com/address/${signer}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[#FCFBFF] underline decoration-white/30 underline-offset-2"
            >
              {short(signer)}
            </a>{' '}
            signed the hedge <span className="font-mono text-white/70">{short(signature, 10, 6)}</span>
          </>
        ) : currency === 'AUSD'
          ? 'Signs the Perpl offset after each AUSD round.'
          : 'Hedges AUSD rounds. This asset settles from the house balance.'}
      </p>
      {reply ? (
        <p className="text-white/55">
          Perpl: {reply.submitted ? reply.detail || 'order sent' : reply.error || reply.detail || 'order not sent'}
        </p>
      ) : null}
    </div>
  );
}
