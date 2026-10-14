'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ASSET_CATEGORIES, ASSET_CONFIG, searchAssets } from '@/lib/assets/catalog';
import { AssetIcon } from '@/components/ui/AssetIcon';
import type { AssetType } from '@/lib/utils/priceFeed';

const subscribeNever = () => () => {};

function SearchGlyph({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

export function AssetSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const selectedAsset = useStore((state) => state.selectedAsset);
  const setSelectedAsset = useStore((state) => state.setSelectedAsset);
  /** The panel belongs to the page it was opened on, so navigating closes it. */
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof ASSET_CATEGORIES)[number]>('All');
  const [active, setActive] = useState(0);
  const isMac = useSyncExternalStore(subscribeNever, () => /Mac|iPhone|iPad/.test(navigator.platform), () => true);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = openOn !== null && openOn === pathname;

  const results = useMemo(() => searchAssets(query, category), [query, category]);

  const show = useCallback(() => {
    setActive(0);
    setOpenOn(pathname);
  }, [pathname]);

  const close = () => {
    setOpenOn(null);
    setQuery('');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) setOpenOn(null);
        else show();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, show]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => input.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (asset: AssetType) => {
    setSelectedAsset(asset);
    close();
    if (pathname !== '/trade') router.push('/trade');
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Search assets"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="theme-muted inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] text-sm text-[#B781FE] transition hover:border-[#7005FC]/60 hover:text-white sm:h-10 sm:w-10 xl:w-56 xl:justify-start xl:px-3"
      >
        <SearchGlyph className="h-4 w-4" />
        <span className="hidden flex-1 text-left xl:inline">Search assets</span>
        <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 font-sans text-[10px] text-[#DDD7FE]/70 xl:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <>
          <div className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px]" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-label="Search assets"
            className="fixed left-1/2 top-[72px] z-[9999] w-[min(100vw-1.5rem,30rem)] -translate-x-1/2 overflow-hidden rounded-3xl border border-[#2a2a2a] bg-[#0c0c0c] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="relative mb-3">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <SearchGlyph className="h-4 w-4 text-[#B781FE]" />
              </div>
              <input
                ref={input}
                type="text"
                placeholder="Search assets"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                role="combobox"
                aria-expanded
                aria-controls="navbar-asset-results"
                aria-activedescendant={results[active] ? `navbar-asset-${results[active]}` : undefined}
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#141414] py-2.5 pl-10 pr-14 text-sm text-white placeholder:text-[#B781FE] focus:border-[#7005FC] focus:outline-none"
              />
              <kbd className="pointer-events-none absolute inset-y-0 right-3 my-auto h-fit rounded-md border border-white/10 px-1.5 py-0.5 font-sans text-[10px] text-[#DDD7FE]/70">
                Esc
              </kbd>
            </div>

            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
              {ASSET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setActive(0);
                  }}
                  className={`shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition ${category === cat ? 'bg-[#7005FC] text-white' : 'bg-[#141414] text-[#DDD7FE] hover:text-white'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div ref={list} id="navbar-asset-results" role="listbox" className="grid max-h-[min(60vh,360px)] grid-cols-1 gap-1.5 overflow-y-auto">
              {results.length > 0 ? (
                results.map((asset, index) => {
                  const config = ASSET_CONFIG[asset];
                  const highlighted = index === active;
                  const current = selectedAsset === asset;
                  return (
                    <button
                      key={asset}
                      id={`navbar-asset-${asset}`}
                      data-index={index}
                      type="button"
                      role="option"
                      aria-selected={highlighted}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(asset)}
                      className={`flex items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition ${highlighted ? 'border-[#7005FC] bg-[#7005FC]/10' : 'border-[#232323] bg-[#141414]'}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#070010]">
                        <AssetIcon src={config.logo} asset={asset} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">{config.name}</span>
                          <span className="shrink-0 text-[10px] text-[#DDD7FE]">{config.category}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#B781FE]">{config.pair}</span>
                      </span>
                      {current ? (
                        <span className="shrink-0 rounded-full bg-[#7005FC]/20 px-2 py-0.5 text-[10px] text-[#DDD7FE]">On chart</span>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-[#2a2a2a] px-4 py-8 text-center">
                  <p className="text-sm text-white">No matches</p>
                  <p className="mt-1 text-xs text-[#DDD7FE]">Try another name or category.</p>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}
