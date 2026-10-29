// Fábricas de etiquetas y escala de los gráficos de barras. Viven acá y no en chart.tsx
// porque NO son componentes: Fast Refresh sólo funciona en archivos que exportan únicamente
// componentes, y mezclarlos hacía que cada cambio en estos helpers recargara la página
// entera en vez de reemplazar el módulo en caliente.
import { formatCompact } from "../../lib/utils.js";

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

interface BarValueLabelOptions { onlyIndex: number; hide?: boolean; color?: string }

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
export function makeBarValueLabel({ onlyIndex, hide = false, color = "#e4e4e7" }: BarValueLabelOptions) {
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
