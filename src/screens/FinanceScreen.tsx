// Pantalla de finanzas personales con 5 sub-vistas: Proyección, Activos, Pasivos,
// Movimientos y Categorías. Incluye gráficos de Recharts y cálculo de proyección compuesta.
import { useState, useMemo } from "react";
import {
  Plus, ArrowUp, ArrowDown, Trash2, Tag, PieChart as PieChartIcon,
  Target, TrendingUp, Banknote, RefreshCw, Clock, Layers, HandCoins,
  CalendarRange, HelpCircle, X,
} from "lucide-react";
import { formatShortDate } from "../lib/utils.js";
import { useLongPress } from "../lib/hooks.js";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, ASSET_CATEGORIES, CHART_COLORS, BUSINESS_RULES } from "../lib/constants.js";
import { calcProjection, projectHorizon, interestAccruals } from "../lib/calcs.js";
import { useApp } from "../store/index.js";
import {
  Card, SectionTitle, EmptyState, Money, AnimatedMoney, Badge, ChartTooltip, Button, ChartContainer, makeBarLabel,
} from "../components/ui.jsx";
import PortfolioAnalytics from "../components/PortfolioAnalytics.jsx";
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";
import type { Transaction, Asset, Liability } from "../types";

interface TooltipPayload {
  payload: { label: string; roi: number };
}

function RoiTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <div className="mb-1 font-medium text-zinc-200">{d.label}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.gainStroke as string }} />
        <span className="text-zinc-300">ROI mensual:</span>
        <span className="font-medium text-zinc-100 tabular-nums">{d.roi.toFixed(2)}%</span>
      </div>
    </div>
  );
}

interface ProjectionPoint { mes: number; ganancia: number; total: number; }

function ProjectionTooltip({ active, payload, hide, currency = "$" }: {
  active?: boolean; payload?: Array<{ payload: ProjectionPoint }>; hide?: boolean; currency?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <div className="mb-1 text-zinc-400">Mes {d.mes}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS.gainStroke as string }} />
        <span className="text-zinc-400">Ganancia:</span>
        <span className="font-medium text-zinc-100 tabular-nums">
          {hide ? "••••••" : `${currency}${d.ganancia.toLocaleString("es-AR")}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-zinc-600" />
        <span className="text-zinc-400">Capital:</span>
        <span className="font-medium text-zinc-100 tabular-nums">
          {hide ? "••••••" : `${currency}${d.total.toLocaleString("es-AR")}`}
        </span>
      </div>
    </div>
  );
}

interface TxRowProps {
  tx: Transaction;
  onDelete: (tx: Transaction) => void;
}

function TxRow({ tx, onDelete }: TxRowProps) {
  const { state } = useApp();
  const isIncome = tx.type === "income";
  const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const cat = (cats as Record<string, { label: string; color: string; Icon?: React.ComponentType<{ className?: string }> }>)[tx.category]
    || (isIncome ? INCOME_CATEGORIES.otros : EXPENSE_CATEGORIES.otros) as { label: string; color: string; Icon?: React.ComponentType<{ className?: string }> };
  const Icon = cat.Icon || (isIncome ? ArrowUp : ArrowDown);

  return (
    <div className="group flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${cat.color}22`, color: cat.color }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">{tx.description || cat.label}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{cat.label} · {formatShortDate(tx.date)}</div>
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

interface AssetCardProps {
  asset: Asset;
  onOpen: (a: Asset) => void;
}

function AssetCard({ asset, onOpen }: AssetCardProps) {
  const { state } = useApp();
  const cat = (ASSET_CATEGORIES as Record<string, { label: string; color: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }>)[asset.category] || ASSET_CATEGORIES.other;
  return (
    <button onClick={() => onOpen(asset)}
      className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700/70 hover:bg-zinc-900 active:scale-[0.99]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800/60"
        style={{ background: `${cat.color}18` }}>
        <cat.Icon className="h-5 w-5" style={{ color: cat.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-100">{asset.name}</div>
        {asset.installments?.length ? (
          <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            {asset.installments.length}{asset.totalCuotas ? `/${asset.totalCuotas}` : ""} cuotas
          </div>
        ) : asset.description ? (
          <div className="mt-0.5 truncate text-[11px] text-zinc-500">{asset.description}</div>
        ) : null}
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

interface LiabilityCardProps {
  liability: Liability;
  onOpen: (l: Liability) => void;
}

function LiabilityCard({ liability, onOpen }: LiabilityCardProps) {
  const { state } = useApp();
  const paid = (liability.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const owed = Math.max(0, Number(liability.amount) - paid);
  return (
    <button onClick={() => onOpen(liability)}
      className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700/70 hover:bg-zinc-900 active:scale-[0.99]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800/60 bg-rose-500/10">
        <HandCoins className="h-5 w-5 text-rose-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-100">{liability.name}</div>
        {paid > 0 ? (
          <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            Pagado {state.settings.currency}{paid.toLocaleString("es-AR")}
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-zinc-500">Desde {formatShortDate(liability.startDate)}</div>
        )}
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums text-rose-400">
          <Money value={owed} hide={state.settings.hideBalances} currency={state.settings.currency} />
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-500">adeudado</div>
      </div>
    </button>
  );
}

/** Ciclos legibles: entero si es exacto, con un decimal si la ventana los parte. */
const fmtCycles = (n: number) =>
  (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", ",");

interface ProjectionBoxProps {
  title: string;
  subtitle: string;
  total: number;
  profit: number;
  pct: number;
  highlight?: boolean;
  onExplain: () => void;
}

// Cuadro de proyección. Mantenerlo apretado 2s abre la explicación del cálculo (mismo
// gesto que archivar en Préstamos, ver useLongPress).
function ProjectionBox({ title, subtitle, total, profit, pct, highlight, onExplain }: ProjectionBoxProps) {
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const { pressing, progressMs, handlers } = useLongPress(() => {
    navigator.vibrate?.(15);
    onExplain();
  });

  return (
    <button {...handlers}
      className={`relative w-full select-none overflow-hidden rounded-xl border p-3 text-left transition-colors ${
        highlight
          ? "border-amber-800/50 bg-amber-950/20 hover:border-amber-700/60"
          : "border-zinc-800/70 bg-zinc-950/60 hover:border-zinc-700/70"
      }`}>
      {pressing && (
        // pointer-events-none: si el overlay captura el puntero, dispara pointerleave en
        // el botón y cancela el propio long-press.
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-1.5 overflow-hidden bg-zinc-950/90 text-amber-200">
          <span className="fa-longpress-fill absolute inset-0 bg-amber-900/40"
            style={{ animationDuration: `${progressMs}ms` }} />
          <HelpCircle className="relative h-3.5 w-3.5" />
          <span className="relative text-[11px] font-medium">Explicando...</span>
        </div>
      )}
      <div className="text-[11px] font-medium text-zinc-300">{title}</div>
      <div className="mt-0.5 text-[10px] text-zinc-600">{subtitle}</div>
      <div className="mt-2 text-base font-semibold tabular-nums text-zinc-100">
        <Money value={total} hide={hide} currency={cur} />
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[11px] font-medium tabular-nums text-emerald-400">
          +<Money value={profit} hide={hide} currency={cur} />
        </span>
        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500 tabular-nums">
          +{pct.toFixed(1)}%
        </span>
      </div>
    </button>
  );
}

interface ExplainData {
  title: string;
  cycles: number;
  total: number;
  profit: number;
  pct: number;
}

// Desglose paso a paso de cómo se llega al número proyectado. La idea es que se entienda
// sin saber de interés compuesto: de dónde sale el punto de partida, qué se repite cada
// ciclo, cuántas veces, y qué supone el cálculo.
function ProjectionExplainer({ data, base, rate, cycleDays, onClose }: {
  data: ExplainData; base: number; rate: number; cycleDays: number; onClose: () => void;
}) {
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const factor = (1 + rate).toFixed(3).replace(".", ",");

  const pasos = [
    {
      n: 1,
      titulo: "De cuánto partís",
      valor: <Money value={base} hide={hide} currency={cur} />,
      texto: "Es la deuda que hoy tenés en la calle, sumando préstamos activos y atrasados. En los compartidos entra sólo tu parte.",
    },
    {
      n: 2,
      titulo: "Cuánto rinde cada ciclo",
      valor: `${(rate * 100).toFixed(1)}% cada ~${Math.round(cycleDays)} días`,
      texto: "Es la tasa promedio de esos mismos préstamos. Un ciclo es el plazo típico de tu cartera.",
    },
    {
      n: 3,
      titulo: "Cuántas veces se repite",
      valor: `${fmtCycles(data.cycles)} ciclo${data.cycles === 1 ? "" : "s"}`,
      texto: "Cada vez que cobrás, volvés a prestar el capital junto con el interés. Por eso el interés del ciclo siguiente se calcula sobre un monto más grande.",
    },
    {
      n: 4,
      titulo: "La cuenta",
      valor: (
        <span className="tabular-nums">
          <Money value={base} hide={hide} currency={cur} /> × {factor}
          <sup>{fmtCycles(data.cycles)}</sup> = <Money value={data.total} hide={hide} currency={cur} />
        </span>
      ),
      texto: `El capital se multiplica por ${factor} en cada uno de los ${fmtCycles(data.cycles)} ciclos.`,
    },
    {
      n: 5,
      titulo: "La ganancia",
      valor: (
        <span className="text-emerald-400">
          +<Money value={data.profit} hide={hide} currency={cur} /> ({data.pct.toFixed(1)}%)
        </span>
      ),
      texto: "Es lo proyectado menos el capital del que partiste.",
    },
  ];

  return (
    <div className="fa-rise mt-4 rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-400/90">
            <HelpCircle className="h-3 w-3" />
            Cómo se llega a {data.title}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
            <Money value={data.total} hide={hide} currency={cur} />
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar explicación"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ol className="space-y-2.5">
        {pasos.map((p) => (
          <li key={p.n} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-900/40 text-[10px] font-semibold text-amber-300">
              {p.n}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">{p.titulo}</div>
              <div className="mt-0.5 text-sm font-medium text-zinc-100">{p.valor}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{p.texto}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-400">Ojo:</span> es un escenario ideal, no una
        previsión. Supone que cobrás todo en fecha, que volvés a prestar el 100% cada vez y
        que la tasa se mantiene. Si un cliente no paga o dejás plata quieta, el número real
        va a ser menor.
      </div>
    </div>
  );
}

type SubView = "projection" | "assets" | "liabilities" | "flow" | "categories";

export default function FinanceScreen() {
  const { state, dispatch, derived } = useApp();
  const [sub, setSub] = useState<SubView>("projection");
  const [projMonths, setProjMonths] = useState(6);
  const [explain, setExplain] = useState<ExplainData | null>(null);
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const txAll = useMemo<Transaction[]>(() => {
    const merged: Transaction[] = [
      ...state.income,
      ...state.expenses,
    ];
    return merged.sort((a, b) =>
      a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1
    );
  }, [state.income, state.expenses]);

  const monthlyBalance = (derived.months[derived.months.length - 1]?.income ?? 0)
    - (derived.months[derived.months.length - 1]?.expense ?? 0);
  const cumulativeSaving = derived.months.reduce((a, m) => a + (m.income - m.expense), 0);

  // Interés ya devengado por vencimientos/re-vencimientos en toda la cartera, a la fecha.
  // Es lo que se le fue acumulando a las deudas y ya forma parte del capital.
  const accruedToDate = useMemo(
    () => derived.loansResolved.reduce(
      (a, l) => a + interestAccruals(l).reduce((s, ev) => s + ev.amount, 0),
      0
    ),
    [derived.loansResolved]
  );

  const projCalc = useMemo(
    () => calcProjection({
      activeLoans: derived.activeLoans,
      overdueLoans: derived.overdueLoans,
      workingCapital: derived.workingCapital,
      avgRate: derived.avgRate,
      accumulatedProfit: accruedToDate,
      // Plazo mediano (no promedio): un solo préstamo a 365 días no debe distorsionar
      // el ciclo con el que se calculan la tasa efectiva anual y la duplicación.
      cycleDays: derived.medianDays,
    }),
    [derived.activeLoans, derived.overdueLoans, derived.workingCapital, derived.avgRate, derived.medianDays, accruedToDate]
  );

  // Proyección al plazo elegido con el selector de meses. Misma fórmula que los 4 cuadros
  // fijos, sólo que el horizonte lo pone el usuario.
  const horizonPoint = useMemo(
    () => projectHorizon(projCalc.base, projCalc.rate, projCalc.days, projMonths),
    [projCalc.base, projCalc.rate, projCalc.days, projMonths]
  );

  const SUB_VIEWS: { v: SubView; l: string }[] = [
    { v: "projection", l: "Proyección" },
    { v: "assets", l: "Activos" },
    { v: "liabilities", l: "Pasivos" },
    { v: "flow", l: "Movimientos" },
    { v: "categories", l: "Categorías" },
  ];

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Finanzas</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Flujo personal, categorías y proyecciones</p>
        </div>
        <Button variant="bronze" Icon={Plus}
          onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "tx-form" } })}>
          Movimiento
        </Button>
      </div>

      <div className="relative grid grid-cols-5 gap-1 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-1">
        {/* Indicador deslizante de la sub-vista activa */}
        <span
          aria-hidden
          className="absolute bottom-1 top-1 rounded-xl bg-zinc-800/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.3)]"
          style={{
            // p-1 (0.25rem) de padding + 4 gaps de 0.25rem entre las 5 columnas
            left: `calc(0.25rem + ${SUB_VIEWS.findIndex((s) => s.v === sub)} * ((100% - 1.5rem) / 5 + 0.25rem))`,
            width: "calc((100% - 1.5rem) / 5)",
            transition: "left 340ms cubic-bezier(.3,1.3,.4,1)",
          }}
        />
        {SUB_VIEWS.map((s) => (
          <button key={s.v} onClick={() => setSub(s.v)}
            // text-[10px] en mobile: con 5 pestañas y 12px, "Movimientos" y "Categorías"
            // se tocaban en pantallas de 390px.
            className={`relative z-10 truncate rounded-xl px-0.5 py-2 text-[10px] font-medium transition-colors duration-200 sm:px-3 sm:text-xs ${
              sub === s.v ? "text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}>
            {s.l}
          </button>
        ))}
      </div>

      {sub === "projection" && (
        <div className="fa-rise space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10"><TrendingUp className="h-3.5 w-3.5 text-amber-400" /></div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Tasa efectiva anual</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-amber-400">{(projCalc.tea * 100).toFixed(1)}%</div>
              <div className="mt-0.5 text-[10px] text-zinc-600">{(projCalc.rate * 100).toFixed(1)}% × {projCalc.cyclesPerYear.toFixed(1)} ciclos</div>
              <div className="mt-1 text-[10px] text-zinc-600">Mediana <span className="text-zinc-400 tabular-nums">{derived.medianRate.toFixed(1)}%</span></div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10"><Banknote className="h-3.5 w-3.5 text-emerald-400" /></div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ganancia por ciclo</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-400"><AnimatedMoney value={derived.nextProfitTotal} hide={hide} currency={cur} /></div>
              <div className="mt-0.5 text-[10px] text-zinc-600">cada ~{Math.round(projCalc.days)} días</div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800/70"><Clock className="h-3.5 w-3.5 text-zinc-400" /></div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Duplicación</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
                {projCalc.doublingYears != null ? `${projCalc.doublingYears.toFixed(1)} años` : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">reinvirtiendo todo</div>
            </Card>
          </div>
          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500/80">
              <Target className="h-3 w-3" />
              Proyección por ciclos de préstamo
            </div>
            <div className="mb-4 text-[11px] text-zinc-600">
              Mantené apretado un cuadro para ver de dónde sale el número.
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {projCalc.cyclePoints.map((p) => (
                <ProjectionBox key={p.n} title={p.label} subtitle={p.sublabel}
                  total={p.total} profit={p.profit} pct={p.pct}
                  onExplain={() => setExplain({ title: p.label, cycles: p.n, total: p.total, profit: p.profit, pct: p.pct })} />
              ))}
            </div>

            {/* Horizonte a elección: 1 a 12 meses */}
            <div className="mt-5 border-t border-zinc-800/70 pt-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
                <CalendarRange className="h-3 w-3" />
                Elegí el plazo
              </div>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const activo = m === projMonths;
                  return (
                    <button key={m} onClick={() => setProjMonths(m)}
                      aria-pressed={activo}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-medium tabular-nums transition-all ${
                        activo
                          ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                          : "border-zinc-800/70 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
                      }`}>
                      {m}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <ProjectionBox
                  title={`${projMonths} ${projMonths === 1 ? "mes" : "meses"}`}
                  subtitle={`${fmtCycles(horizonPoint.cycles)} ciclo${horizonPoint.cycles === 1 ? "" : "s"} de ~${Math.round(projCalc.days)} días`}
                  total={horizonPoint.total} profit={horizonPoint.profit} pct={horizonPoint.pct}
                  highlight
                  onExplain={() => setExplain({
                    title: `${projMonths} ${projMonths === 1 ? "mes" : "meses"}`,
                    cycles: horizonPoint.cycles, total: horizonPoint.total,
                    profit: horizonPoint.profit, pct: horizonPoint.pct,
                  })}
                />
              </div>
            </div>

            {explain && (
              <ProjectionExplainer data={explain} base={projCalc.base} rate={projCalc.rate}
                cycleDays={projCalc.days} onClose={() => setExplain(null)} />
            )}
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">ROI histórico mensual</div>
                <div className="mt-0.5 text-xs text-zinc-600">Interés devengado vs capital desplegado</div>
              </div>
              <Badge tone="neutral"><TrendingUp className="h-3 w-3" />{BUSINESS_RULES.CHART_HISTORY_MONTHS} meses</Badge>
            </div>
            {derived.months.every((m) => m.roi === 0) ? (
              <div className="flex h-32 items-center justify-center text-xs text-zinc-600">Aún no hay suficiente historial</div>
            ) : (
              <ChartContainer className="h-44 min-w-0">
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={derived.months} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
                    <CartesianGrid stroke={CHART_COLORS.grid as string} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip cursor={{ fill: CHART_COLORS.cursor as string }} content={<RoiTooltip />} />
                    <Bar dataKey="roi" fill={CHART_COLORS.gainStroke as string} radius={[4, 4, 0, 0]}>
                      <LabelList content={makeBarLabel({ kind: "percent" })} />
                    </Bar>
                  </BarChart>
                )}
              </ChartContainer>
            )}
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ganancia acumulada proyectada</div>
                <div className="mt-0.5 text-xs text-zinc-600">Devengado a la fecha + 24 meses de reinversión</div>
              </div>
              <Badge tone="bronze"><RefreshCw className="h-3 w-3" />Interés compuesto</Badge>
            </div>
            <ChartContainer className="h-56 min-w-0">
              {({ width, height }) => (
                <AreaChart width={width} height={height} data={projCalc.profitSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gainFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.gain as string} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={CHART_COLORS.gain as string} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_COLORS.grid as string} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} interval={0} />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip cursor={{ stroke: CHART_COLORS.cursorLine as string, strokeDasharray: "3 3" }}
                    content={<ProjectionTooltip hide={hide} currency={cur} />} />
                  <Area type="monotone" name="Ganancia" dataKey="ganancia"
                    stroke={CHART_COLORS.gainStroke as string} strokeWidth={2.5} fill="url(#gainFill)" dot={{ r: 0 }}
                    activeDot={{ r: 4, fill: CHART_COLORS.gainStroke as string, stroke: "#0a0a0b", strokeWidth: 2 }} />
                </AreaChart>
              )}
            </ChartContainer>
          </Card>
          <PortfolioAnalytics />
        </div>
      )}

      {sub === "assets" && (
        <div className="fa-rise space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total activos</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100"><AnimatedMoney value={derived.totalAssets} hide={hide} currency={cur} /></div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Patrimonio total</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-amber-400"><AnimatedMoney value={derived.totalCapital} hide={hide} currency={cur} /></div>
            </Card>
          </div>
          {state.assets.length === 0 ? (
            <EmptyState Icon={Layers} title="Sin activos registrados"
              hint="Cargá bienes como un auto, propiedad o inversión para ver tu patrimonio real."
              action={<Button variant="bronze" Icon={Plus} onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "asset-form" } })}>Agregar activo</Button>}
            />
          ) : (
            <div>
              <SectionTitle action={
                <Button variant="bronze" size="sm" Icon={Plus} onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "asset-form" } })}>Nuevo</Button>
              }>Mis activos</SectionTitle>
              <div className="space-y-2">
                {state.assets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset}
                    onOpen={(a) => dispatch({ type: "OPEN_MODAL", payload: { type: "asset-form", payload: { editingAsset: a } } })} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sub === "liabilities" && (
        <div className="fa-rise space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total adeudado</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-rose-400"><AnimatedMoney value={derived.totalLiabilities} hide={hide} currency={cur} /></div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Patrimonio total</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-amber-400"><AnimatedMoney value={derived.totalCapital} hide={hide} currency={cur} /></div>
            </Card>
          </div>
          {state.liabilities.length === 0 ? (
            <EmptyState Icon={HandCoins} title="Sin deudas registradas"
              hint="Cargá lo que le debés a alguien para tener un control real de tu capital actual."
              action={<Button variant="bronze" Icon={Plus} onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "liability-form" } })}>Agregar deuda</Button>}
            />
          ) : (
            <div>
              <SectionTitle action={
                <Button variant="bronze" size="sm" Icon={Plus} onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "liability-form" } })}>Nuevo</Button>
              }>Mis deudas</SectionTitle>
              <div className="space-y-2">
                {state.liabilities.map((liability) => (
                  <LiabilityCard key={liability.id} liability={liability}
                    onOpen={(l) => dispatch({ type: "OPEN_MODAL", payload: { type: "liability-form", payload: { editingLiability: l } } })} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sub === "flow" && (
        <div className="fa-rise space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ingresos</div>
              <div className="mt-1 text-lg font-semibold text-emerald-400 tabular-nums">
                <AnimatedMoney value={derived.totalIncome} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Gastos</div>
              <div className="mt-1 text-lg font-semibold text-rose-400 tabular-nums">
                <AnimatedMoney value={derived.totalExpense} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Balance</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${derived.totalIncome - derived.totalExpense >= 0 ? "text-zinc-100" : "text-rose-400"}`}>
                <AnimatedMoney value={derived.totalIncome - derived.totalExpense} hide={hide} currency={cur} />
              </div>
            </Card>
          </div>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Flujo mensual</div>
              <Badge tone="neutral">Últimos {BUSINESS_RULES.CHART_HISTORY_MONTHS} meses</Badge>
            </div>
            <ChartContainer className="h-44 min-w-0">
              {({ width, height }) => (
                <BarChart width={width} height={height} data={derived.months} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap="26%">
                  <CartesianGrid stroke={CHART_COLORS.grid as string} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.axis as string, fontSize: 11 }} />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip cursor={{ fill: CHART_COLORS.cursor as string }} content={<ChartTooltip hide={hide} currency={cur} />} />
                  <Bar name="Ingresos" dataKey="income" fill={CHART_COLORS.income as string} radius={[4, 4, 0, 0]}>
                    <LabelList content={makeBarLabel({ hide })} />
                  </Bar>
                  <Bar name="Gastos" dataKey="expense" fill={CHART_COLORS.expense as string} radius={[4, 4, 0, 0]}>
                    <LabelList content={makeBarLabel({ hide })} />
                  </Bar>
                </BarChart>
              )}
            </ChartContainer>
          </Card>
          <div>
            <SectionTitle>Movimientos</SectionTitle>
            {txAll.length === 0 ? (
              <EmptyState Icon={ArrowUp} title="Aún no cargaste movimientos"
                hint="Registrá ingresos y gastos personales para visualizar tu flujo de caja real."
                action={<Button variant="bronze" Icon={Plus} onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "tx-form" } })}>Cargar movimiento</Button>}
              />
            ) : (
              <Card className="divide-y divide-zinc-800/70">
                {txAll.slice(0, BUSINESS_RULES.TX_LIST_MAX).map((tx) => (
                  <TxRow key={tx.id} tx={tx}
                    onDelete={(t) => dispatch({ type: "DELETE_TX", payload: { id: t.id, type: t.type } })} />
                ))}
              </Card>
            )}
          </div>
        </div>
      )}

      {sub === "categories" && (
        <div className="fa-rise space-y-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Gastos por categoría</div>
              <Badge tone="neutral">
                <PieChartIcon className="h-3 w-3" />
                {hide ? "••••••" : `${cur}${derived.totalExpense.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
              </Badge>
            </div>
            {derived.expenseByCategory.length === 0 ? (
              <EmptyState Icon={PieChartIcon} title="Sin gastos cargados" hint="Cuando registres gastos vas a ver la distribución por categoría acá." />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-5">
                <ChartContainer className="sm:col-span-2 h-48 min-w-0">
                  {({ width, height }) => (
                    <PieChart width={width} height={height}>
                      <Pie data={derived.expenseByCategory} dataKey="value" nameKey="label" innerRadius="60%" outerRadius="92%" paddingAngle={2} stroke="none">
                        {derived.expenseByCategory.map((c) => <Cell key={c.key} fill={c.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip hide={hide} currency={cur} />} />
                    </PieChart>
                  )}
                </ChartContainer>
                <div className="sm:col-span-3 space-y-2">
                  {[...derived.expenseByCategory].sort((a, b) => b.value - a.value).map((c) => {
                    const pct = derived.totalExpense ? (c.value / derived.totalExpense) * 100 : 0;
                    const Icon = (EXPENSE_CATEGORIES as Record<string, { Icon?: React.ComponentType<{ className?: string }> }>)[c.key]?.Icon || Tag;
                    return (
                      <div key={c.key} className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${c.color}22`, color: c.color }}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-200">{c.label}</span>
                            <span className="text-sm font-medium tabular-nums text-zinc-100"><Money value={c.value} hide={hide} currency={cur} /></span>
                          </div>
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                          </div>
                        </div>
                        <span className="w-12 text-right text-[11px] tabular-nums text-zinc-500">{pct.toFixed(0)}%</span>
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
              <div className={`mt-1 text-lg font-semibold tabular-nums ${monthlyBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                <AnimatedMoney value={monthlyBalance} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              {/* Suma sólo la ventana del gráfico; el acumulado de todo el historial es
                  el "Balance" de la pestaña Movimientos. */}
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ahorro {BUSINESS_RULES.CHART_HISTORY_MONTHS} meses</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                <AnimatedMoney value={cumulativeSaving} hide={hide} currency={cur} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
