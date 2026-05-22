import { useState, useEffect, useMemo } from "react";
import {
  Eye, EyeOff, Bell, Plus, Wallet, Sparkles, Target, TrendingUp,
  Briefcase, Activity, CalendarClock, ArrowDown, ChevronRight, ChevronDown, CheckCircle2, Search,
} from "lucide-react";
import { formatShortDate, daysBetween, addDays, todayISO } from "../lib/utils.js";
import { useApp } from "../store/index.js";
import {
  Card, SectionTitle, EmptyState, Money, StatCard, ChartTooltip,
  DeltaPill, Badge, IconButton, ChartContainer,
} from "../components/ui.jsx";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

export default function HomeScreen() {
  const { state, dispatch, derived, setSearchOpen } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const [now, setNow] = useState(() => new Date());
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const greet = useMemo(() => {
    const h = now.getHours();
    if (h < 6) return "Buenas noches";
    if (h < 13) return "Buen día";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }, [now]);

  const dateLabel = now.toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const userName = state.settings.userName?.trim();
  const hasAnyData = state.loans.length > 0 || state.clients.length > 0
    || state.expenses.length > 0 || state.income.length > 0;

  const allocationPct = derived.workingCapital > 0
    ? derived.capitalInvested / derived.workingCapital : 0;

  const monthIncome = derived.months[derived.months.length - 1]?.income
    + derived.months[derived.months.length - 1]?.profit || 0;
  const monthExpense = derived.months[derived.months.length - 1]?.expense || 0;
  const monthDelta = monthIncome - monthExpense;

  return (
    <div className="space-y-6 pb-2">
      <div className="flex items-center justify-between pt-1">
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
        <div className="flex items-center gap-2">
          <IconButton Icon={Search} onClick={() => setSearchOpen?.(true)} />
          <IconButton Icon={hide ? EyeOff : Eye}
            onClick={() => dispatch({ type: "UPDATE_SETTINGS", payload: { hideBalances: !hide } })} />
          <button
            onClick={() => dispatch({ type: "SET_TAB", payload: "loans" })}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-900/70 text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
          >
            <Bell className="h-4 w-4" />
            {derived.overdueLoans.length + derived.upcomingDue.filter(
              (l) => l._daysUntilDue !== null && l._daysUntilDue <= 3 && l._daysUntilDue >= 0
            ).length > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-3xl border border-amber-800/25 bg-gradient-to-br from-zinc-900/95 via-[#0d0a06]/95 to-amber-950/40 p-6 shadow-[0_0_60px_rgba(120,53,15,0.18)] backdrop-blur-sm${state.settings.theme !== "light" ? " glow-card" : ""}`}>
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-700/12 blur-[60px]" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-amber-900/18 blur-[50px]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(245,158,11,0.02)_0%,transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-500/80">
            <Sparkles className="h-3 w-3" />
            Capital total
          </div>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-white">
            <Money value={derived.totalCapital} hide={hide} currency={cur} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Invertido{" "}
              <Money value={derived.capitalInvested} hide={hide} currency={cur} className="text-zinc-200" />
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              Disponible{" "}
              <Money value={derived.available} hide={hide} currency={cur} className="text-zinc-200" />
            </span>
            {derived.totalAssets > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Activos{" "}
                <Money value={derived.totalAssets} hide={hide} currency={cur} className="text-zinc-200" />
              </span>
            )}
          </div>
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-amber-700 to-amber-500 transition-all duration-700"
                style={{ width: `${Math.max(0, Math.min(100, allocationPct * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
              <span>{Math.round(allocationPct * 100)}% asignado</span>
              <span className="flex items-center gap-1.5">
                Próx. 30d{" "}
                <span className="text-zinc-300 tabular-nums">
                  <Money value={derived.expectedInflow30d} hide={hide} currency={cur} />
                </span>
                {derived.monthlyReturnPct > 0 && (
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 tabular-nums">
                    +{derived.monthlyReturnPct.toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

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
              Cargá el capital con el que arrancás y registrá la primera operación. Todo se calcula y proyecta automáticamente.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-2 text-sm font-medium text-amber-50 shadow-[0_4px_20px_rgba(180,83,9,0.45)]"
              >
                <Plus className="h-4 w-4" />
                Nuevo préstamo
              </button>
              <button
                onClick={() => dispatch({ type: "SET_TAB", payload: "profile" })}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-100"
              >
                <Wallet className="h-4 w-4" />
                Capital inicial
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Ganancia mensual" Icon={TrendingUp} tone="success"
          value={<Money value={derived.monthlyInterestsCollected} hide={hide} currency={cur} />}
          hint="Intereses cobrados este mes" />
        <StatCard label="Ganancia por cobrar" Icon={Briefcase} tone="success"
          value={<Money value={derived.expectedProfitTotal} hide={hide} currency={cur} />}
          hint={`${derived.activeLoans.length + derived.overdueLoans.length} activo${derived.activeLoans.length + derived.overdueLoans.length === 1 ? "" : "s"}`} />
        <StatCard label="Préstamos activos" Icon={Activity}
          value={derived.activeLoans.length + derived.overdueLoans.length}
          hint={derived.overdueLoans.length > 0
            ? `${derived.overdueLoans.length} atrasado${derived.overdueLoans.length > 1 ? "s" : ""}`
            : "Todo al día"}
          tone={derived.overdueLoans.length > 0 ? "danger" : undefined} />
        <StatCard label="Por cobrar" Icon={CalendarClock}
          value={<Money value={derived.expectedProfitTotal + derived.capitalInvested} hide={hide} currency={cur} />}
          hint={`Próximos: ${derived.upcomingDue.length}`} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Evolución del capital</div>
              <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                <Money value={derived.totalCapital} hide={hide} currency={cur} />
              </div>
            </div>
            <Badge tone="bronze">Últimos 6 meses</Badge>
          </div>
          <ChartContainer className="h-44 min-w-0">
            {({ width, height }) => (
              <AreaChart width={width} height={height} data={derived.months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="capitalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b45309" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#b45309" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis hide />
                <Tooltip cursor={{ stroke: "#3f3f46", strokeDasharray: "3 3" }}
                  content={<ChartTooltip hide={hide} currency={cur} />} />
                <Area type="monotone" name="Capital" dataKey="capital"
                  stroke="#f59e0b" strokeWidth={2} fill="url(#capitalFill)" />
              </AreaChart>
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
              <BarChart width={width} height={height} data={derived.months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "#27272a55" }}
                  content={<ChartTooltip hide={hide} currency={cur} />} />
                <Bar name="Ingresos" dataKey={(d) => d.income + d.profit} fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar name="Gastos" dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ChartContainer>
        </Card>
      </div>

      <div>
        <SectionTitle action={
          <div className="flex items-center gap-3">
            <button onClick={() => dispatch({ type: "SET_TAB", payload: "loans" })}
              className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
              Ver todos
            </button>
            <button
              onClick={() => setShowUpcoming((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-300"
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showUpcoming ? "" : "-rotate-180"}`} />
            </button>
          </div>
        }>
          Próximos vencimientos
        </SectionTitle>
        <div style={{ display: "grid", gridTemplateRows: showUpcoming ? "1fr" : "0fr", transition: "grid-template-rows 300ms ease", overflow: "hidden" }}>
          <div style={{ minHeight: 0 }}>
            {derived.upcomingDue.length === 0 ? (
              <EmptyState Icon={CheckCircle2} title="No hay vencimientos próximos"
                hint="Todos los préstamos están al día o sin fecha próxima." />
            ) : (
              <Card className="divide-y divide-zinc-800/70">
                {derived.upcomingDue.map((l) => (
                  <button key={l.id}
                    onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id: l.id } } })}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        l._status === "overdue" ? "bg-rose-500/10 text-rose-400"
                          : l._daysUntilDue !== null && l._daysUntilDue <= 3 ? "bg-amber-500/10 text-amber-400"
                          : "bg-zinc-800 text-zinc-400"
                      }`}>
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-100">{l.clientName}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {l._status === "overdue"
                            ? `Atrasado ${Math.abs(l._daysUntilDue)}d · ${formatShortDate(l.dueDate)}`
                            : l._daysUntilDue === 0
                            ? `Vence hoy · ${formatShortDate(l.dueDate)}`
                            : `En ${l._daysUntilDue}d · ${formatShortDate(l.dueDate)}`}
                        </div>
                        <div className="mt-0.5 text-[10px] text-zinc-600">
                          {(() => {
                            const term = Math.max(1, daysBetween(l.startDate, l.dueDate) || 30);
                            let nextDate;
                            if (l._status === "overdue") {
                              const overdueDays = Math.max(0, daysBetween(l.dueDate, todayISO()));
                              const periods = Math.floor(overdueDays / term);
                              nextDate = addDays(l.dueDate, (periods + 1) * term);
                            } else {
                              nextDate = addDays(l.dueDate, term);
                            }
                            return `↻ ${formatShortDate(nextDate)}`;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-zinc-100">
                          <Money value={l._remaining} hide={hide} currency={cur} />
                        </div>
                        <div className="text-[11px] text-zinc-500 tabular-nums">
                          {Number(l.interestRate).toFixed(1)}%
                        </div>
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

      {state.history.length > 0 && (
        <div>
          <SectionTitle action={
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-300"
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showHistory ? "" : "-rotate-180"}`} />
            </button>
          }>
            Actividad reciente
          </SectionTitle>
          <div style={{ display: "grid", gridTemplateRows: showHistory ? "1fr" : "0fr", transition: "grid-template-rows 300ms ease", overflow: "hidden" }}>
            <div style={{ minHeight: 0 }}>
              <Card className="divide-y divide-zinc-800/70">
                {state.history.slice(0, 5).map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/70">
                        {h.kind === "loan_created"
                          ? <Plus className="h-4 w-4 text-zinc-400" />
                          : <ArrowDown className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm text-zinc-200">{h.label}</div>
                        <div className="text-[11px] text-zinc-500">{h.date}</div>
                      </div>
                    </div>
                    <div className="text-sm font-medium tabular-nums text-zinc-100">
                      <Money value={h.amount} hide={hide} currency={cur} />
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
