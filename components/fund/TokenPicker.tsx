'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import { chainInfo, chainsOf, displaySymbol, searchTokens, type AuroraToken } from '@/lib/aurora/catalog';
import { TokenAvatar } from './TokenAvatar';

export function formatPrice(price: number | null) {
  if (price == null) return '';
  if (price >= 1) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${price.toPrecision(3)}`;
}

/** Mount only while open so search and filter start fresh each time. */
export function TokenPicker({
  tokens,
  loading,
  error,
  selected,
  onPick,
  onClose,
}: {
  tokens: AuroraToken[];
  loading: boolean;
  error: string | null;
  selected: string;
  onPick: (token: AuroraToken) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [chain, setChain] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const chains = useMemo(() => chainsOf(tokens), [tokens]);
  const results = useMemo(() => searchTokens(tokens, query, chain), [tokens, query, chain]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pickChain = (id: string | null) => {
    setChain(id);
    setActive(0);
  };

  const onInputKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      onPick(results[active]);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-label="Choose a token to pay with">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#070010]/80 backdrop-blur-sm" />
      <div className="relative flex max-h-[min(640px,88dvh)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#15111B] shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">Pay with</p>
            <p className="text-sm text-white">
              {loading ? 'Loading Aurora’s list…' : `${tokens.length} tokens on ${chains.length} chains`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-4">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#070010] px-3 focus-within:border-[#7005FC]/60">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Search a token or chain"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>
        </div>

        <div className="mt-3 flex shrink-0 gap-1.5 overflow-x-auto whitespace-nowrap px-4 pb-3 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => pickChain(null)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${chain == null ? 'border-[#7005FC] bg-[#7005FC]/20 text-white' : 'border-white/10 text-[#DDD7FE] hover:border-white/25'}`}
          >
            All chains
          </button>
          {chains.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => pickChain(item.id === chain ? null : item.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${item.id === chain ? 'border-[#7005FC] bg-[#7005FC]/20 text-white' : 'border-white/10 text-[#DDD7FE] hover:border-white/25'}`}
            >
              {item.logo ? <img src={item.logo} alt="" className="h-3.5 w-3.5 rounded-full object-contain" /> : null}
              {item.name}
              <span className="text-white/40">{item.count}</span>
            </button>
          ))}
        </div>

        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 p-2" role="listbox">
          {error && tokens.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[#FF8FA3]">{error}</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-white/50">
              {loading ? 'Loading…' : 'No token matches that search.'}
            </li>
          ) : (
            results.map((token, index) => {
              const isSelected = token.assetId === selected;
              return (
                <li key={token.assetId} data-index={index} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => onPick(token)}
                    onMouseMove={() => setActive(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${index === active ? 'bg-white/[0.06]' : ''}`}
                  >
                    <TokenAvatar token={token} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{displaySymbol(token)}</span>
                      <span className="block truncate text-xs text-white/45">{chainInfo(token.blockchain).name}</span>
                    </span>
                    <span className="text-xs tabular-nums text-[#DDD7FE]/70">{formatPrice(token.price)}</span>
                    {isSelected ? <Check className="h-4 w-4 text-[#82FF68]" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
