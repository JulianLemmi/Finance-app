import { useState, useMemo } from "react";
import {
  Plus, ArrowUp, ArrowDown, Trash2, Tag, PieChart as PieChartIcon, Target,
} from "lucide-react";
import { formatShortDate } from "../lib/utils.js";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants.js";
import { useApp } from "../store/index.js";
import {
  Card, SectionTitle, EmptyState, Money, Badge, ChartTooltip,
} from "../components/ui.jsx";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-1">
        {[
          { v: "flow", l: "Movimientos" },
          { v: "categories", l: "Categorías" },
          { v: "projection", l: "Proyección" },
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

      {sub === "projection" && (
        <>
          <Card className="overflow-hidden p-5">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500/80">
              <Target className="h-3 w-3" />
              Proyección
            </div>
            <div className="text-sm text-zinc-300">
              Asumiendo interés promedio de{" "}
              <span className="font-medium text-zinc-100 tabular-nums">{derived.avgRate.toFixed(1)}%</span>{" "}
              y plazo de{" "}
              <span className="font-medium text-zinc-100 tabular-nums">{Math.round(derived.avgDays)} días</span>.
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: "1 mes", v: derived.projections.m1 },
                { l: "3 meses", v: derived.projections.m3 },
                { l: "6 meses", v: derived.projections.m6 },
                { l: "1 año", v: derived.projections.y1 },
              ].map((p) => (
                <div key={p.l} className="rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">{p.l}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    <Money value={p.v} hide={hide} currency={cur} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-400 tabular-nums">
                    +<Money value={p.v - derived.totalCapital} hide={hide} currency={cur} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Crecimiento estimado · 12 meses
              </div>
              <Badge tone="bronze">Reinversión continua</Badge>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={derived.projectionSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="projLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#b45309" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip hide={hide} currency={cur} />} />
                  <Line type="monotone" name="Capital proyectado" dataKey="value"
                    stroke="url(#projLine)" strokeWidth={2.5} dot={{ r: 0 }}
                    activeDot={{ r: 4, fill: "#f59e0b", stroke: "#0a0a0b", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-[11px] text-zinc-500">
              Estimación informativa, no garantiza rendimiento real. Se recalcula según tus operaciones activas.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
