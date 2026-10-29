import { useEffect, useState, useRef } from "react";
import { formatMoney } from "../../lib/utils.js";

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
  /** Dibuja los valores en positivo. Lo usa el balance divergente, donde el gasto se
   *  grafica negativo para caer bajo el cero pero se lee como un importe comun. */
  absolute?: boolean;
}

export const ChartTooltip = ({ active, payload, label, hide, currency = "$", absolute }: ChartTooltipProps) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      {label !== undefined && <div className="mb-1.5 font-medium text-zinc-200">{label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
            <span className="text-zinc-300">{p.name}:</span>
            <span className="font-medium tabular-nums text-zinc-100">
              {formatMoney(absolute ? Math.abs(Number(p.value ?? 0)) : (p.value ?? 0), hide, currency)}
            </span>
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

/* ── Piezas compartidas por los gráficos de Inicio ─────────────────────────────
   La regla que siguen: el color nunca es el único que dice qué es cada serie. Con dos
   o más series siempre hay leyenda, y cada barra lleva su valor escrito encima
   (`makeBarLabel`, en chartHelpers.tsx) con el eje vertical a la vista; sólo el balance
   divergente rotula una única barra, la del mes en foco (`makeBarValueLabel`).
   ──────────────────────────────────────────────────────────────────────────── */

interface LegendItem { label: string; color: string; }

/** Leyenda inline. Obligatoria en cualquier gráfico con 2+ series. */
export const ChartLegend = ({ items }: { items: LegendItem[] }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.color }} />
        {it.label}
      </span>
    ))}
  </div>
);
