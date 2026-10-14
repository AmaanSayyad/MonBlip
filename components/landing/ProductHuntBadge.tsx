import React from 'react';

const PRODUCT_HUNT_HREF = 'https://x.com/MonBlip';

/** Featured on Product Hunt — `dark` matches landing / litepaper footers. */
export function ProductHuntBadge({
  className = '',
  theme = 'dark',
}: {
  className?: string;
  theme?: 'light' | 'dark';
}) {
  const src = `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1115541&theme=${theme}`;

  return (
    <a
      href={PRODUCT_HUNT_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block opacity-90 transition-opacity duration-300 hover:opacity-100 ${className}`}
    >
      <img
        src={src}
        alt="MonBlip — First binary options trading dapp on-chain | Product Hunt"
        width={250}
        height={54}
        className="h-auto w-[200px] max-w-full sm:w-[250px]"
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}
