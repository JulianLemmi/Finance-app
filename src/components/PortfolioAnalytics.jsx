import { useMemo } from "react";
import { CheckCircle2, Clock, TrendingDown, CalendarDays, BarChart2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useApp } from "../store/index.js";
import { formatShortDate } from "../lib/utils.js";
import { CHART_COLORS } from "../lib/constants.js";
import { Card, SectionTitle, Money, ChartContainer, ChartTooltip, StatCard } from "./ui.jsx";

/* ── Cobrabilidad metrics ─────────────────────────────── */
function CollectabilitySection() {
  const { derived } = useApp();
  const { collectabilityRate, avgDaysLate, overdueLoans, paidLoans } = derived;

  const items = [
    {
      label: "Cobrado en término",
      value:
        collectabilityRate != null
          ? `${Math.round(collectabilityRate * 100)}%`
          : paidLoans.length === 0
          ? "Sin datos"
          : "—",
      hint:
        paidLoans.length > 0
          ? `${derived.paidOnTimeCount} de ${paidLoans.length} pagados`
          : "Aún no hay préstamos pagados",
      tone: collectabilityRate != null && collectabilityRate >= 0.8 ? "success" : "warning",
      Icon: CheckCircle2,
    },
    {
      label: "Mora promedio activa",
      value: overdueLoans.length > 0 ? `${Math.round(avgDaysLate)} días` : "Al día",
      hint:
        overdueLoans.length > 0
          ? `${overdueLoans.length} préstamo${overdueLoans.length > 1 ? "s" : ""} atrasado${overdueLoans.length > 1 ? "s" : ""}`
          : "Ningún préstamo vencido",
      tone: overdueLoans.length > 0 ? "danger" : "success",
      Icon: Clock,
    },
    {
      label: "Cartera vencida",
      value:
        derived.loansResolved.filter((l) => l._status === "active" || l._status === "overdue")
          .length > 0
          ? `${Math.round(
              (overdueLoans.length /
                derived.loansResolved.filter(
                  (l) => l._status === "active" || l._status === "overdue"
                ).length) *
                100
            )}%`
          : "—",
      hint: `${overdueLoans.length} de ${
        derived.loansResolved.filter((l) => l._status === "active" || l._status === "overdue").length
      } activos`,
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

/* ── Cash flow projection chart ──────────────────────── */
function CashFlowChart() {
  const { derived, state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const hasData = derived.cashFlow30d.some((d) => d.expected > 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Flujo de caja proyectado
          </div>
          <div className="mt-0.5 text-xs text-zinc-600">Próximos 30 días · por vencimiento</div>
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
            <BarChart
              width={width}
              height={height}
              data={derived.cashFlow30d}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#71717a", fontSize: 10 }}
                interval={0}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "#27272a55" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  if (d.expected === 0) return null;
                  return (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
                      <div className="mb-1 text-zinc-400">{formatShortDate(d.date)}</div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.cashflow }} />
                        <span className="text-zinc-400">Cobrar:</span>
                        <span className="font-medium text-zinc-100 tabular-nums">
                          {hide ? "••••••" : `${cur}${Math.round(d.expected).toLocaleString("es-AR")}`}
                        </span>
                      </div>
                      {d.count > 0 && (
                        <div className="mt-0.5 text-zinc-600">{d.count} préstamo{d.count > 1 ? "s" : ""}</div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="expected"
                fill={CHART_COLORS.cashflow}
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
            </BarChart>
          )}
        </ChartContainer>
      )}
    </Card>
  );
}

/* ── Due date heatmap (30-day grid) ──────────────────── */
function VencimientosHeatmap() {
  const { derived, state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const cells = useMemo(() => {
    return derived.cashFlow30d.map((d) => {
      const date = new Date(d.date + "T00:00:00");
      const dayName = date.toLocaleDateString("es-AR", { weekday: "short" }).slice(0, 3);
      const dayNum = date.getDate();
      const monthName = date.toLocaleDateString("es-AR", { month: "short" });
      return { ...d, dayName, dayNum, monthName };
    });
  }, [derived.cashFlow30d]);

  const maxAmount = Math.max(...cells.map((c) => c.expected), 1);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
        <CalendarDays className="h-3 w-3" />
        Mapa de vencimientos · próximos 30 días
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {cells.map((cell) => {
          const intensity = cell.expected > 0 ? Math.max(0.15, cell.expected / maxAmount) : 0;
          const hasDue = cell.expected > 0;
          const isToday = cell.day === 0;

          // Find loans due on this day for tooltip
          const dueLoans = [...derived.activeLoans, ...derived.overdueLoans].filter(
            (l) => l.dueDate === cell.date
          );

          return (
            <button
              key={cell.date}
              disabled={!hasDue}
              onClick={() => {
                if (dueLoans.length === 1) {
                  dispatch({
                    type: "OPEN_MODAL",
                    payload: { type: "loan-detail", payload: { id: dueLoans[0].id } },
                  });
                }
              }}
              className={`group relative flex flex-col items-center rounded-xl border px-1 py-2 text-center transition-all ${
                isToday
                  ? "border-amber-600/50 bg-amber-900/20"
                  : hasDue
                  ? "border-emerald-800/40 bg-emerald-950/20 hover:bg-emerald-950/30"
                  : "border-zinc-800/40 bg-zinc-900/20"
              }`}
              style={
                hasDue
                  ? { boxShadow: `0 0 8px rgba(16,185,129,${intensity * 0.3}) inset` }
                  : undefined
              }
            >
              <span className={`text-[9px] ${isToday ? "text-amber-400" : "text-zinc-600"}`}>
                {cell.dayName}
              </span>
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  isToday ? "text-amber-300" : hasDue ? "text-emerald-300" : "text-zinc-500"
                }`}
              >
                {cell.dayNum}
              </span>
              {hasDue && (
                <span className="mt-0.5 text-[8px] font-medium tabular-nums text-emerald-400">
                  {hide
                    ? "•••"
                    : cell.expected >= 1000
                    ? `${cur}${Math.round(cell.expected / 1000)}k`
                    : `${cur}${Math.round(cell.expected)}`}
                </span>
              )}
              {cell.count > 1 && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-emerald-500" />
              )}
              {/* Tooltip on hover */}
              {hasDue && dueLoans.length > 0 && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-40 -translate-x-1/2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-2 text-[10px] shadow-xl group-hover:block">
                  <div className="mb-1 font-medium text-zinc-300">{formatShortDate(cell.date)}</div>
                  {dueLoans.slice(0, 3).map((l) => (
                    <div key={l.id} className="truncate text-zinc-500">
                      {l.clientName} · {hide ? "•••" : `${cur}${Math.round(l._remaining).toLocaleString("es-AR")}`}
                    </div>
                  ))}
                  {dueLoans.length > 3 && (
                    <div className="text-zinc-600">+{dueLoans.length - 3} más</div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm border border-amber-600/50 bg-amber-900/20" />
          Hoy
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm border border-emerald-800/40 bg-emerald-950/20" />
          Vencimiento
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm border border-zinc-800/40 bg-zinc-900/20" />
          Sin vencimiento
        </span>
      </div>
    </Card>
  );
}

/* ── Main export ─────────────────────────────────────── */
export default function PortfolioAnalytics() {
  return (
    <div className="space-y-4">
      <SectionTitle>Análisis de cartera</SectionTitle>
      <CollectabilitySection />
      <VencimientosHeatmap />
      <CashFlowChart />
    </div>
  );
}
