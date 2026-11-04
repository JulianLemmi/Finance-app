// Widget que muestra la cotización del dólar blue y oficial. La consulta (refresco,
// pausa en segundo plano, reintentos) vive en `useDolar` (lib/dolar.ts): la pantalla la
// hace una sola vez y se la pasa a este widget y a la card de ganancia, que convierte con
// la misma cotización que se ve acá.
import { RefreshCw } from "lucide-react";
import type { DolarQuote } from "../lib/dolar.js";

// Constantes de módulo: construir un `Intl.NumberFormat` en cada render es lo caro.
const FMT_PESOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const FMT_HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

function fmt(n: number | undefined | null): string {
  if (n == null) return "—";
  return `$${FMT_PESOS.format(Number(n))}`;
}

export default function DolarBlue({ quote }: { quote: DolarQuote }) {
  const { data, loading, stale, updatedAt, reload } = quote;
  const blue = data?.blue;
  const oficial = data?.oficial;
  const spread =
    blue && oficial && oficial.value_sell > 0
      ? (((blue.value_sell - oficial.value_sell) / oficial.value_sell) * 100).toFixed(1)
      : null;

  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Dólar</span>
          {spread !== null && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 tabular-nums">
              Brecha {spread}%
            </span>
          )}
          {stale && data && (
            <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] text-zinc-500">Sin conexión</span>
          )}
        </div>
        <button onClick={reload} disabled={loading} aria-label="Actualizar cotización" title="Actualizar cotización"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {stale && !data ? (
        <p className="text-xs text-zinc-500">No se pudo cargar la cotización.</p>
      ) : loading && !data ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="h-3 w-10 animate-pulse rounded bg-zinc-800" />
            <div className="h-6 w-24 animate-pulse rounded-lg bg-zinc-800" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-10 animate-pulse rounded bg-zinc-800" />
            <div className="h-6 w-24 animate-pulse rounded-lg bg-zinc-800" />
          </div>
        </div>
      ) : (
        <div className={`grid grid-cols-2 gap-3 transition-opacity duration-300 ${stale ? "opacity-50" : "opacity-100"}`}>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-amber-500/70">Blue</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-amber-400">{fmt(blue?.value_sell)}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">Compra {fmt(blue?.value_buy)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Oficial</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-300">{fmt(oficial?.value_sell)}</div>
            <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">Compra {fmt(oficial?.value_buy)}</div>
          </div>
        </div>
      )}

      {updatedAt && (
        <div className="mt-3 text-[10px] text-zinc-600">
          Act. {FMT_HORA.format(updatedAt)}
        </div>
      )}
    </div>
  );
}
