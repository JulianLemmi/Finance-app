// Pantalla principal: capital total, préstamos próximos a vencer, agenda del día,
// mapa de vencimientos (30 días), gráficos de evolución y actividad reciente. El
// reloj vive en LiveClock aislado para que sólo ese componente haga re-render cada segundo.
import { useState, useEffect, useMemo } from "react";
import {
  Eye, EyeOff, Bell, Plus, Pencil, Sparkles, Target, TrendingUp, Wallet,
  Briefcase, Activity, CalendarClock, ChevronRight, ChevronDown, CheckCircle2, Search,
  Banknote, Sun,
} from "lucide-react";
import { formatShortDate, getNextRenewalDate, addDays, todayISO, formatInterest } from "../lib/utils.js";
import { upcomingInterest } from "../lib/calcs.js";
import { UI_LIMITS, CHART_COLORS, BUSINESS_RULES } from "../lib/constants.js";
import PaymentSheet from "../features/loans/PaymentSheet.jsx";
import { useApp } from "../store/index.js";
import {
  Card, SectionTitle, EmptyState, Money, AnimatedMoney, StatCard, ChartTooltip,
  DeltaPill, Badge, IconButton, ChartContainer, makeBarLabel,
} from "../components/ui.jsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";
import DolarBlue from "../components/DolarBlue.jsx";
import { VencimientosHeatmap } from "../components/PortfolioAnalytics.jsx";
import type { ResolvedLoan } from "../types";

function getGreet(h: number): string {
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function LiveClock() {
  const { state } = useApp();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const userName = state.settings.userName?.trim();
  const greet = getGreet(now.getHours());
  const dateLabel = now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{greet}</div>
      <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-white">
        {userName || "Panel financiero"}
      </h1>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
        <span className="capitalize">{dateLabel}</span>
        <span className="text-zinc-700">·</span>
        <span className="tabular-nums text-zinc-400">{timeLabel}</span>
      </div>
    </div>
  );
}

export default function HomeScreen() {
  const { state, dispatch, derived, setSearchOpen } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const [showUpcoming, setShowUpcoming] = useState(true);
  const [quickPayLoan, setQuickPayLoan] = useState<ResolvedLoan | null>(null);

  const hasAnyData = state.loans.length > 0 || state.clients.length > 0
    || state.expenses.length > 0 || state.income.length > 0;

  const allocationPct = derived.workingCapital > 0
    ? derived.capitalInvested / derived.workingCapital : 0;

  // Crecimiento del capital por venir en los próximos 30 días (rolling desde hoy):
  // el interés que se va a cobrar por los vencimientos/re-vencimientos en esa ventana.
  const growth30d = useMemo(() => {
    const until = addDays(todayISO(), 30);
    return [...derived.activeLoans, ...derived.overdueLoans]
      .reduce((sum, l) => sum + upcomingInterest(l, until), 0);
  }, [derived.activeLoans, derived.overdueLoans]);

  // "Mes actual" = interés devengado + sueldo fijo. No suma las transacciones de ingreso
  // manuales, para no duplicar el interés si el usuario carga los cobros como ingreso.
  const monthIncome = (derived.months[derived.months.length - 1]?.accrued ?? 0)
    + (derived.months[derived.months.length - 1]?.salary ?? 0);
  const monthExpense = derived.months[derived.months.length - 1]?.expense ?? 0;
  const monthDelta = monthIncome - monthExpense;

  return (
    <>
      <div className="space-y-6 pb-2">
        <div className="flex items-center justify-between pt-1">
          <LiveClock />
          <div className="flex items-center gap-2">
            <IconButton Icon={Search} aria-label="Buscar" onClick={() => setSearchOpen?.(true)} />
            <IconButton Icon={hide ? EyeOff : Eye} aria-label="Ocultar saldos"
              onClick={() => dispatch({ type: "UPDATE_SETTINGS", payload: { hideBalances: !hide } })} />
            <button
              onClick={() => dispatch({ type: "SET_TAB", payload: "loans" })}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-900/70 text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
            >
              {(() => {
                const alerts = derived.overdueLoans.length + derived.upcomingDue.filter(
                  (l) => l._daysUntilDue !== null && l._daysUntilDue <= UI_LIMITS.ALERT_DAYS_THRESHOLD && l._daysUntilDue >= 0
                ).length;
                return (
                  <>
                    <Bell className={`h-4 w-4 ${alerts > 0 ? "fa-ring" : ""}`} />
                    {alerts > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                    )}
                  </>
                );
              })()}
            </button>
          </div>
        </div>

        {/* Capital card */}
        <div className={`fa-aurora fa-grain relative overflow-hidden rounded-3xl border border-amber-800/25 bg-gradient-to-br from-zinc-900/95 via-[#0d0a06]/95 to-amber-950/40 p-6 shadow-[0_0_60px_rgba(120,53,15,0.18)] backdrop-blur-sm${state.settings.theme !== "light" ? " glow-card" : ""}`}>
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-700/12 blur-[60px]" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-amber-900/18 blur-[50px]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(245,158,11,0.02)_0%,transparent_60%)]" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-500/80">
              <Sparkles className="h-3 w-3" />
              Capital total
            </div>
            <div className="mt-2 text-4xl font-semibold tracking-tight text-white">
              <AnimatedMoney value={derived.totalCapital} hide={hide} currency={cur} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Invertido <Money value={derived.capitalInvested} hide={hide} currency={cur} className="text-zinc-200" />
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                Disponible <Money value={derived.available} hide={hide} currency={cur} className="text-zinc-200" />
              </span>
              {derived.totalAssets > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  Activos <Money value={derived.totalAssets} hide={hide} currency={cur} className="text-zinc-200" />
                </span>
              )}
              {derived.totalLiabilities > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Pasivos <Money value={derived.totalLiabilities} hide={hide} currency={cur} className="text-rose-300" />
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
                <div className="fa-bar-shine h-full bg-gradient-to-r from-amber-700 to-amber-500 transition-all duration-700"
                  style={{ width: `${Math.max(0, Math.min(100, allocationPct * 100))}%` }} />
              </div>
              {(() => {
                // Patrimonio proyectado a 30 días: capital actual + lo que va a crecer por
                // los vencimientos de la ventana. El % es el crecimiento sobre el capital total.
                const projected30d = derived.totalCapital + growth30d;
                const gainPct = derived.totalCapital > 0 ? (growth30d / derived.totalCapital) * 100 : 0;
                return (
                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{Math.round(allocationPct * 100)}% asignado</span>
                    <span className="flex items-center gap-1.5">
                      En 30d <span className="text-zinc-300 tabular-nums"><Money value={projected30d} hide={hide} currency={cur} /></span>
                      {gainPct > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 tabular-nums">
                          +{gainPct.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Onboarding */}
        {!hasAnyData && derived.totalCapital === 0 && (
          <Card className="overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500/80">
                <Target className="h-3 w-3" />
                Empezá por acá
              </div>
              <h3 className="mt-1.5 text-base font-semibold tracking-tight text-zinc-100">
                Configurá tu capital y tu primer préstamo
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                Cargá el capital con el que arrancás y registrá la primera operación.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-2 text-sm font-medium text-amber-50 shadow-[0_4px_20px_rgba(180,83,9,0.45)]">
                  <Plus className="h-4 w-4" />
                  Nuevo préstamo
                </button>
                <button onClick={() => dispatch({ type: "SET_TAB", payload: "profile" })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-100">
                  <Wallet className="h-4 w-4" />
                  Capital inicial
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Ganancia mensual" Icon={TrendingUp} tone="success"
            value={<AnimatedMoney value={derived.monthlyInterestsCollected + derived.fixedIncomeThisMonth} hide={hide} currency={cur} />}
            hint={derived.fixedIncomeThisMonth > 0 ? "Intereses cobrados + sueldo de este mes" : "Intereses cobrados este mes"} />
          <StatCard label="Ganancia por cobrar" Icon={Briefcase} tone="success"
            value={<AnimatedMoney value={derived.nextProfitTotal} hide={hide} currency={cur} />}
            hint={`${derived.activeLoans.length + derived.overdueLoans.length} activo${derived.activeLoans.length + derived.overdueLoans.length === 1 ? "" : "s"}`} />
          <StatCard label="Préstamos activos" Icon={Activity}
            value={derived.activeLoans.length + derived.overdueLoans.length}
            hint={derived.overdueLoans.length > 0 ? `${derived.overdueLoans.length} atrasado${derived.overdueLoans.length > 1 ? "s" : ""}` : "Todo al día"}
            tone={derived.overdueLoans.length > 0 ? "danger" : undefined} />
          <StatCard label="Por cobrar" Icon={CalendarClock}
            value={<AnimatedMoney value={derived.expectedProfitTotal + derived.capitalInvested} hide={hide} currency={cur} />}
            hint={`Próximos: ${derived.upcomingDue.length}`} />
        </div>

        {/* Objetivo mensual */}
        {Number(state.settings.monthlyTarget) > 0 && (
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">Objetivo del mes</span>
              </div>
              <div className="text-xs tabular-nums text-zinc-400">
                <Money value={derived.collectedThisMonth} hide={hide} currency={cur} />
                {" / "}
                <Money value={state.settings.monthlyTarget} hide={hide} currency={cur} />
              </div>
            </div>
            {(() => {
              const pct = Math.min(1, derived.collectedThisMonth / state.settings.monthlyTarget);
              const reached = pct >= 1;
              return (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`fa-bar-shine h-full rounded-full transition-all duration-700 ${reached ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-amber-500"}`}
                      style={{ width: `${(pct * 100).toFixed(1)}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className={reached ? "text-emerald-400" : "text-zinc-500"}>
                      {reached ? "✓ Objetivo alcanzado" : `${(pct * 100).toFixed(0)}% completado`}
                    </span>
                    {!reached && (
                      <span className="tabular-nums text-zinc-500">
                        Faltan <Money value={state.settings.monthlyTarget - derived.collectedThisMonth} hide={hide} currency={cur} />
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
          </Card>
        )}

        {/* Agenda del día */}
        {derived.dueTodayTomorrow.length > 0 && (
          <div>
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                Cobros de hoy y mañana
              </span>
            </SectionTitle>
            <Card className="divide-y divide-zinc-800/70">
              {derived.dueTodayTomorrow.map((l) => (
                <div key={l.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-100">{l.clientName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        l._daysUntilDue === 0 ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {l._daysUntilDue === 0 ? "Hoy" : "Mañana"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {formatShortDate(l.dueDate)} · {formatInterest(l, state.settings.currency)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-zinc-100">
                        <Money value={l._remaining} hide={hide} currency={cur} />
                      </div>
                    </div>
                    <button onClick={() => setQuickPayLoan(l)}
                      className="flex items-center gap-1 rounded-xl border border-amber-700/50 bg-amber-900/20 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-900/40">
                      <Banknote className="h-3 w-3" />
                      Cobrar
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Saldo MP */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#009ee3]/10">
                <svg className="h-5 w-5" viewBox="0 0 48 48" fill="none">
                  <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4z" fill="#009ee3"/>
                  <path d="M31.5 18h-8c-.83 0-1.5.67-1.5 1.5v9c0 .83.67 1.5 1.5 1.5h8c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5zm-1 9h-6v-7h6v7z" fill="white"/>
                  <path d="M16.5 18H14c-.83 0-1.5.67-1.5 1.5v9c0 .83.67 1.5 1.5 1.5h2.5c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5z" fill="white"/>
                </svg>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Saldo Mercado Pago</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
                  <Money value={state.settings.mpBalance || 0} hide={hide} currency={cur} />
                </div>
              </div>
            </div>
            <button onClick={() => dispatch({ type: "SET_TAB", payload: "profile" })}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-300">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </Card>

        <DolarBlue />

        {/* Charts */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Evolución del capital</div>
                <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                  <Money value={derived.totalCapital} hide={hide} currency={cur} />
                </div>
              </div>
              <Badge tone="bronze">Últimos {BUSINESS_RULES.CHART_HISTORY_MONTHS} meses</Badge>
            </div>
            <ChartContainer className="h-44 min-w-0">
              {({ width, height }) => (
                <BarChart width={width} height={height} data={derived.months} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap="26%">
                  <CartesianGrid stroke={CHART_COLORS.grid as string} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} />
                  {/* El capital puede ser negativo si los pasivos superan al patrimonio,
                      así que el piso del eje acompaña al mínimo en vez de recortar en 0. */}
                  <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
                  <Tooltip cursor={{ fill: CHART_COLORS.cursor as string }}
                    content={<ChartTooltip hide={hide} currency={cur} />} />
                  <Bar name="Capital" dataKey="capital" fill={CHART_COLORS.capitalStroke as string} radius={[4, 4, 0, 0]}>
                    <LabelList content={makeBarLabel({ hide })} />
                  </Bar>
                </BarChart>
              )}
            </ChartContainer>
          </Card>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Mes actual</div>
                <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                  <Money value={monthDelta} hide={hide} currency={cur} />
                </div>
              </div>
              <DeltaPill value={monthDelta} label={monthDelta >= 0 ? "Positivo" : "Negativo"} />
            </div>
            <ChartContainer className="h-44 min-w-0">
              {({ width, height }) => (
                <BarChart width={width} height={height} data={derived.months} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap="26%">
                  <CartesianGrid stroke={CHART_COLORS.grid as string} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip cursor={{ fill: CHART_COLORS.cursor as string }}
                    content={<ChartTooltip hide={hide} currency={cur} />} />
                  <Bar name="Ingresos" dataKey="monthGain" fill={CHART_COLORS.income as string} radius={[4, 4, 0, 0]}>
                    <LabelList content={makeBarLabel({ hide })} />
                  </Bar>
                  <Bar name="Gastos" dataKey="expense" fill={CHART_COLORS.expense as string} radius={[4, 4, 0, 0]}>
                    <LabelList content={makeBarLabel({ hide })} />
                  </Bar>
                </BarChart>
              )}
            </ChartContainer>
          </Card>
        </div>

        {/* Capital invertido */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Capital invertido</div>
              <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                <Money value={derived.capitalInvested} hide={hide} currency={cur} />
              </div>
            </div>
            <Badge tone="bronze">Últimos {BUSINESS_RULES.CHART_HISTORY_MONTHS} meses</Badge>
          </div>
          <ChartContainer className="h-44 min-w-0">
            {({ width, height }) => (
              <BarChart width={width} height={height} data={derived.months} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap="26%">
                <CartesianGrid stroke={CHART_COLORS.grid as string} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip cursor={{ fill: CHART_COLORS.cursor as string }}
                  content={<ChartTooltip hide={hide} currency={cur} />} />
                <Bar name="Invertido" dataKey="capitalInvested" fill={CHART_COLORS.capital as string} radius={[4, 4, 0, 0]}>
                  <LabelList content={makeBarLabel({ hide })} />
                </Bar>
              </BarChart>
            )}
          </ChartContainer>
        </Card>

        <VencimientosHeatmap />

        {/* Upcoming */}
        <div>
          <SectionTitle action={
            <div className="flex items-center gap-3">
              <button onClick={() => dispatch({ type: "SET_TAB", payload: "loans" })}
                className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300">Ver todos</button>
              <button onClick={() => setShowUpcoming((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-300">
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showUpcoming ? "" : "-rotate-180"}`} />
              </button>
            </div>
          }>
            Próximos vencimientos
          </SectionTitle>
          <div style={{ display: "grid", gridTemplateRows: showUpcoming ? "1fr" : "0fr", transition: "grid-template-rows 300ms ease", overflow: "hidden" }}>
            <div style={{ minHeight: 0 }}>
              {derived.upcomingDue.length === 0 ? (
                <EmptyState Icon={CheckCircle2} title="No hay vencimientos próximos" hint="Todos los préstamos están al día o sin fecha próxima." />
              ) : (
                <Card className="divide-y divide-zinc-800/70">
                  {derived.upcomingDue.map((l) => (
                    <button key={l.id}
                      onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id: l.id } } })}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/60">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          l._status === "overdue" ? "bg-rose-500/10 text-rose-400"
                            : l._daysUntilDue !== null && l._daysUntilDue <= UI_LIMITS.ALERT_DAYS_THRESHOLD ? "bg-amber-500/10 text-amber-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}>
                          <CalendarClock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-100">{l.clientName}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {/* "Vence hoy" va primero: un préstamo pasa a atrasado el mismo
                                día de su vencimiento, y decir "Atrasado 0d" confunde. */}
                            {l._daysUntilDue === 0
                              ? `Vence hoy · ${formatShortDate(l.dueDate)}`
                              : l._status === "overdue"
                              ? `Atrasado ${Math.abs(l._daysUntilDue ?? 0)}d · ${formatShortDate(l.dueDate)}`
                              : `En ${l._daysUntilDue}d · ${formatShortDate(l.dueDate)}`}
                          </div>
                          <div className="mt-0.5 text-[10px] text-zinc-600">↻ {formatShortDate(getNextRenewalDate(l))}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-semibold tabular-nums text-zinc-100">
                            <Money value={l._remaining} hide={hide} currency={cur} />
                          </div>
                          <div className="text-[11px] text-zinc-500 tabular-nums">{formatInterest(l, cur)}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-600" />
                      </div>
                    </button>
                  ))}
                </Card>
              )}
            </div>
          </div>
        </div>

      </div>

      {quickPayLoan && (
        <PaymentSheet open={!!quickPayLoan} onClose={() => setQuickPayLoan(null)} loan={quickPayLoan} />
      )}
    </>
  );
}
