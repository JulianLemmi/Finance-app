import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const API_URL = "https://api.bluelytics.com.ar/v2/latest";
const REFRESH_MS = 5 * 60 * 1000;

function fmt(n) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export default function DolarBlue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("error");
      const json = await res.json();
      setData(json);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    let t = null;
    const start = () => {
      if (t == null) t = setInterval(load, REFRESH_MS);
    };
    const stop = () => {
      if (t != null) { clearInterval(t); t = null; }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { load(); start(); }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

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
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-amber-500/70">Blue</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-amber-400">
              {fmt(blue?.value_sell)}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
              Compra {fmt(blue?.value_buy)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Oficial</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-300">
              {fmt(oficial?.value_sell)}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
              Compra {fmt(oficial?.value_buy)}
            </div>
          </div>
        </div>
      )}

      {updatedAt && (
        <div className="mt-3 text-[10px] text-zinc-600">
          Act.{" "}
          {updatedAt.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}
    </div>
  );
}
