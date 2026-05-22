import { useState, useMemo } from "react";
import {
  Plus, ArrowUp, ArrowDown, Trash2, Tag, PieChart as PieChartIcon,
  Target, TrendingUp, Banknote, RefreshCw, Clock, Layers,
} from "lucide-react";
import { formatShortDate } from "../lib/utils.js";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, ASSET_CATEGORIES } from "../lib/constants.js";
import { useApp } from "../store/index.js";
import {
  Card, SectionTitle, EmptyState, Money, Badge, ChartTooltip, Button,
} from "../components/ui.jsx";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

function TxRow({ tx, onDelete }) {
  const { state } = useApp();
  const isIncome = tx.type === "income";
  const cat = isIncome
    ? INCOME_CATEGORIES[tx.category] || INCOME_CATEGORIES.otros
    : EXPENSE_CATEGORIES[tx.category] || EXPENSE_CATEGORIES.otros;
  const Icon = cat.Icon || (isIncome ? ArrowUp : ArrowDown);

  return (
    <div className="group flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${cat.color}22`, color: cat.color }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">
            {tx.description || cat.label}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {cat.label} · {formatShortDate(tx.date)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`text-sm font-semibold tabular-nums ${isIncome ? "text-emerald-400" : "text-zinc-100"}`}>
          {isIncome ? "+" : "−"}
          <Money value={tx.amount} hide={state.settings.hideBalances} currency={state.settings.currency} />
        </div>
        <button onClick={() => onDelete(tx)}
          className="ml-1 hidden h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-all hover:bg-zinc-800 hover:text-rose-400 group-hover:flex">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AssetCard({ asset, onOpen }) {
  const { state } = useApp();
  const cat = ASSET_CATEGORIES[asset.category] || ASSET_CATEGORIES.other;
  return (
    <button
      onClick={() => onOpen(asset)}
      className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3.5 text-left transition-all hover:bg-zinc-900"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800/60"
        style={{ background: `${cat.color}18` }}>
        <cat.Icon className="h-5 w-5" style={{ color: cat.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-100">{asset.name}</div>
        {asset.description && (
          <div className="mt-0.5 truncate text-[11px] text-zinc-500">{asset.description}</div>
        )}
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums text-zinc-100">
          <Money value={asset.value} hide={state.settings.hideBalances} currency={state.settings.currency} />
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-500">{cat.label}</div>
      </div>
    </button>
  );
}

export default function FinanceScreen() {
  const { state, dispatch, derived } = useApp();
  const [sub, setSub] = useState("flow");
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const txAll = useMemo(() => {
    const merged = [
      ...state.income.map((t) => ({ ...t, type: "income" })),
      ...state.expenses.map((t) => ({ ...t, type: "expense" })),
    ];
    return merged.sort((a, b) =>
      a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1
    );
  }, [state.income, state.expenses]);

  const monthlyBalance = derived.months[derived.months.length - 1]?.income
    - derived.months[derived.months.length - 1]?.expense || 0;
  const cumulativeSaving = derived.months.reduce((a, m) => a + (m.income - m.expense), 0);

  const projCalc = useMemo(() => {
    const rate = derived.avgRate / 100;
    const days = Math.max(1, derived.avgDays || 30);
    const base = Math.max(0, derived.workingCapital);
    const cyclesPerYear = 365 / days;
    const tea = Math.pow(1 + rate, cyclesPerYear) - 1;
    const doublingYears = rate > 0
      ? (Math.log(2) / Math.log(1 + rate)) * (days / 365)
      : null;
    const gainPerCycle = base * rate;

    const n1 = 1;
    const nYear = Math.max(1, Math.round(cyclesPerYear));
    const n2yr = Math.max(2, Math.round(cyclesPerYear * 2));
    const n3yr = Math.max(3, Math.round(cyclesPerYear * 3));

    const cyclePoints = [n1, nYear, n2yr, n3yr].map((n) => {
      const total = base * Math.pow(1 + rate, n);
      const approxYears = (n * days) / 365;
      return {
        n,
        label: n === 1 ? "1 ciclo" : `${n} ciclos`,
        sublabel: n === 1
          ? `~${Math.round(days)} días`
          : approxYears < 1.5
          ? `~${Math.round(approxYears * 12)} meses`
          : `~${approxYears.toFixed(1)} años`,
        total,
        profit: total - base,
        pct: (Math.pow(1 + rate, n) - 1) * 100,
      };
    });

    const profitSeries = Array.from({ length: 25 }, (_, i) => {
      const cycles = (i * 30) / days;
      const total = base * Math.pow(1 + rate, cycles);
      return {
        mes: i,
        label: i % 6 === 0 ? (i === 0 ? "Hoy" : `${i}m`) : "",
        ganancia: Math.round(total - base),
        total: Math.round(total),
      };
    });

    return { rate, days, base, cyclesPerYear, tea, doublingYears, gainPerCycle, cyclePoints, profitSeries };
  }, [derived.avgRate, derived.avgDays, derived.totalCapital]);

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Finanzas</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Flujo personal, categorías y proyecciones</p>
        </div>
        <button
          onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "tx-form" } })}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-2 text-sm font-medium text-amber-50 shadow-[0_4px_20px_rgba(180,83,9,0.45)]"
        >
          <Plus className="h-4 w-4" />
          Movimiento
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-1">
        {[
          { v: "flow", l: "Movimientos" },
          { v: "categories", l: "Categorías" },
          { v: "projection", l: "Proyección" },
          { v: "assets", l: "Activos" },
        ].map((s) => {
          const active = sub === s.v;
          return (
            <button key={s.v} onClick={() => setSub(s.v)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                active ? "bg-zinc-800/80 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s.l}
            </button>
          );
        })}
      </div>

      {sub === "flow" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ingresos</div>
              <div className="mt-1 text-lg font-semibold text-emerald-400 tabular-nums">
                <Money value={derived.totalIncome} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Gastos</div>
              <div className="mt-1 text-lg font-semibold text-rose-400 tabular-nums">
                <Money value={derived.totalExpense} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Balance</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${
                derived.totalIncome - derived.totalExpense >= 0 ? "text-zinc-100" : "text-rose-400"
              }`}>
                <Money value={derived.totalIncome - derived.totalExpense} hide={hide} currency={cur} />
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Flujo mensual</div>
              <Badge tone="neutral">Últimos 6 meses</Badge>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "#27272a55" }} content={<ChartTooltip hide={hide} currency={cur} />} />
                  <Bar name="Ingresos" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Gastos" dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div>
            <SectionTitle>Movimientos</SectionTitle>
            {txAll.length === 0 ? (
              <EmptyState Icon={ArrowUp} title="Aún no cargaste movimientos"
                hint="Registrá ingresos y gastos personales para visualizar tu flujo de caja real."
                action={
                  <button
                    onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "tx-form" } })}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-2 text-sm font-medium text-amber-50"
                  >
                    <Plus className="h-4 w-4" />
                    Cargar movimiento
                  </button>
                }
              />
            ) : (
              <Card className="divide-y divide-zinc-800/70">
                {txAll.slice(0, 40).map((tx) => (
                  <TxRow key={tx.id} tx={tx}
                    onDelete={(t) => dispatch({ type: "DELETE_TX", payload: { id: t.id, type: t.type } })} />
                ))}
              </Card>
            )}
          </div>
        </>
      )}

      {sub === "categories" && (
        <>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Gastos por categoría</div>
              <Badge tone="neutral">
                <PieChartIcon className="h-3 w-3" />
                {hide ? "••••••" : `${cur}${derived.totalExpense.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
              </Badge>
            </div>
            {derived.expenseByCategory.length === 0 ? (
              <EmptyState Icon={PieChartIcon} title="Sin gastos cargados"
                hint="Cuando registres gastos vas a ver la distribución por categoría acá." />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-5">
                <div className="sm:col-span-2 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={derived.expenseByCategory} dataKey="value" nameKey="label"
                        innerRadius="60%" outerRadius="92%" paddingAngle={2} stroke="none">
                        {derived.expenseByCategory.map((c) => <Cell key={c.key} fill={c.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip hide={hide} currency={cur} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="sm:col-span-3 space-y-2">
                  {derived.expenseByCategory.sort((a, b) => b.value - a.value).map((c) => {
                    const pct = derived.totalExpense ? (c.value / derived.totalExpense) * 100 : 0;
                    const Icon = EXPENSE_CATEGORIES[c.key]?.Icon || Tag;
                    return (
                      <div key={c.key}
                        className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{ background: `${c.color}22`, color: c.color }}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-200">{c.label}</span>
                            <span className="text-sm font-medium tabular-nums text-zinc-100">
                              <Money value={c.value} hide={hide} currency={cur} />
                            </span>
                          </div>
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                          </div>
                        </div>
                        <span className="w-12 text-right text-[11px] tabular-nums text-zinc-500">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Balance mes</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${
                monthlyBalance >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}>
                <Money value={monthlyBalance} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ahorro acumulado</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                <Money value={cumulativeSaving} hide={hide} currency={cur} />
              </div>
            </Card>
          </div>
        </>
      )}

      {sub === "assets" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total activos</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                <Money value={derived.totalAssets} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Patrimonio total</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-amber-400">
                <Money value={derived.totalCapital} hide={hide} currency={cur} />
              </div>
            </Card>
          </div>

          {state.assets.length === 0 ? (
            <EmptyState Icon={Layers} title="Sin activos registrados"
              hint="Cargá bienes como un auto, propiedad o inversión para ver tu patrimonio real."
              action={
                <Button variant="bronze" Icon={Plus}
                  onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "asset-form" } })}>
                  Agregar activo
                </Button>
              }
            />
          ) : (
            <div>
              <SectionTitle action={
                <Button variant="bronze" size="sm" Icon={Plus}
                  onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "asset-form" } })}>
                  Nuevo
                </Button>
              }>
                Mis activos
              </SectionTitle>
              <div className="space-y-2">
                {state.assets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset}
                    onOpen={(a) => dispatch({ type: "OPEN_MODAL", payload: { type: "asset-form", payload: { editingAsset: a } } })} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {sub === "projection" && (
        <>
          {/* Tasa efectiva anual + métricas clave */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Tasa efectiva anual</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-amber-400">
                {(projCalc.tea * 100).toFixed(1)}%
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">
                {derived.avgRate.toFixed(1)}% × {projCalc.cyclesPerYear.toFixed(1)} ciclos
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <Banknote className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ganancia por ciclo</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">
                <Money value={projCalc.gainPerCycle} hide={hide} currency={cur} />
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">
                cada ~{Math.round(projCalc.days)} días
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800/70">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Duplicación</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
                {projCalc.doublingYears != null ? `${projCalc.doublingYears.toFixed(1)} años` : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">
                reinvirtiendo todo
              </div>
            </Card>
          </div>

          {/* Proyecciones por ciclo */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500/80">
              <Target className="h-3 w-3" />
              Proyección por ciclos de préstamo
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {projCalc.cyclePoints.map((p) => (
                <div key={p.n}
                  className="rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-3">
                  <div className="text-[11px] font-medium text-zinc-300">{p.label}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-600">{p.sublabel}</div>
                  <div className="mt-2 text-base font-semibold tabular-nums text-zinc-100">
                    <Money value={p.total} hide={hide} currency={cur} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11px] font-medium tabular-nums text-emerald-400">
                      +<Money value={p.profit} hide={hide} currency={cur} />
                    </span>
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500 tabular-nums">
                      +{p.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Gráfico: ganancia acumulada (arranca en 0) */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Ganancia acumulada proyectada
                </div>
                <div className="mt-0.5 text-xs text-zinc-600">24 meses · reinversión continua</div>
              </div>
              <Badge tone="bronze">
                <RefreshCw className="h-3 w-3" />
                Interés compuesto
              </Badge>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projCalc.profitSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gainFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d97706" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false}
                    tick={{ fill: "#71717a", fontSize: 11 }} interval={0} />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip
                    cursor={{ stroke: "#3f3f46", strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
                          <div className="mb-1 text-zinc-400">Mes {d.mes}</div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            <span className="text-zinc-400">Ganancia:</span>
                            <span className="font-medium text-zinc-100 tabular-nums">
                              {hide ? "••••••" : `${cur}${d.ganancia.toLocaleString("es-AR")}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-zinc-600" />
                            <span className="text-zinc-400">Capital:</span>
                            <span className="font-medium text-zinc-100 tabular-nums">
                              {hide ? "••••••" : `${cur}${d.total.toLocaleString("es-AR")}`}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" name="Ganancia" dataKey="ganancia"
                    stroke="#f59e0b" strokeWidth={2.5} fill="url(#gainFill)"
                    dot={{ r: 0 }}
                    activeDot={{ r: 4, fill: "#f59e0b", stroke: "#0a0a0b", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-[11px] text-zinc-600">
              Estimación informativa basada en tasa y plazo promedio de préstamos activos.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
