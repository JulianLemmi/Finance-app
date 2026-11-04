// "El mes": la ganancia neta de un mes (devengado + sueldo − gastos), su curva en la
// ventana del gráfico, cuatro números que la explican y la comparación mes a mes de lo
// ganado en pesos.
//
// Todo sale de `derived.months`, el mismo recorrido que el resto de los gráficos: el
// número grande de un mes ES el punto de la curva de ese mes y la barra de ese mes.
//
// Pesos ↔ dólares: cada mes se convierte al blue PROMEDIO DE ESE MES (`useBlueMensual`).
// Con la cotización de hoy para todos, la comparación en pesos sería la de dólares por
// un número fijo y escondería justamente lo que se quiere ver: cuánto entró en pesos cada
// mes. Si el histórico no baja, se usa la de hoy y se dice.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, ListTree } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine, ReferenceDot, Tooltip, LabelList,
} from "recharts";
import { useApp } from "../store/index.js";
import { formatMoney, parseISO } from "../lib/utils.js";
import { CHART_COLORS } from "../lib/constants.js";
import { equivalenteBlue, useBlueMensual, type DolarQuote, type DolarRate } from "../lib/dolar.js";
import { makeBarLabel } from "./ui/chartHelpers.jsx";
import { Card, ChartContainer, AnimatedMoney, Money, DeltaPill, Badge } from "./ui.jsx";
import type { MonthData } from "../types";

const FMT_MES_LARGO = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const FMT_PESOS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const TEAL = "#2dd4bf";
const TEXTO_CLARO = "#f0fdfa";

function mesLargo(key: string): string {
  const d = parseISO(`${key}-01`);
  if (!d) return key;
  const s = FMT_MES_LARGO.format(d).replace(" de ", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
const pctSinSigno = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
const conSigno = (v: number, hide: boolean, currency: string) =>
  `${!hide && v > 0 ? "+" : ""}${formatMoney(v, hide, currency)}`;

/** Un mes de la ventana con su ganancia neta en las dos monedas. */
interface MesConvertido extends MonthData {
  /** Ganancia neta en pesos. `null` si no hay cómo convertir (euro, sin cotización). */
  pesos: number | null;
  dolares: number | null;
  /** Cotización con la que se convirtió este mes. */
  rate: DolarRate | null;
  /** `true` = blue promedio del mes; `false` = el de hoy (no bajó el histórico). */
  rateDelMes: boolean;
  /** Diferencia en pesos contra el mes anterior. `null` en el mes en curso: un mes a
   *  medias contra uno cerrado diría siempre "peor". */
  difPesos: number | null;
  /** La misma diferencia en %. Sólo si el mes anterior GANÓ: un % sobre una pérdida (o
   *  sobre cero) no significa nada — de −2,3M a +6,4M daba "+378%". Ahí va el monto solo. */
  varPesos: number | null;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload?: MesConvertido }[];
  hide: boolean;
  currency: string;
}

/** Tooltip de los dos gráficos: el mes, lo ganado en las dos monedas y contra el anterior. */
function MesTooltip({ active, payload, hide, currency }: TooltipProps) {
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  const otra = currency === "US$" ? m.pesos : currency === "$" ? m.dolares : null;
  return (
    <div className="rounded-xl border border-teal-900/60 bg-[#0b2526]/95 px-3 py-2 text-xs shadow-2xl">
      <div className="mb-1 font-medium text-teal-50">{mesLargo(m.key)}</div>
      <div className="font-semibold tabular-nums text-teal-50">{conSigno(m.net, hide, currency)}</div>
      {otra !== null && (
        <div className="tabular-nums text-teal-200/80">
          ≈ {conSigno(otra, hide, currency === "US$" ? "$" : "US$")}
        </div>
      )}
      {m.difPesos !== null && (
        <div className={`mt-1 tabular-nums ${m.difPesos >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
          {conSigno(m.difPesos, hide, "$")}{m.varPesos !== null ? ` (${pct(m.varPesos)})` : ""} vs el mes anterior
        </div>
      )}
    </div>
  );
}

/**
 * Qué mes se tocó, sacado de la POSICIÓN del toque y no del `activeTooltipIndex` de
 * Recharts. Ese índice lo actualiza el movimiento del puntero un cuadro después, así que
 * un click que llega sin movimiento previo —un tap en el teléfono, que no tiene hover—
 * leía el del toque ANTERIOR y elegía otro mes. Se probó en navegador: tocar la columna de
 * agosto después de haber pasado por julio dejaba julio.
 *
 * `margen` son los márgenes horizontales del gráfico. En una curva los puntos van de
 * borde a borde del área de dibujo; en barras, cada mes es una banda de igual ancho.
 */
function mesTocado(
  e: React.MouseEvent<HTMLElement>, n: number, margen: number, modo: "punto" | "banda"
): number | null {
  const r = e.currentTarget.getBoundingClientRect();
  const ancho = r.width - 2 * margen;
  if (n <= 0 || ancho <= 0) return null;
  const x = e.clientX - r.left - margen;
  const i = modo === "punto"
    ? Math.round(x / (ancho / Math.max(1, n - 1)))
    : Math.floor(x / (ancho / n));
  return Math.max(0, Math.min(n - 1, i));
}

const MARGEN_CURVA = 12;
const MARGEN_BARRAS = 4;

export default function MonthlyProfitCard({ quote }: { quote: DolarQuote }) {
  const { state, derived, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const months = derived.months;
  const last = months.length - 1;
  const historico = useBlueMensual();
  const hoyBlue = quote.data?.blue ?? null;
  const convierte = cur === "$" || cur === "US$";
  // Las etiquetas de un SVG no las alcanza el CSS del tema claro: el color va por prop.
  const etiqueta = state.settings.theme === "light" ? "#44403c" : "#d4d4d8";

  // Mes elegido, por su clave "YYYY-MM" y no por posición: si la app queda abierta y cambia
  // el mes, la ventana se corre uno y una posición guardada pasaría a señalar otro mes.
  // `null` = el mes en curso, así la card sigue al mes nuevo; un mes que salió de la
  // ventana también vuelve al en curso.
  const [sel, setSel] = useState<string | null>(null);
  const pos = sel === null ? -1 : months.findIndex((x) => x.key === sel);
  const idx = pos >= 0 ? pos : last;
  const elegir = (i: number | null) => {
    if (i === null) return;
    const j = Math.max(0, Math.min(last, i));
    setSel(j === last ? null : months[j].key);
  };

  const porMes = useMemo<MesConvertido[]>(() => {
    const filas: MesConvertido[] = months.map((m) => {
      const delMes = historico.rates?.[m.key] ?? null;
      const rate = delMes ?? hoyBlue;
      const eq = equivalenteBlue(m.net, cur, rate);
      return {
        ...m,
        pesos: cur === "$" ? m.net : cur === "US$" ? (eq?.amount ?? null) : null,
        dolares: cur === "US$" ? m.net : cur === "$" ? (eq?.amount ?? null) : null,
        rate,
        rateDelMes: delMes !== null,
        difPesos: null,
        varPesos: null,
      };
    });
    filas.forEach((x, i) => {
      const p = filas[i - 1];
      if (i === filas.length - 1 || !p || x.pesos === null || p.pesos === null) return;
      x.difPesos = x.pesos - p.pesos;
      if (p.pesos > 0) x.varPesos = (x.difPesos / p.pesos) * 100;
    });
    return filas;
  }, [months, historico.rates, hoyBlue, cur]);

  const acumulado = useMemo(() => months.reduce((s, x) => s + x.net, 0), [months]);

  // Resumen de la comparación en pesos, sólo con meses CERRADOS: el en curso va a medias.
  const resumenPesos = useMemo(() => {
    const cerrados = porMes.slice(0, -1).filter((x): x is MesConvertido & { pesos: number } => x.pesos !== null);
    if (cerrados.length === 0) return null;
    const promedio = cerrados.reduce((s, x) => s + x.pesos, 0) / cerrados.length;
    const mejor = cerrados.reduce((a, b) => (b.pesos > a.pesos ? b : a));
    return { promedio, mejor, cantidad: cerrados.length };
  }, [porMes]);

  const m = porMes[idx];
  if (!m) return null;
  const prev = idx > 0 ? porMes[idx - 1] : null;
  const enCurso = idx === last;

  // La otra moneda del mes elegido, y con qué cotización salió.
  const otra = cur === "US$" ? m.pesos : cur === "$" ? m.dolares : null;
  const otraCur = cur === "US$" ? "$" : "US$";
  const lado = cur === "US$" ? "compra" : "venta";
  const textoCotizacion = (x: MesConvertido) => {
    if (!x.rate) return "";
    const valor = cur === "US$" ? x.rate.value_buy : x.rate.value_sell;
    return `blue ${lado} ${x.rateDelMes ? `prom. ${x.label}` : "de hoy"} $${FMT_PESOS.format(valor)}`;
  };
  // Corta, para la fila de la tabla (la larga no entra en un teléfono).
  const cotizacionCorta = (x: MesConvertido) => {
    if (!x.rate) return "";
    const valor = cur === "US$" ? x.rate.value_buy : x.rate.value_sell;
    return `blue ${x.rateDelMes ? "prom." : "de hoy"} $${FMT_PESOS.format(valor)}`;
  };
  const algunoConHoy = convierte && porMes.some((x) => x.rate && !x.rateDelMes);

  // Contra qué se compara la ganancia bruta. El mes en curso va contra el MISMO TRAMO del
  // anterior (`monthPace`): el día 4 contra un mes cerrado entero diría siempre "vas peor".
  // Un mes cerrado sí va contra el cierre del anterior.
  const delta: { value: number; label: string } | null = enCurso
    ? (derived.monthPace.deltaPct === null ? null
      : { value: derived.monthPace.deltaPct, label: `vs ${derived.monthPace.previousLabel} a esta altura` })
    : (prev && prev.monthGain > 0
      ? { value: ((m.monthGain - prev.monthGain) / prev.monthGain) * 100, label: `vs ${prev.label}` }
      : null);

  const gastosSobreGanancia = m.monthGain > 0 ? (m.expense / m.monthGain) * 100 : null;

  const abrirDesglose = () =>
    dispatch({ type: "OPEN_MODAL", payload: { type: "chart-detail", payload: { kind: "accrued", idx } } });

  return (
    <section className="space-y-3">
      {/* Encabezado con el mes y las flechas para recorrer la ventana. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-zinc-100">
            El mes · {mesLargo(m.key)}
          </h2>
          <div className="text-[11px] text-zinc-500">
            {enCurso
              ? `Mes en curso · día ${derived.monthPace.dayOfMonth} de ${derived.monthPace.daysInMonth}`
              : "Mes cerrado"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => elegir(idx - 1)} disabled={idx === 0} aria-label="Mes anterior"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/70 text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => elegir(idx + 1)} disabled={enCurso} aria-label="Mes siguiente"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/70 text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Card principal. Los colores van fijos (no zinc/white) a propósito: el tema claro
          reescribe esas clases, y esta card es igual en los dos temas. */}
      <div
        className="relative overflow-hidden rounded-3xl border border-teal-300/15 p-5 shadow-[0_10px_40px_rgba(13,148,136,0.18)]"
        style={{ background: "linear-gradient(140deg, #3b9a9b 0%, #22767a 42%, #134a4e 100%)" }}
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-teal-200/15 blur-[60px]" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50/15">
                <TrendingUp className="h-4 w-4 text-teal-50" />
              </span>
              <span className="text-sm font-medium text-teal-50">Ganancia neta</span>
            </div>
            <span className="text-xs text-teal-100/75">{mesLargo(m.key)}</span>
          </div>

          <div className="mt-4 text-4xl font-semibold tracking-tight text-teal-50 sm:text-5xl">
            {!hide && m.net > 0 && "+"}
            <AnimatedMoney value={m.net} hide={hide} currency={cur} />
          </div>

          {/* Lo mismo en la otra moneda, a la cotización de ese mes. */}
          {otra !== null ? (
            <div className="mt-1 text-lg font-medium tabular-nums text-teal-100/90">
              ≈ {conSigno(otra, hide, otraCur)}
              <span className="ml-2 text-[11px] font-normal text-teal-100/60">
                al {textoCotizacion(m)}
              </span>
            </div>
          ) : convierte && (quote.loading || (!historico.rates && !historico.failed)) ? (
            <div className="mt-2 h-5 w-40 animate-pulse rounded bg-teal-50/10" />
          ) : null}

          <div className="mt-2 text-[12px] leading-relaxed text-teal-100/75">
            Devengado <Money value={m.accrued} hide={hide} currency={cur} />
            {m.salary > 0 && <> + sueldo <Money value={m.salary} hide={hide} currency={cur} /></>}
            {" − "}gastos <Money value={m.expense} hide={hide} currency={cur} />
          </div>

          {/* Curva de la ganancia neta. Tocar cerca de un mes lo elige. */}
          <div className="mt-4 cursor-pointer [&_*:focus]:outline-none" onClick={(e) => elegir(mesTocado(e, porMes.length, MARGEN_CURVA, "punto"))}>
            <ChartContainer className="h-36 min-w-0">
              {({ width, height }) => (
                <AreaChart
                  width={width} height={height} data={porMes}
                  margin={{ top: 10, right: MARGEN_CURVA, left: MARGEN_CURVA, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fa-net-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEXTO_CLARO} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={TEXTO_CLARO} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0}
                    tick={{ fill: "rgba(240,253,250,0.7)", fontSize: 11 }} />
                  <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
                  {/* La base punteada es el cero: un mes en pérdida cae debajo de ella. */}
                  <ReferenceLine y={0} stroke="rgba(240,253,250,0.35)" strokeDasharray="3 4" />
                  <Tooltip cursor={{ stroke: "rgba(240,253,250,0.35)" }}
                    content={<MesTooltip hide={hide} currency={cur} />} />
                  <Area type="monotone" dataKey="net" name="Ganancia neta"
                    stroke={TEXTO_CLARO} strokeWidth={2.5} fill="url(#fa-net-fill)"
                    dot={{ r: 3, fill: TEXTO_CLARO, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: TEXTO_CLARO, stroke: "#134a4e", strokeWidth: 2 }}
                    isAnimationActive={false} />
                  <ReferenceDot x={m.label} y={m.net} r={6} fill={TEXTO_CLARO} stroke="#134a4e" strokeWidth={3} />
                </AreaChart>
              )}
            </ChartContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-teal-50/15 pt-3 text-[12px] text-teal-100/75">
            <span>
              Acumulado {months.length} meses{" "}
              <span className="font-semibold tabular-nums text-teal-50">{conSigno(acumulado, hide, cur)}</span>
            </span>
            <button onClick={abrirDesglose}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-50/10 px-2 py-1 text-[11px] font-medium text-teal-50 transition-colors hover:bg-teal-50/20">
              <ListTree className="h-3 w-3" />
              De dónde salió
            </button>
          </div>
        </div>
      </div>

      {/* Lo que explica el número de arriba, del mismo mes. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] text-zinc-500">Ganancia bruta</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-white">
            <Money value={m.monthGain} hide={hide} currency={cur} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
            {delta
              ? <><DeltaPill value={delta.value} label={pctSinSigno(delta.value)} /><span>{delta.label}</span></>
              : <span>{m.salary > 0 ? "Devengado + sueldo" : "Interés devengado"}</span>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] text-zinc-500">Rendimiento</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-white">
            {m.roi > 0 ? pctSinSigno(m.roi) : "—"}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">Devengado sobre lo prestado</div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] text-zinc-500">Gastos / ganancia</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-white">
            {gastosSobreGanancia === null ? "—" : pctSinSigno(gastosSobreGanancia)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            <Money value={m.expense} hide={hide} currency={cur} /> en gastos
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[11px] text-zinc-500">Cobros</div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-white">{m.paymentsCount}</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            <Money value={m.collected} hide={hide} currency={cur} /> cobrados
          </div>
        </Card>
      </div>

      {/* Mes a mes en pesos: cada mes al blue promedio de ese mes. Tocar una barra o una
          fila lleva ese mes a la card de arriba. */}
      {convierte && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Mes a mes en pesos</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">
                Ganancia neta de cada mes
                {cur === "US$" && (algunoConHoy ? " · al blue de hoy (no se pudo bajar el histórico)" : " · al blue promedio de ese mes")}
              </div>
            </div>
            {!historico.rates && !historico.failed && cur === "US$" && <Badge tone="neutral">Cargando dólar…</Badge>}
          </div>

          {resumenPesos && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-b border-zinc-800/70 pb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Promedio por mes</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
                  {formatMoney(resumenPesos.promedio, hide, "$")}
                </div>
                <div className="text-[10px] text-zinc-600">
                  {resumenPesos.cantidad} mes{resumenPesos.cantidad === 1 ? "" : "es"} cerrado{resumenPesos.cantidad === 1 ? "" : "s"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Mejor mes</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">
                  {formatMoney(resumenPesos.mejor.pesos, hide, "$")}
                </div>
                <div className="text-[10px] capitalize text-zinc-600">{mesLargo(resumenPesos.mejor.key)}</div>
              </div>
            </div>
          )}

          {/* En pantalla ancha el gráfico y la tabla van lado a lado: a 1200px la tabla sola
              ponía el mes y el monto en puntas opuestas con medio metro de vacío. */}
          {porMes.some((x) => x.pesos !== null) ? (
            <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
              <div className="mt-4 cursor-pointer [&_*:focus]:outline-none" onClick={(e) => elegir(mesTocado(e, porMes.length, MARGEN_BARRAS, "banda"))}>
                <ChartContainer className="h-44 min-w-0">
                  {({ width, height }) => (
                    <BarChart width={width} height={height} data={porMes} barCategoryGap="22%"
                      margin={{ top: 20, right: MARGEN_BARRAS, left: MARGEN_BARRAS, bottom: 0 }}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0}
                        tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} />
                      <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
                      <ReferenceLine y={0} stroke={CHART_COLORS.grid as string} />
                      <Tooltip cursor={{ fill: CHART_COLORS.cursor as string }}
                        content={<MesTooltip hide={hide} currency={cur} />} />
                      <Bar dataKey="pesos" name="Ganancia en pesos" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                        {porMes.map((x, i) => (
                          <Cell key={x.key}
                            fill={(x.pesos ?? 0) < 0 ? CHART_COLORS.expense as string : TEAL}
                            // El mes elegido va lleno; el en curso, más tenue (va a medias).
                            fillOpacity={i === idx ? 1 : i === last ? 0.3 : 0.5} />
                        ))}
                        <LabelList content={makeBarLabel({ hide, color: etiqueta })} />
                      </Bar>
                    </BarChart>
                  )}
                </ChartContainer>
              </div>

              <div className="mt-3 divide-y divide-zinc-800/70 lg:mt-4">
                {[...porMes].reverse().map((x) => {
                  const i = porMes.indexOf(x);
                  return (
                    <button key={x.key} onClick={() => elegir(i)}
                      className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-zinc-900/60 ${i === idx ? "bg-teal-500/10" : ""}`}>
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-200">{mesLargo(x.key)}</div>
                        <div className="truncate text-[10px] text-zinc-600 tabular-nums">
                          {i === last ? `En curso · día ${derived.monthPace.dayOfMonth} de ${derived.monthPace.daysInMonth}` : cotizacionCorta(x)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {x.difPesos !== null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <DeltaPill value={x.difPesos}
                              label={x.varPesos !== null ? pctSinSigno(x.varPesos) : x.difPesos >= 0 ? "Mejor" : "Peor"} />
                            <span className={`text-[10px] tabular-nums ${x.difPesos >= 0 ? "text-emerald-500/80" : "text-rose-400/80"}`}>
                              {conSigno(x.difPesos, hide, "$")}
                            </span>
                          </div>
                        ) : <span className="text-[10px] text-zinc-600">{i === last ? "a medias" : "—"}</span>}
                        <div className="w-28 text-right">
                          <div className={`text-sm font-semibold tabular-nums ${(x.pesos ?? 0) < 0 ? "text-rose-400" : "text-zinc-100"}`}>
                            {x.pesos === null ? "—" : formatMoney(x.pesos, hide, "$")}
                          </div>
                          <div className="text-[10px] tabular-nums text-zinc-600">
                            {x.dolares === null ? "" : formatMoney(x.dolares, hide, "US$")}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : historico.failed && !quote.loading ? (
            <p className="mt-4 text-xs text-zinc-500">No se pudo bajar la cotización del dólar: sin ella no hay cómo pasar a pesos.</p>
          ) : (
            <div className="mt-4 h-44 animate-pulse rounded-xl bg-zinc-800/40" />
          )}
        </Card>
      )}
    </section>
  );
}
