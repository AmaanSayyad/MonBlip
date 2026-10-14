'use client';

import React, { useState } from 'react';

// Logos ship with the app. Remote logo hosts are slow and were blocking the mark.
export const AssetIcon = React.memo(function AssetIcon({
  src,
  asset,
  className = 'h-full w-full object-contain',
}: {
  src: string;
  asset: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src || !src) {
    return (
      <span className="flex h-full w-full items-center justify-center text-[11px] font-medium text-[#DDD7FE]">
        {asset.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      decoding="async"
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
});
