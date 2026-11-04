// Cotización del dólar (bluelytics) y conversión de montos entre pesos y dólares.
// El hook vivía adentro del widget `DolarBlue`; salió acá para que la card de ganancia de
// Inicio convierta con LA MISMA cotización que muestra el widget, con una sola consulta.
import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = "https://api.bluelytics.com.ar/v2/latest";
const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 3;
const VISIBILITY_DELAY_MS = 1_000;

export interface DolarRate {
  value_sell: number;
  value_buy: number;
}

export interface DolarData {
  blue?: DolarRate;
  oficial?: DolarRate;
}

export interface DolarQuote {
  data: DolarData | null;
  loading: boolean;
  /** No se pudo actualizar: `data` (si hay) es la última cotización que llegó. */
  stale: boolean;
  updatedAt: Date | null;
  reload: () => void;
}

/** Un monto expresado en la otra moneda, con la cotización que se usó. */
export interface Equivalente {
  amount: number;
  /** Símbolo de la moneda del equivalente ("$" o "US$"). */
  currency: string;
  rate: number;
  /** Qué punta del blue se usó: la que efectivamente se consigue en cada sentido. */
  side: "compra" | "venta";
}

/**
 * Pasa un monto de la moneda de la app a la otra (pesos ↔ dólares) al blue.
 *
 * Se usa la punta que efectivamente se consigue: dólares que se venden se cobran a
 * precio de COMPRA, y pesos que se pasan a dólares se pagan a precio de VENTA. Con el
 * promedio, el equivalente prometería plata que en la calle no se consigue.
 *
 * Devuelve `null` si la moneda no es peso ni dólar (euro) o si no hay cotización válida.
 */
export function equivalenteBlue(amount: number, currency: string, blue: DolarRate | null | undefined): Equivalente | null {
  if (!blue || !Number.isFinite(amount)) return null;
  if (currency === "US$") {
    const rate = Number(blue.value_buy);
    if (!(rate > 0)) return null;
    return { amount: amount * rate, currency: "$", rate, side: "compra" };
  }
  if (currency === "$") {
    const rate = Number(blue.value_sell);
    if (!(rate > 0)) return null;
    return { amount: amount / rate, currency: "US$", rate, side: "venta" };
  }
  return null;
}

// ── Histórico: el blue promedio de cada mes ──────────────────────────────────
// Para comparar mes a mes lo ganado en pesos, cada mes se convierte a la cotización DE ESE
// MES. Con la de hoy para todos, la comparación en pesos sería la de dólares multiplicada
// por un número fijo: no mostraría lo que efectivamente entró en pesos cada mes.

const EVOLUTION_URL = "https://api.bluelytics.com.ar/v2/evolution.json";
const HISTORICO_TIMEOUT_MS = 15_000;
// El archivo (~700 KB sin comprimir, todo el histórico diario) lo sirven con max-age de 2 h.
const HISTORICO_TTL_MS = 2 * 60 * 60 * 1000;

/** Promedio del blue de cada mes "YYYY-MM", a partir de las cotizaciones diarias de
 *  bluelytics. Ignora lo que no sea blue o venga roto (cotización en cero, sin fecha). */
export function blueMensual(dias: unknown): Record<string, DolarRate> {
  if (!Array.isArray(dias)) return {};
  const acc: Record<string, { buy: number; sell: number; n: number }> = {};
  for (const d of dias) {
    if (!d || typeof d !== "object") continue;
    const { date, source, value_buy, value_sell } = d as Record<string, unknown>;
    if (source !== "Blue" || typeof date !== "string" || !/^\d{4}-\d{2}/.test(date)) continue;
    const buy = Number(value_buy), sell = Number(value_sell);
    if (!(buy > 0) || !(sell > 0)) continue;
    const k = date.slice(0, 7);
    const a = (acc[k] ??= { buy: 0, sell: 0, n: 0 });
    a.buy += buy; a.sell += sell; a.n += 1;
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, a]) => [k, { value_buy: a.buy / a.n, value_sell: a.sell / a.n }])
  );
}

// Una sola descarga compartida por todos los que la piden (y por los re-montajes de la
// pantalla) mientras no venza. Si falla se olvida, para que el próximo montaje reintente.
let historico: { at: number; promise: Promise<Record<string, DolarRate>> } | null = null;

function cargarHistorico(): Promise<Record<string, DolarRate>> {
  if (historico && Date.now() - historico.at < HISTORICO_TTL_MS) return historico.promise;
  const promise = fetchWithTimeout(EVOLUTION_URL, HISTORICO_TIMEOUT_MS)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<unknown>; })
    .then(blueMensual);
  historico = { at: Date.now(), promise };
  promise.catch(() => { if (historico?.promise === promise) historico = null; });
  return promise;
}

export interface BlueMensual {
  /** Blue promedio por mes "YYYY-MM". `null` mientras carga o si no se pudo bajar. */
  rates: Record<string, DolarRate> | null;
  failed: boolean;
}

export function useBlueMensual(): BlueMensual {
  const [estado, setEstado] = useState<BlueMensual>({ rates: null, failed: false });
  useEffect(() => {
    let vivo = true;
    cargarHistorico()
      .then((rates) => { if (vivo) setEstado({ rates, failed: false }); })
      .catch(() => { if (vivo) setEstado({ rates: null, failed: true }); });
    return () => { vivo = false; };
  }, []);
  return estado;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cotización del dólar, auto-refrescada cada 5 minutos y pausada con la app en segundo
 * plano. Reintenta con back-off exponencial ante errores de red (hasta MAX_RETRIES).
 * Se llama UNA vez por pantalla y se pasa a quien la necesite.
 */
export function useDolar(): DolarQuote {
  const [data, setData] = useState<DolarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `aliveRef`: si el componente se desmonta con un fetch en vuelo, el catch agendaba un
  // reintento DESPUÉS del cleanup, y se encadenaban hasta tres más sin dueño, llamando
  // setState sobre un componente muerto. `loadRef`: los reintentos se llaman a sí mismos, y
  // una función que se referencia dentro de su propio useCallback es una lectura antes de
  // la declaración (lo marca react-hooks/immutability).
  const aliveRef = useRef(true);
  const loadRef = useRef<(attempt?: number) => Promise<void>>(async () => {});

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

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
      if (!aliveRef.current) return;
      setData(json);
      setStale(false);
      setUpdatedAt(new Date());
      setLoading(false);
    } catch {
      if (!aliveRef.current) return;
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1_000;
        retryTimerRef.current = setTimeout(() => loadRef.current(attempt + 1), delay);
        return;
      }
      setStale(true);
      setLoading(false);
    }
  }, [clearRetry]);

  useEffect(() => { loadRef.current = load; }, [load]);

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

  const reload = useCallback(() => { load(); }, [load]);
  return { data, loading, stale, updatedAt, reload };
}
