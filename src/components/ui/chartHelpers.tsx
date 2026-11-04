// Fábricas de etiquetas de los gráficos. Viven acá y no en chart.tsx
// porque NO son componentes: Fast Refresh sólo funciona en archivos que exportan únicamente
// componentes, y mezclarlos hacía que cada cambio en estos helpers recargara la página
// entera en vez de reemplazar el módulo en caliente.
import { formatCompact } from "../../lib/utils.js";

interface BarLabelProps { x?: number | string; y?: number | string; width?: number | string; value?: unknown; }

// Etiqueta compacta encima de una barra, para leer el valor sin tener que tocar el
// gráfico. Pensada para mobile: fuente chica, valor abreviado. Con hide muestra puntos.
// Usar como: <LabelList content={makeBarLabel({ hide })} /> dentro de un <Bar>.
// `color`: el gris claro de siempre no se lee sobre el fondo del tema claro.
export function makeBarLabel({ hide = false, kind = "money", color = "#d4d4d8" }: { hide?: boolean; kind?: "money" | "percent"; color?: string }) {
  return function BarLabel({ x, y, width, value }: BarLabelProps) {
    const nx = Number(x) || 0, ny = Number(y) || 0, nw = Number(width) || 0, v = Number(value) || 0;
    if (!v) return null;
    const text = kind === "percent" ? (hide ? "••" : `${v.toFixed(1)}%`) : formatCompact(v, hide);
    return (
      <text x={nx + nw / 2} y={ny - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
        {text}
      </text>
    );
  };
}

interface PointLabelOptions { onlyIndex: number; hide?: boolean; color?: string }

interface PointLabelProps { x?: number | string; y?: number | string; index?: number; value?: unknown; }

/**
 * Etiqueta el valor de UN punto de una curva (el último mes): en un gráfico de área no hay
 * barra donde escribir cada valor, y escribirlos todos encima de la línea la tapa. El resto
 * se lee en el tooltip. Usar como: <LabelList content={makePointLabel({ onlyIndex })} />.
 */
export function makePointLabel({ onlyIndex, hide = false, color = "#e4e4e7" }: PointLabelOptions) {
  return function PointLabel({ x, y, index, value }: PointLabelProps) {
    if (index !== onlyIndex) return null;
    const v = Number(value) || 0;
    const nx = Number(x) || 0, ny = Number(y) || 0;
    return (
      <text x={nx} y={ny - 10} textAnchor="end" fontSize={10} fontWeight={600} fill={color}>
        {formatCompact(v, hide)}
      </text>
    );
  };
}
