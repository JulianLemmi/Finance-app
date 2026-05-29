// Línea de tiempo cronológica del préstamo: muestra el inicio, vencimiento,
// cargos por mora y pagos ordenados por fecha. Permite reubicar pagos entre
// períodos de mora usando los controles ▲▼ (reordena timelinePos).
import { useMemo } from "react";
import {
  AlertTriangle, ArrowDown, TrendingUp, Clock, ChevronUp, ChevronDown,
} from "lucide-react";
import { addDays, formatDate } from "../../lib/utils.js";
import { expectedReturn, resolvePaymentPos } from "../../lib/calcs.js";
import { useApp } from "../../store/index.js";
import { SectionTitle, Badge, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanTimelineProps {
  loan: ResolvedLoan;
  currentCompoundPeriods: number;
  loanTermDays: number;
}

// ── Local event union ─────────────────────────────────────────────────────────
type StartEvent  = { type: "start"; date: string };
type DueEvent    = { type: "due"; date: string };
type MoraEvent   = { type: "mora"; period: number; date: string; total: number; added: number; isCurrent: boolean };
type PaymentEvent = {
  type: "payment"; id: string; date: string; amount: number; note?: string;
  timelinePos: number; interestInPayment: number; totalInterestAccrued: number;
};
type TimelineEvent = StartEvent | DueEvent | MoraEvent | PaymentEvent;

export default function LoanTimeline({ loan, currentCompoundPeriods, loanTermDays }: LoanTimelineProps) {
  const { state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const overdueTimelinePeriods = useMemo<MoraEvent[]>(() => {
    if (loan._status !== "overdue" || !loan.dueDate || currentCompoundPeriods === 0) return [];

    const rate = Number(loan.interestRate) / 100;
    const payments = loan.payments || [];
    const getPos = (p: typeof payments[number]) =>
      resolvePaymentPos(p, currentCompoundPeriods, loanTermDays, loan.dueDate);

    let balance = expectedReturn(loan);
    payments.filter((p) => getPos(p) === 0).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });

    const result: MoraEvent[] = [];
    for (let i = 1; i <= currentCompoundPeriods; i++) {
      const prevBalance = Math.max(0, balance);
      const added = prevBalance * rate;
      const afterMora = prevBalance + added;
      result.push({
        type: "mora",
        period: i,
        date: addDays(loan.dueDate, i * loanTermDays),
        total: afterMora,
        added,
        isCurrent: i === currentCompoundPeriods,
      });
      balance = afterMora;
      payments.filter((p) => getPos(p) === i).forEach((p) => {
        balance = Math.max(0, balance - Number(p.amount));
      });
    }
    return result;
  }, [loan, loanTermDays, currentCompoundPeriods]);

  const allTimelineEvents = useMemo<TimelineEvent[]>(() => {
    const totalInterestAccrued = Math.max(0, loan._compoundReturn - Number(loan.amount));
    const events: TimelineEvent[] = [];

    events.push({ type: "start", date: loan.startDate });
    if (loan.dueDate) events.push({ type: "due", date: loan.dueDate });
    overdueTimelinePeriods.forEach((p) => events.push(p));

    let cumulativePaid = 0;
    [...(loan.payments || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((p) => {
      const prevCumulative = cumulativePaid;
      cumulativePaid += Number(p.amount);
      const interestBefore = Math.min(prevCumulative, totalInterestAccrued);
      const interestAfter = Math.min(cumulativePaid, totalInterestAccrued);
      events.push({
        type: "payment",
        id: p.id ?? "",
        date: p.date,
        amount: Number(p.amount),
        note: p.note,
        timelinePos: p.timelinePos ?? 0,
        interestInPayment: interestAfter - interestBefore,
        totalInterestAccrued,
      });
    });

    const dateMs = (dateStr: string) => new Date(dateStr + "T00:00:00").getTime();
    events.sort((a, b) => {
      const getSortKey = (ev: TimelineEvent): number => {
        if (ev.type === "payment" && ev.timelinePos > 0) {
          return dateMs(addDays(loan.dueDate, ev.timelinePos * loanTermDays)) + 500;
        }
        const tieBreak: Record<TimelineEvent["type"], number> = { start: 0, due: 10, mora: 20, payment: 30 };
        return dateMs(ev.date) + (tieBreak[ev.type] ?? 40);
      };
      return getSortKey(a) - getSortKey(b);
    });
    return events;
  }, [loan, overdueTimelinePeriods, loanTermDays]);

  const nextOverdueDate =
    loan._status === "overdue" && loan.dueDate
      ? addDays(loan.dueDate, (currentCompoundPeriods + 1) * loanTermDays)
      : null;
  const nextOverdueAdded = nextOverdueDate
    ? loan._remaining * (Number(loan.interestRate) / 100)
    : 0;

  const movePayment = (paymentId: string, direction: "up" | "down") => {
    const payment = (loan.payments || []).find((p) => p.id === paymentId);
    if (!payment) return;
    const currentPos = payment.timelinePos ?? 0;
    const newPos =
      direction === "down"
        ? Math.min(currentPos + 1, currentCompoundPeriods)
        : Math.max(currentPos - 1, 0);
    const updated = (loan.payments || []).map((p) =>
      p.id === paymentId ? { ...p, timelinePos: newPos } : p
    );
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, payments: updated } });
  };

  return (
    <div>
      <SectionTitle>Línea de tiempo</SectionTitle>
      <div className="relative">
        <div className="absolute left-[11px] top-4 bottom-4 w-px bg-zinc-800" />
        <div className="space-y-1">

          {allTimelineEvents.map((ev) => {
            if (ev.type === "start") return (
              <div key="start" className="relative flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-zinc-900/40">
                <div className="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-emerald-700/60 bg-emerald-950/80">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Inicio del préstamo</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{formatDate(loan.startDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-zinc-100">
                      <Money value={loan.amount} hide={hide} currency={cur} />
                    </div>
                    <div className="text-[11px] text-zinc-500">Capital prestado</div>
                  </div>
                </div>
              </div>
            );

            if (ev.type === "due") return (
              <div key="due" className={`relative flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-zinc-900/40 ${loan._status === "overdue" ? "bg-rose-950/10" : ""}`}>
                <div className={`relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${loan._status === "overdue" ? "border border-rose-700/60 bg-rose-950/80" : "border border-amber-700/60 bg-amber-950/80"}`}>
                  <div className={`h-2 w-2 rounded-full ${loan._status === "overdue" ? "bg-rose-400" : "bg-amber-400"}`} />
                </div>
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <div className={`text-xs font-semibold uppercase tracking-wider ${loan._status === "overdue" ? "text-rose-400" : "text-amber-400"}`}>
                      {loan._status === "overdue" ? "Vencido" : "Vencimiento"}
                      {loan._status === "overdue" && (
                        <span className="ml-1.5 font-normal normal-case text-rose-500">(hace {Math.abs(loan._daysUntilDue ?? 0)}d)</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{formatDate(loan.dueDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-zinc-100">
                      <Money value={loan._return} hide={hide} currency={cur} />
                    </div>
                    <div className="text-[11px] text-emerald-400/80 tabular-nums">
                      +<Money value={loan._profit} hide={hide} currency={cur} /> ({Number(loan.interestRate).toFixed(1)}%)
                    </div>
                  </div>
                </div>
              </div>
            );

            if (ev.type === "mora") return (
              <div key={`mora-${ev.period}`} className={`relative flex items-start gap-3 rounded-xl px-3 py-3 ${ev.isCurrent ? "bg-rose-950/20 ring-1 ring-rose-900/40" : "hover:bg-zinc-900/40"}`}>
                <div className={`relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-rose-700/70 ${ev.isCurrent ? "bg-rose-900/60" : "bg-rose-950/60"}`}>
                  <div className={`h-2 w-2 rounded-full bg-rose-500 ${ev.isCurrent ? "animate-pulse" : ""}`} />
                </div>
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
                      <AlertTriangle className="h-3 w-3" />
                      Cargo por mora {ev.period}
                      {ev.isCurrent && <Badge tone="danger">Actual</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{formatDate(ev.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-rose-200">
                      <Money value={ev.total} hide={hide} currency={cur} />
                    </div>
                    <div className="text-[11px] text-rose-400 tabular-nums font-medium">
                      +<Money value={ev.added} hide={hide} currency={cur} /> ({Number(loan.interestRate).toFixed(1)}%)
                    </div>
                  </div>
                </div>
              </div>
            );

            if (ev.type === "payment") {
              const canMoveDown = currentCompoundPeriods > 0 && ev.timelinePos < currentCompoundPeriods;
              const canMoveUp = ev.timelinePos > 0;
              const isReordered = ev.timelinePos > 0;
              return (
                <div key={ev.id} className={`relative flex items-start gap-3 rounded-xl px-3 py-3 ring-1 ${isReordered ? "bg-amber-950/10 ring-amber-900/30" : "bg-emerald-950/10 ring-emerald-900/30"}`}>
                  <div className={`relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${isReordered ? "border-amber-700/60 bg-amber-950/80" : "border-emerald-700/60 bg-emerald-950/80"}`}>
                    <ArrowDown className={`h-3 w-3 ${isReordered ? "text-amber-400" : "text-emerald-400"}`} />
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${isReordered ? "text-amber-400" : "text-emerald-400"}`}>
                        <TrendingUp className="h-3 w-3" />
                        Pago recibido
                        {isReordered && (
                          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-amber-400">
                            reordenado
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {formatDate(ev.date)}{ev.note ? ` · ${ev.note}` : ""}
                      </div>
                    </div>
                    {(canMoveUp || canMoveDown) && (
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          disabled={!canMoveUp}
                          onClick={() => movePayment(ev.id, "up")}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-20"
                          title="Mover antes del cargo anterior"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={!canMoveDown}
                          onClick={() => movePayment(ev.id, "down")}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-20"
                          title="Mover después del próximo cargo"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-emerald-300">
                        <Money value={ev.amount} hide={hide} currency={cur} />
                      </div>
                      {ev.interestInPayment > 0.01 && (
                        <div className="text-[11px] text-zinc-500 tabular-nums">
                          Interés cubierto: <span className="text-amber-400"><Money value={ev.interestInPayment} hide={hide} currency={cur} /></span>
                          {" "}<span className="text-zinc-600">/ <Money value={ev.totalInterestAccrued} hide={hide} currency={cur} /></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {nextOverdueDate && (
            <div className="relative flex items-start gap-3 rounded-xl border border-dashed border-zinc-800/60 px-3 py-3">
              <div className="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-700/60 bg-zinc-900">
                <Clock className="h-3 w-3 text-zinc-600" />
              </div>
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Próximo cargo proyectado</div>
                  <div className="mt-0.5 text-[11px] text-zinc-600">{formatDate(nextOverdueDate)} · si no se paga</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold tabular-nums text-zinc-500">
                    +<Money value={nextOverdueAdded} hide={hide} currency={cur} />
                  </div>
                  <div className="text-[11px] text-zinc-600">({Number(loan.interestRate).toFixed(1)}% adicional)</div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
