'use client';

import { memo, useEffect, useRef } from 'react';

const SYMBOL = 'BYBIT:MONUSDT.P';
const LAYOUT_URL = `https://www.tradingview.com/chart/HCcWorxC/?symbol=${encodeURIComponent(SYMBOL)}`;

function PriceChartInner() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    container.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: SYMBOL,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: '#070010',
      gridColor: 'rgba(255, 255, 255, 0.05)',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      details: true,
      watchlist: [SYMBOL, 'BYBIT:MONUSDT', 'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT'],
      calendar: false,
      studies: ['STD;RSI'],
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);
    return () => {
      container.innerHTML = '';
    };
  }, []);

  return (
    <section className="flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#070010] shadow-[0_24px_48px_-32px_rgba(0,0,0,0.9)]">
      <header data-tour="perpl-chart" className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#15111B] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#B781FE]">MON / USDT perpetual</p>
          <p className="text-sm text-white">Bybit · daily candles with RSI 14</p>
        </div>
        <a
          href={LAYOUT_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#DDD7FE] transition hover:border-[#B781FE]/60 hover:text-white"
        >
          Open in TradingView ↗
        </a>
      </header>
      <div className="relative min-h-[480px] w-full flex-1 sm:min-h-[560px] xl:min-h-[600px]">
        <div ref={host} className="tradingview-widget-container absolute inset-0" />
      </div>
    </section>
  );
}

export const PriceChart = memo(PriceChartInner);
