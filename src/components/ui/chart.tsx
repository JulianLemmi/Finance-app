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
   La regla que siguen: el color nunca es el único que dice qué es cada serie.
   Con dos o más series siempre hay leyenda, y los valores se etiquetan de forma
   selectiva (el último punto, el mes en foco) en vez de poner un número encima de
   cada barra — que era lo que ensuciaba los gráficos viejos.
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

/**
 * Gradiente vertical para el relleno de un área: del color de la serie a
 * transparente. Va dentro de <defs>. El id tiene que ser único por gráfico.
 */
export const AreaFill = ({ id, color }: { id: string; color: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor={color} stopOpacity={0.45} />
    <stop offset="55%" stopColor={color} stopOpacity={0.14} />
    <stop offset="100%" stopColor={color} stopOpacity={0} />
  </linearGradient>
);

/**
 * Halo suave para el trazo de un area. Sigue la estetica de la app (las cards ya
 * llevan glow) sin tocar la legibilidad: difumina el color de la linea, no el dato.
 */
export const LineGlow = ({ id, color }: { id: string; color: string }) => (
  <filter id={id} x="-20%" y="-40%" width="140%" height="200%">
    <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={color} floodOpacity="0.55" />
  </filter>
);

interface LastValueLabelProps {
  x?: number | string; y?: number | string; index?: number; value?: unknown;
}

/**
 * Etiqueta solo el ultimo punto de la serie. La alternativa —un numero por punto—
 * es ilegible y ademas redundante con el titular de la card.
 */
export function makeLastValueLabel({ total, hide = false, color = "#e4e4e7" }:
  { total: number; hide?: boolean; color?: string }) {
  return function LastValueLabel({ x, y, index, value }: LastValueLabelProps) {
    if (index !== total - 1) return null;
    const nx = Number(x) || 0, ny = Number(y) || 0;
    return (
      <text x={nx} y={ny - 10} textAnchor="end" fontSize={10} fontWeight={600} fill={color}>
        {formatCompact(Number(value) || 0, hide)}
      </text>
    );
  };
}

interface BarValueLabelProps {
  x?: number | string; y?: number | string;
  width?: number | string; height?: number | string;
  index?: number; value?: unknown;
}

/**
 * Etiqueta el valor de una sola barra (la del mes en foco). Las barras negativas
 * —el gasto en el balance divergente— se rotulan por debajo del cero, así el número
 * queda del mismo lado que la barra que describe.
 */
export function makeBarValueLabel({ onlyIndex, hide = false, color = "#e4e4e7" }:
  { onlyIndex: number; hide?: boolean; color?: string }) {
  return function BarValueLabel({ x, y, width, height, index, value }: BarValueLabelProps) {
    if (index !== onlyIndex) return null;
    const v = Number(value) || 0;
    if (!v) return null;
    const nx = Number(x) || 0, ny = Number(y) || 0;
    const nw = Number(width) || 0, nh = Number(height) || 0;
    // Para las barras negativas Recharts entrega `y` en el borde inferior y `height`
    // negativo, asi que ni ny ni ny+nh son de por si el borde libre. Normalizamos los
    // dos extremos y elegimos el que corresponde: sin esto la etiqueta del gasto
    // quedaba dibujada ENCIMA de su propia barra.
    const top = Math.min(ny, ny + nh);
    const bottom = Math.max(ny, ny + nh);
    const ty = v < 0 ? bottom + 12 : top - 5;
    return (
      <text x={nx + nw / 2} y={ty} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
        {formatCompact(Math.abs(v), hide)}
      </text>
    );
  };
}
