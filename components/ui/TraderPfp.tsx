'use client';

type TraderPfpProps = {
  seed: string;
  className?: string;
};

const PORTRAITS = [
  'DeGod #16.png',
  'DeGod #1966.png',
  'DeGod #2539.png',
  'DeGod #3499.png',
  'DeGod #9947.png',
  'DeGod #9959.png',
];

function portraitFor(seed: string): string {
  let hash = 2166136261;
  const text = seed || 'trader';
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const file = PORTRAITS[(hash >>> 0) % PORTRAITS.length];
  return `/profileimage/${encodeURIComponent(file)}`;
}

export function TraderPfp({ seed, className }: TraderPfpProps) {
  return (
    <img
      src={portraitFor(seed)}
      alt=""
      className={`${className ?? ''} object-cover`}
      aria-hidden
    />
  );
}
