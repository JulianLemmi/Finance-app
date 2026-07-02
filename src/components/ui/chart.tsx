import { useEffect, useState, useRef } from "react";
import { formatMoney, formatCompact } from "../../lib/utils.js";

interface BarLabelProps { x?: number | string; y?: number | string; width?: number | string; value?: unknown; }

// Etiqueta compacta encima de una barra, para leer el valor sin tener que tocar el
// gráfico. Pensada para mobile: fuente chica, valor abreviado. Con hide muestra puntos.
// Usar como: <LabelList content={makeBarLabel({ hide })} /> dentro de un <Bar>.
export function makeBarLabel({ hide = false, kind = "money" }: { hide?: boolean; kind?: "money" | "percent" }) {
  return function BarLabel({ x, y, width, value }: BarLabelProps) {
    const nx = Number(x) || 0, ny = Number(y) || 0, nw = Number(width) || 0, v = Number(value) || 0;
    if (!v) return null;
    const text = kind === "percent" ? (hide ? "••" : `${v.toFixed(1)}%`) : formatCompact(v, hide);
    return (
      <text x={nx + nw / 2} y={ny - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="#d4d4d8">
        {text}
      </text>
    );
  };
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
  stroke?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  hide?: boolean;
  currency?: string;
}

export const ChartTooltip = ({ active, payload, label, hide, currency = "$" }: ChartTooltipProps) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      {label !== undefined && <div className="mb-1.5 font-medium text-zinc-200">{label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
            <span className="text-zinc-300">{p.name}:</span>
            <span className="font-medium tabular-nums text-zinc-100">{formatMoney(p.value ?? 0, hide, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ChartSize {
  width: number;
  height: number;
}

interface ChartContainerProps {
  className?: string;
  children: (size: ChartSize) => React.ReactNode;
}

export function ChartContainer({ className, children }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // En mobile, al tocar una barra Recharts muestra el tooltip pero no lo cierra al soltar
  // el dedo (no hay mouseleave). Al terminar el touch forzamos el cierre disparando un
  // mouseout (React lo traduce a onMouseLeave y Recharts oculta el tooltip).
  const dismissTooltip = () => {
    const wrapper = ref.current?.querySelector(".recharts-wrapper");
    wrapper?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, cancelable: true }));
  };

  return (
    <div ref={ref} className={className} onTouchEnd={dismissTooltip} onTouchCancel={dismissTooltip}>
      {size ? children(size) : null}
    </div>
  );
}
