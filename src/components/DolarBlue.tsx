// Widget que muestra la cotización del dólar blue y oficial en tiempo real.
// Se auto-refresca cada 5 minutos y pausa cuando la app está en segundo plano.
// Usa back-off exponencial en caso de errores de red (hasta MAX_RETRIES).
import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";

const API_URL = "https://api.bluelytics.com.ar/v2/latest";
const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 3;
const VISIBILITY_DELAY_MS = 1_000;

interface DolarRate {
  value_sell: number;
  value_buy: number;
}

interface DolarData {
  blue?: DolarRate;
  oficial?: DolarRate;
}

function fmt(n: number | undefined | null): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export default function DolarBlue() {
  const [data, setData] = useState<DolarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async (attempt = 0) => {
    clearRetry();
    if (attempt === 0) setLoading(true);
    try {
      const res = await fetchWithTimeout(API_URL, FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as DolarData;
      setData(json);
      setStale(false);
      setUpdatedAt(new Date());
      setLoading(false);
    } catch {
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1_000;
        retryTimerRef.current = setTimeout(() => load(attempt + 1), delay);
        return;
      }
      setStale(true);
      setLoading(false);
    }
  }, [clearRetry]);

  useEffect(() => {
    load();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

    const startInterval = () => { if (intervalId == null) intervalId = setInterval(() => load(), REFRESH_MS); };
    const stopInterval = () => { if (intervalId != null) { clearInterval(intervalId); intervalId = null; } };

    const onVisibility = () => {
      if (visibilityTimer) clearTimeout(visibilityTimer);
      if (document.hidden) { stopInterval(); clearRetry(); }
      else {
        visibilityTimer = setTimeout(() => { load(); startInterval(); }, VISIBILITY_DELAY_MS);
      }
    };

    startInterval();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopInterval(); clearRetry();
      if (visibilityTimer) clearTimeout(visibilityTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, clearRetry]);

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
        <button onClick={() => load()} disabled={loading}
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
          Act. {updatedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
