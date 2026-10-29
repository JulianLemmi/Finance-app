// De dónde sale cada barra de los gráficos de Inicio. Se abre manteniendo apretada una
// vela: la barra dice "US$2.354" y acá se ve qué cliente puso cada peso.
//
// Las filas salen de `derived.monthBreakdowns`, armado en el mismo recorrido que las
// barras. El total que se muestra abajo es la suma de las filas, no el de la barra: si
// alguna vez dejaran de coincidir, se ve acá en vez de pasar inadvertido.
import { Users, Wallet, Package, TrendingDown, Banknote, Receipt } from "lucide-react";
import { Sheet, Money } from "./ui.jsx";
import { useApp } from "../store/index.js";
import type { ChartDetailKind, MonthBreakdown, MonthContribution } from "../types";

const META: Record<ChartDetailKind, { title: string; note: string; positive: boolean }> = {
  accrued: {
    title: "Ganancia del mes",
    note: "Interés que se le cargó a cada cliente en este mes, lo haya pagado o no.",
    positive: true,
  },
  expenses: {
    title: "Gastos del mes",
    note: "Movimientos de gasto cargados en este mes, por categoría.",
    positive: false,
  },
  capital: {
    title: "Capital prestado",
    note: "Lo que cada préstamo tenía en la calle al cierre de este mes.",
    positive: true,
  },
  total: {
    title: "Patrimonio",
    note: "Efectivo, lo prestado y los activos, menos lo que debés.",
    positive: true,
  },
};

const ICON: Record<MonthContribution["kind"], typeof Users> = {
  loan: Users,
  salary: Banknote,
  cash: Wallet,
  asset: Package,
  liability: TrendingDown,
  expense: Receipt,
};

const TONE: Record<MonthContribution["kind"], string> = {
  loan: "text-amber-400",
  salary: "text-sky-400",
  cash: "text-zinc-300",
  asset: "text-teal-400",
  liability: "text-rose-400",
  expense: "text-rose-400",
};

interface ChartDetailSheetProps {
  open: boolean;
  onClose: () => void;
  breakdown: MonthBreakdown | null;
  kind: ChartDetailKind;
}

export default function ChartDetailSheet({ open, onClose, breakdown, kind }: ChartDetailSheetProps) {
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const meta = META[kind];
  const filas = breakdown ? breakdown[kind] : [];
  const total = filas.reduce((s, f) => s + f.amount, 0);
  // Para la barra de proporción: el renglón más grande en valor absoluto marca la escala.
  const mayor = filas.reduce((max, f) => Math.max(max, Math.abs(f.amount)), 0);

  return (
    <Sheet
      open={open} onClose={onClose} size="md" dense
      title={meta.title}
      subtitle={breakdown ? `${breakdown.label} · ${filas.length} ${filas.length === 1 ? "origen" : "orígenes"}` : ""}
      footer={
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Total</span>
          <span className={`font-semibold tabular-nums ${meta.positive ? "text-zinc-100" : "text-rose-300"}`}>
            <Money value={Math.abs(total)} hide={hide} currency={cur} />
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[11px] leading-relaxed text-zinc-500">{meta.note}</p>

        {filas.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-8 text-center text-xs text-zinc-600">
            Este mes no tiene movimientos de este tipo.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-800/70">
            {filas.map((f, i) => {
              const Icon = ICON[f.kind];
              const pct = mayor > 0 ? (Math.abs(f.amount) / mayor) * 100 : 0;
              const share = total !== 0 ? (f.amount / total) * 100 : 0;
              return (
                <div key={`${f.label}-${i}`}
                  className="border-b border-zinc-800/50 px-3 py-2.5 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE[f.kind]}`} />
                      <span className="truncate text-xs text-zinc-200">{f.label}</span>
                      {f.detail && <span className="shrink-0 text-[10px] text-zinc-600">{f.detail}</span>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-xs font-semibold tabular-nums ${f.amount < 0 ? "text-rose-300" : "text-zinc-100"}`}>
                        {f.amount < 0 ? "−" : ""}
                        <Money value={Math.abs(f.amount)} hide={hide} currency={cur} />
                      </div>
                      {/* El porcentaje sólo tiene sentido cuando todo va en la misma
                          dirección: con un pasivo restando, "el 140% del total" confunde. */}
                      {total > 0 && f.amount > 0 && (
                        <div className="text-[10px] tabular-nums text-zinc-600">{Math.round(share)}%</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800/80">
                    <div className={`h-full rounded-full ${f.amount < 0 ? "bg-rose-500/70" : "bg-amber-500/70"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
