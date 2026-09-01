// Análisis avanzado de cartera: tasa de cobrabilidad y gráfico de flujo de caja
// proyectado. Se renderiza dentro de FinanceScreen → Proyección. El mapa de
// vencimientos (30 días) se extrajo como `VencimientosHeatmap` y vive en HomeScreen.
import { useMemo, useState, useRef, useEffect } from "react";
import { CheckCircle2, Clock, TrendingDown, CalendarDays, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useApp } from "../store/index.js";
import { formatShortDate, todayISO, addDays, getNextRenewalDate, myShare } from "../lib/utils.js";
import { CHART_COLORS } from "../lib/constants.js";
import { Card, SectionTitle, Money, ChartContainer, ChartTooltip, StatCard } from "./ui.jsx";
import type { ResolvedLoan } from "../types";

function CollectabilitySection() {
  const { derived } = useApp();
  const { collectabilityRate, avgDaysLate, overdueLoans, paidLoans } = derived;

  const items = [
    {
      label: "Cobrado en término",
      value: collectabilityRate != null ? `${Math.round(collectabilityRate * 100)}%`
        : paidLoans.length === 0 ? "Sin datos" : "—",
      hint: paidLoans.length > 0 ? `${derived.paidOnTimeCount} de ${paidLoans.length} pagados`
        : "Aún no hay préstamos pagados",
      tone: collectabilityRate != null && collectabilityRate >= 0.8 ? "success" : "warning",
      Icon: CheckCircle2,
    },
    {
      label: "Mora promedio activa",
      value: overdueLoans.length > 0 ? `${Math.round(avgDaysLate)} días` : "Al día",
      hint: overdueLoans.length > 0
        ? `${overdueLoans.length} préstamo${overdueLoans.length > 1 ? "s" : ""} atrasado${overdueLoans.length > 1 ? "s" : ""}`
        : "Ningún préstamo vencido",
      tone: overdueLoans.length > 0 ? "danger" : "success",
      Icon: Clock,
    },
    {
      label: "Cartera vencida",
      value: (() => {
        const active = derived.loansResolved.filter((l) => l._status === "active" || l._status === "overdue");
        return active.length > 0
          ? `${Math.round((overdueLoans.length / active.length) * 100)}%`
          : "—";
      })(),
      hint: `${overdueLoans.length} de ${derived.loansResolved.filter((l) => l._status === "active" || l._status === "overdue").length} activos`,
      tone: overdueLoans.length > 0 ? "danger" : "success",
      Icon: TrendingDown,
    },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <CheckCircle2 className="h-3 w-3" />
        Tasa de cobrabilidad
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} tone={item.tone} Icon={item.Icon} />
        ))}
      </div>
    </Card>
  );
}

function CashFlowChart() {
  const { derived, state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const hasData = derived.cashFlow30d.some((d) => d.expected > 0);
  // Total de la ventana, calculado sobre las mismas barras del gráfico para que no puedan
  // divergir. Cuenta cada préstamo una sola vez (ver cashFlow30d en useDerived).
  const total = derived.cashFlow30d.reduce((a, d) => a + d.expected, 0);
  const count = derived.cashFlow30d.reduce((a, d) => a + d.count, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Flujo de caja proyectado</div>
          <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
            <Money value={total} hide={hide} currency={cur} />
          </div>
          <div className="mt-0.5 text-xs text-zinc-600">
            Próximos 30 días · {count} vencimiento{count === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-1 text-[10px] text-zinc-400">
          <BarChart2 className="h-3 w-3" />
          30 días
        </div>
      </div>
      {!hasData ? (
        <div className="flex h-32 items-center justify-center text-xs text-zinc-600">
          No hay préstamos con vencimiento en los próximos 30 días
        </div>
      ) : (
        <ChartContainer className="h-44 min-w-0">
          {({ width, height }) => (
            <BarChart width={width} height={height} data={derived.cashFlow30d}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fill: "#71717a", fontSize: 10 }} interval={0} />
              <YAxis hide />
              <Tooltip cursor={{ fill: "#27272a55" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { expected: number; date: string; count: number };
                  if (d.expected === 0) return null;
                  return (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
                      <div className="mb-1 text-zinc-400">{formatShortDate(d.date)}</div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.cashflow as string }} />
                        <span className="text-zinc-400">Cobrar:</span>
                        <span className="font-medium text-zinc-100 tabular-nums">
                          {hide ? "••••••" : `${cur}${Math.round(d.expected).toLocaleString("es-AR")}`}
                        </span>
                      </div>
                      {d.count > 0 && <div className="mt-0.5 text-zinc-600">{d.count} préstamo{d.count > 1 ? "s" : ""}</div>}
                    </div>
                  );
                }}
              />
              <Bar dataKey="expected" fill={CHART_COLORS.cashflow as string} radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          )}
        </ChartContainer>
      )}
    </Card>
  );
}

interface DueEntry {
  loan: ResolvedLoan;
  gain: number;
  isRenewal: boolean;
}

interface HeatmapCell {
  date: string;
  day: number;
  dayName: string;
  dayNum: number;
  dueLoans: DueEntry[];
  gain: number;
  count: number;
}

export function VencimientosHeatmap() {
  const { derived, state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const [openCell, setOpenCell] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const cells = useMemo<HeatmapCell[]>(() => {
    const today = todayISO();
    const entries: HeatmapCell[] = Array.from({ length: 30 }, (_, i) => {
      const dateStr = addDays(today, i);
      const date = new Date(dateStr + "T00:00:00");
      return {
        date: dateStr, day: i,
        dayName: date.toLocaleDateString("es-AR", { weekday: "short" }).slice(0, 3),
        dayNum: date.getDate(),
        dueLoans: [], gain: 0, count: 0,
      };
    });
    const idx = new Map(entries.map((e, i) => [e.date, i]));

    // En préstamos compartidos, la ganancia que muestra el mapa es mi parte, no el total.
    // Los archivados no entran al mapa: es una agenda de cobro, no una metrica. Siguen
    // contando en capital y devengado (ver useDerived).
    for (const l of derived.activeLoans.filter((l) => !l.archived)) {
      const i = idx.get(l.dueDate);
      if (i !== undefined) entries[i].dueLoans.push({ loan: l, gain: (Number(l._profit) || 0) * myShare(l), isRenewal: false });
    }
    for (const l of derived.overdueLoans.filter((l) => !l.archived)) {
      // Día 0 de atraso: el préstamo pasa a "vencido" el mismo día de su vencimiento
      // (ver isOverdue), pero ese día sigue siendo su propio dueDate, no un re-vencimiento
      // futuro — sin este chequeo desaparecería de la celda de "hoy" en el mapa.
      const dueTodayIdx = idx.get(l.dueDate);
      if (dueTodayIdx !== undefined) {
        entries[dueTodayIdx].dueLoans.push({ loan: l, gain: (Number(l._profit) || 0) * myShare(l), isRenewal: false });
      }
      const next = getNextRenewalDate(l);
      const i = idx.get(next);
      if (i !== undefined) {
        // En préstamos compartidos, la ganancia proyectada del re-vencimiento es mi parte.
        const periodicGain = l._nextProfit * myShare(l);
        entries[i].dueLoans.push({ loan: l, gain: Number.isFinite(periodicGain) ? periodicGain : 0, isRenewal: true });
      }
    }
    return entries.map((e) => ({ ...e, gain: e.dueLoans.reduce((s, x) => s + x.gain, 0), count: e.dueLoans.length }));
  }, [derived.activeLoans, derived.overdueLoans]);

  const maxGain = Math.max(...cells.map((c) => c.gain), 1);

  const handlePointerDown = (cell: HeatmapCell) => {
    if (cell.dueLoans.length === 0) return;
    suppressClickRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      setOpenCell(cell.date);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => setOpenCell(null), 4000);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
  };
  const handleClick = (cell: HeatmapCell) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (cell.dueLoans.length === 1) {
      dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id: cell.dueLoans[0].loan.id } } });
    } else if (cell.dueLoans.length > 1) {
      setOpenCell(cell.date);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => setOpenCell(null), 4000);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <CalendarDays className="h-3 w-3" />
        Mapa de vencimientos · próximos 30 días
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {cells.map((cell) => {
          const intensity = cell.gain > 0 ? Math.max(0.15, cell.gain / maxGain) : 0;
          const hasDue = cell.gain > 0;
          const isToday = cell.day === 0;
          const isOpen = openCell === cell.date;
          return (
            <button key={cell.date} disabled={!hasDue}
              onClick={() => handleClick(cell)}
              onPointerDown={() => handlePointerDown(cell)}
              onPointerUp={cancelPress} onPointerLeave={cancelPress}
              onPointerCancel={cancelPress} onContextMenu={(e) => e.preventDefault()}
              className={`group relative flex select-none flex-col items-center rounded-xl border px-1 py-2 text-center transition-all ${
                isToday ? "border-amber-600/50 bg-amber-900/20"
                  : hasDue ? "border-emerald-800/40 bg-emerald-950/20 hover:bg-emerald-950/30"
                  : "border-zinc-800/40 bg-zinc-900/20"
              }`}
              style={hasDue ? { boxShadow: `0 0 8px rgba(16,185,129,${intensity * 0.3}) inset` } : undefined}
            >
              <span className={`text-[9px] ${isToday ? "text-amber-400" : "text-zinc-600"}`}>{cell.dayName}</span>
              <span className={`text-[11px] font-semibold tabular-nums ${
                isToday ? "text-amber-300" : hasDue ? "text-emerald-300" : "text-zinc-500"
              }`}>{cell.dayNum}</span>
              {hasDue && (
                <span className="mt-0.5 text-[8px] font-medium tabular-nums text-emerald-400">
                  {hide ? "•••" : cell.gain >= 1000 ? `${cur}${Math.round(cell.gain / 1000)}k` : `${cur}${Math.round(cell.gain)}`}
                </span>
              )}
              {cell.count > 1 && <span className="mt-0.5 h-1 w-1 rounded-full bg-emerald-500" />}
              {hasDue && cell.dueLoans.length > 0 && (
                <div className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-44 -translate-x-1/2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-2 text-[10px] shadow-xl ${isOpen ? "block" : "hidden group-hover:block"}`}>
                  <div className="mb-1 font-medium text-zinc-300">{formatShortDate(cell.date)}</div>
                  {cell.dueLoans.slice(0, 3).map((entry, i) => (
                    <div key={`${entry.loan.id}_${i}`} className="flex items-center justify-between gap-2 text-zinc-500">
                      <span className="truncate">{entry.loan.clientName}{entry.isRenewal ? " ↻" : ""}</span>
                      <span className="shrink-0 text-emerald-400 tabular-nums">
                        +{hide ? "•••" : `${cur}${Math.round(entry.gain).toLocaleString("es-AR")}`}
                      </span>
                    </div>
                  ))}
                  {cell.dueLoans.length > 3 && <div className="text-zinc-600">+{cell.dueLoans.length - 3} más</div>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-amber-600/50 bg-amber-900/20" />Hoy</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-emerald-800/40 bg-emerald-950/20" />Vencimiento</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-zinc-800/40 bg-zinc-900/20" />Sin vencimiento</span>
        <span className="ml-auto text-zinc-600">↻ = renovación</span>
      </div>
    </Card>
  );
}

export default function PortfolioAnalytics() {
  return (
    <div className="space-y-4">
      <SectionTitle>Análisis de cartera</SectionTitle>
      <CollectabilitySection />
      <CashFlowChart />
    </div>
  );
}
