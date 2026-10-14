'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, RotateCcw } from 'lucide-react';

type MermaidDiagramProps = {
  chart: string;
};

function normalizeSvg(input: string): string {
  const theme = `<style>
    rect.actor, .node rect, .node polygon, .node circle, .label-container, .cluster rect {
      fill: #FCFBFF !important;
      stroke: #7005FC !important;
    }
    .actor-line { stroke: rgb(255 255 255 / 20%) !important; }
    .messageLine0, .messageLine1, .loopLine { stroke: #7005FC !important; }
    text.actor, text.actor tspan, .nodeLabel, .nodeLabel tspan { fill: #1A1330 !important; }
    .messageText, .messageText tspan, .loopText, .loopText tspan, .labelText, .labelText tspan { fill: #E4E4E4 !important; }
    .labelBox, .note { fill: transparent !important; stroke: none !important; }
  </style>`;
  return input
    .replace(/<svg([^>]*?)>/i, (_match, attrs: string) => {
      const cleaned = attrs.replace(/\swidth="[^"]*"/i, '').replace(/\sheight="[^"]*"/i, '');
      return `<svg${cleaned} width="100%" height="auto">${theme}`;
    });
}

const control =
  'grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[#E4E4E4] hover:border-[#7005FC] hover:text-white';

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    async function renderChart() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          suppressErrorRendering: true,
          fontFamily: 'inherit',
          themeVariables: {
            darkMode: true,
            background: 'transparent',
            primaryColor: '#FCFBFF',
            primaryTextColor: '#1A1330',
            primaryBorderColor: '#7005FC',
            lineColor: '#7005FC',
            textColor: '#E4E4E4',
            actorBkg: '#FCFBFF',
            actorBorder: '#7005FC',
            actorTextColor: '#1A1330',
            actorLineColor: '#E4E4E4',
            signalColor: '#7005FC',
            signalTextColor: '#E4E4E4',
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (mounted) {
          setSvg(normalizeSvg(rendered));
          setError('');
          setScale(1);
          setPan({ x: 0, y: 0 });
        }
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to render diagram');
      }
    }
    renderChart();
    return () => {
      mounted = false;
    };
  }, [chart]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.12 : -0.12;
      setScale((current) => Math.min(2.4, Math.max(0.7, Number((current + delta).toFixed(2)))));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [svg]);

  const move = (x: number, y: number) => setPan((current) => ({ x: current.x + x, y: current.y + y }));
  const reset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  if (error) {
    return <div className="rounded-lg border border-[#FF5C7A]/40 px-4 py-3 text-xs text-[#FF5C7A]">{error}</div>;
  }
  if (!svg) {
    return <div className="text-xs text-[#E4E4E4]">Rendering diagram.</div>;
  }

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        className="overflow-hidden rounded-xl border border-white/10 bg-[#070010]"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPan({
            x: drag.current.px + event.clientX - drag.current.x,
            y: drag.current.py + event.clientY - drag.current.y,
          });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div
          className="origin-center cursor-grab select-none active:cursor-grabbing [&_svg]:h-auto [&_svg]:w-full"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={control} aria-label="Up" onClick={() => move(0, 40)}><ArrowUp className="h-4 w-4" /></button>
        <button type="button" className={control} aria-label="Zoom in" onClick={() => setScale((current) => Math.min(2.4, Number((current + 0.2).toFixed(2))))}><Plus className="h-4 w-4" /></button>
        <button type="button" className={control} aria-label="Left" onClick={() => move(40, 0)}><ArrowLeft className="h-4 w-4" /></button>
        <button type="button" className={control} aria-label="Reset" onClick={reset}><RotateCcw className="h-4 w-4" /></button>
        <button type="button" className={control} aria-label="Right" onClick={() => move(-40, 0)}><ArrowRight className="h-4 w-4" /></button>
        <button type="button" className={control} aria-label="Down" onClick={() => move(0, -40)}><ArrowDown className="h-4 w-4" /></button>
        <button type="button" className={control} aria-label="Zoom out" onClick={() => setScale((current) => Math.max(0.7, Number((current - 0.2).toFixed(2))))}><Minus className="h-4 w-4" /></button>
        <span className="ml-1 text-xs text-[#B781FE]">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}
