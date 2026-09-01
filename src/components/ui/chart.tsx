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

/**
 * Redondea un extremo del eje hacia afuera al múltiplo "lindo" más cercano (1/2/5 × 10^k).
 * Sin esto, un dominio calculado como `dataMax * 1.18` deja ticks como 305 o 695: el eje
 * queda con números que nadie escribiría a mano.
 */
export function niceAxisBound(value: number, dir: "up" | "down"): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const mag = Math.pow(10, Math.floor(Math.log10(abs)));
  const norm = abs / mag;
  const steps = [1, 2, 2.5, 5, 10];
  // Hacia afuera del cero: el borde positivo sube, el negativo baja.
  const outward = (sign > 0) === (dir === "up");
  const step = outward
    ? (steps.find((s) => s >= norm - 1e-9) ?? 10)
    : ([...steps].reverse().find((s) => s <= norm + 1e-9) ?? 1);
  return sign * step * mag;
}
