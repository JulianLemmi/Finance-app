// Listado de todos los préstamos con filtro por estado y búsqueda de texto.
// Cada préstamo muestra deuda restante, progreso de pago y próximo vencimiento.
import { useState, useMemo } from "react";
import { Plus, Search, Wallet, CalendarClock, Calendar } from "lucide-react";
import { useApp } from "../store/index.js";
import { GUARANTY_TYPES } from "../lib/constants.js";
import { formatShortDate, getNextRenewalDate } from "../lib/utils.js";
import { EmptyState, Input, Button, Money, ProgressBar, StatusBadge } from "../components/ui.jsx";
import type { ResolvedLoan, LoanStatus } from "../types";

interface LoanCardProps {
  loan: ResolvedLoan;
  onOpen: (id: string) => void;
}

function LoanCard({ loan, onOpen }: LoanCardProps) {
  const { state } = useApp();
  const G = (GUARANTY_TYPES as Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string }>)[loan.guarantyType] || GUARANTY_TYPES.other;
  const dueIn = loan._daysUntilDue;
  const overdue = loan._status === "overdue";
  const upcoming = loan._status === "active" && dueIn !== null && dueIn <= 3;
  const ongoing = loan._status === "active" || loan._status === "overdue";
  const nextRenewalDate = ongoing ? getNextRenewalDate(loan) : null;
  const nextChargeAmount = ongoing ? loan._nextProfit : 0;

  const dueText = (() => {
    if (loan._status === "paid") return "Cerrado";
    if (loan._status === "refinanced") return "Refinanciado";
    if (dueIn === null) return "";
    if (dueIn < 0) return `Vencido hace ${Math.abs(dueIn)}d`;
    if (dueIn === 0) return "Vence hoy";
    if (dueIn === 1) return "Vence mañana";
    return `Vence en ${dueIn}d`;
  })();

  return (
    <button onClick={() => onOpen(loan.id)}
      className={`group relative w-full overflow-hidden rounded-2xl border bg-zinc-900/50 px-4 py-4 text-left transition-all hover:bg-zinc-900 ${
        overdue ? "border-rose-900/40" : upcoming ? "border-amber-800/40" : "border-zinc-800/70"
      }`}
    >
      {(overdue || upcoming) && (
        <span className={`absolute left-0 top-0 h-full w-0.5 ${overdue ? "bg-rose-500" : "bg-amber-500"}`} />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{loan.clientName}</span>
            <StatusBadge status={loan._status} />
          </div>
          {loan.alias && <div className="mt-0.5 truncate text-xs text-zinc-500">{loan.alias}</div>}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tracking-tight text-zinc-100 tabular-nums">
            <Money value={loan._remaining} hide={state.settings.hideBalances} currency={state.settings.currency} />
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">{Number(loan.interestRate).toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-600">
        <Calendar className="h-3 w-3 shrink-0" />
        <span>Inicio {formatShortDate(loan.startDate)}</span>
        <span className="text-zinc-700">→</span>
        <span className={overdue ? "text-rose-500/80" : "text-zinc-600"}>
          Vence {formatShortDate(loan.dueDate)}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={loan._progress} tone={overdue ? "rose" : "bronze"} />
      </div>
      {nextRenewalDate && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 tabular-nums">
          <span className="flex items-center gap-1">
            <span className="text-zinc-600">↻</span>
            Próx. vence {formatShortDate(nextRenewalDate)}
          </span>
          <span className="text-emerald-400">
            +<Money value={nextChargeAmount} hide={state.settings.hideBalances} currency={state.settings.currency} />
          </span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-zinc-500">
          <G.Icon className="h-3.5 w-3.5" />
          {G.label}
        </span>
        <span className={`flex items-center gap-1.5 ${overdue ? "text-rose-400" : upcoming ? "text-amber-400" : "text-zinc-500"}`}>
          <CalendarClock className="h-3.5 w-3.5" />
          {dueText}
        </span>
      </div>
    </button>
  );
}

type FilterValue = LoanStatus | "all";

export default function LoansScreen() {
  const { dispatch, derived } = useApp();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");

  const filters: { v: FilterValue; l: string; n: number }[] = [
    { v: "all", l: "Todos", n: derived.loansResolved.length },
    { v: "active", l: "Activos", n: derived.activeLoans.length },
    { v: "overdue", l: "Atrasados", n: derived.overdueLoans.length },
    { v: "paid", l: "Pagados", n: derived.paidLoans.length },
    { v: "refinanced", l: "Refinanciados", n: derived.refinancedLoans.length },
  ];

  const filtered = useMemo(() => {
    let arr = derived.loansResolved;
    if (filter !== "all") arr = arr.filter((l) => l._status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (l) => l.clientName.toLowerCase().includes(q) || (l.alias || "").toLowerCase().includes(q)
      );
    }
    return arr.sort((a, b) => {
      const order: Record<LoanStatus, number> = { overdue: 0, active: 1, refinanced: 2, paid: 3 };
      const oa = order[a._status] ?? 9, ob = order[b._status] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a._daysUntilDue ?? 9999) - (b._daysUntilDue ?? 9999);
    });
  }, [derived.loansResolved, filter, query]);

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Préstamos</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {derived.activeLoans.length + derived.overdueLoans.length} operaciones activas
          </p>
        </div>
        <Button variant="bronze" Icon={Plus}
          onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })}>
          Nuevo
        </Button>
      </div>

      <Input placeholder="Buscar cliente o alias..." value={query}
        onChange={(e) => setQuery(e.target.value)} Icon={Search} />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {filters.map((f) => {
          const active = filter === f.v;
          return (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                  : "border-zinc-800/70 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              {f.l}
              <span className={`tabular-nums ${active ? "text-amber-300/80" : "text-zinc-500"}`}>{f.n}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState Icon={Wallet}
          title={
            query ? "Sin resultados"
              : filter === "all" ? "Aún no hay préstamos"
              : filter === "active" ? "Sin préstamos activos"
              : filter === "overdue" ? "Ningún préstamo atrasado"
              : filter === "paid" ? "Ningún préstamo pagado todavía"
              : "Sin préstamos en esta categoría"
          }
          hint={
            query ? `No encontramos clientes ni alias que coincidan con "${query}". Probá con otro término.`
              : filter === "all"
                ? "Tu primer préstamo se asocia automáticamente al cliente."
              : filter === "overdue" ? "Buen trabajo — todos los préstamos están al día."
              : filter === "paid" ? "Cuando un préstamo se salda por completo aparece acá."
              : "No hay préstamos en este estado todavía."
          }
          action={!query && filter === "all" && (
            <Button variant="bronze" Icon={Plus}
              onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })}>
              Registrar primer préstamo
            </Button>
          )}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((l) => (
            <LoanCard key={l.id} loan={l}
              onOpen={(id) => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })} />
          ))}
        </div>
      )}
    </div>
  );
}
