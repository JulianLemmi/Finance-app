// Línea de tiempo cronológica del préstamo: muestra el inicio, vencimiento,
// cargos por mora y pagos ordenados por fecha. Permite reubicar pagos entre
// períodos de mora usando los controles ▲▼ (reordena timelinePos).
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, TrendingUp, Clock, ChevronUp, ChevronDown, FastForward, X, Trash2, CalendarCheck,
} from "lucide-react";
import { formatDate, formatInterest, loanPeriodDate, myShare, advancedCycles } from "../../lib/utils.js";
import { expectedReturn, resolvePaymentPos, periodInterest } from "../../lib/calcs.js";
import { useApp } from "../../store/index.js";
import { SectionTitle, Badge, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanTimelineProps {
  loan: ResolvedLoan;
  currentCompoundPeriods: number;
}

// ── Local event union ─────────────────────────────────────────────────────────
type StartEvent  = { type: "start"; date: string };
type DueEvent    = { type: "due"; date: string };
type MoraEvent   = { type: "mora"; period: number; date: string; total: number; added: number; isCurrent: boolean; isAdvanced?: boolean; advIndex?: number; isPaid?: boolean };
type PaymentEvent = {
  type: "payment"; id: string; date: string; amount: number; note?: string;
  timelinePos: number; interestInPayment: number; totalInterestAccrued: number;
};
type TimelineEvent = StartEvent | DueEvent | MoraEvent | PaymentEvent;

export default function LoanTimeline({ loan, currentCompoundPeriods }: LoanTimelineProps) {
  const { state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const overdueTimelinePeriods = useMemo<MoraEvent[]>(() => {
    if (!loan.dueDate || currentCompoundPeriods === 0) return [];
    // Sin re-vencimientos ni adelantos no hay eventos de mora que dibujar.
    if (loan._status !== "overdue" && advancedCycles(loan) === 0) return [];

    const payments = loan.payments || [];
    const getPos = (p: typeof payments[number]) =>
      resolvePaymentPos(p, currentCompoundPeriods, loan);

    let balance = expectedReturn(loan);
    payments.filter((p) => getPos(p) === 0).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });

    // Los primeros ciclos son "mora natural" (fecha calculada por vencimiento). Los últimos
    // `advCycles` son adelantos manuales, con la fecha real en que se hicieron.
    const advDates = [...(loan.advancedAt || [])].sort();
    const naturalCycles = currentCompoundPeriods - advDates.length;

    // `total` es el saldo de deuda real (ambos socios) tras capitalizar la mora — se
    // muestra completo, igual que `_remaining`. `added` es la ganancia de ese cargo, y
    // ahí sí se muestra mi parte.
    const share = myShare(loan);
    const result: MoraEvent[] = [];
    for (let i = 1; i <= currentCompoundPeriods; i++) {
      const prevBalance = Math.max(0, balance);
      const added = periodInterest(loan, prevBalance);
      const afterMora = prevBalance + added;
      const isAdvanced = i > naturalCycles;
      const advIdx = i - naturalCycles - 1;
      // "Cubierto" = los pagos aplicados a este ciclo cubren al menos el interés agregado.
      // Un ciclo cubierto se muestra como "Vencimiento" (amarillo), no como mora/adelantado.
      const paidInCycle = payments
        .filter((p) => getPos(p) === i)
        .reduce((s, p) => s + Number(p.amount), 0);
      const isPaid = added > 0 && paidInCycle + 0.001 >= added;
      result.push({
        type: "mora",
        period: i,
        date: isAdvanced ? (advDates[advIdx] || loanPeriodDate(loan, loan.dueDate, i)) : loanPeriodDate(loan, loan.dueDate, i),
        total: afterMora,
        added: added * share,
        isCurrent: i === currentCompoundPeriods,
        isAdvanced,
        advIndex: isAdvanced ? advIdx : undefined,
        isPaid,
      });
      balance = afterMora;
      payments.filter((p) => getPos(p) === i).forEach((p) => {
        balance = Math.max(0, balance - Number(p.amount));
      });
    }
    return result;
  }, [loan, currentCompoundPeriods]);

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
          return dateMs(loanPeriodDate(loan, loan.dueDate, ev.timelinePos)) + 500;
        }
        const tieBreak: Record<TimelineEvent["type"], number> = { start: 0, due: 10, mora: 20, payment: 30 };
        return dateMs(ev.date) + (tieBreak[ev.type] ?? 40);
      };
      return getSortKey(a) - getSortKey(b);
    });
    return events;
  }, [loan, overdueTimelinePeriods]);

  const nextOverdueDate =
    loan._status === "overdue" && loan.dueDate
      ? loanPeriodDate(loan, loan.dueDate, currentCompoundPeriods + 1)
      : null;
  // En préstamos compartidos, la próxima ganancia proyectada es mi parte, no el total.
  const nextOverdueAdded = nextOverdueDate ? loan._nextProfit * myShare(loan) : 0;

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

  // Confirmación inline: primer click al botón X guarda el ID, segundo click confirma la
  // eliminación. Al hacer click en otro botón o refrescar, se limpia. Sin modal para no
  // sobrecargar la timeline.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const deletePayment = (paymentId: string) => {
    const updated = (loan.payments || []).filter((p) => p.id !== paymentId);
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, payments: updated } });
    setPendingDelete(null);
  };

  // Elimina el adelanto en la posición `idx` del array `advancedAt` ordenado por fecha
  // (mismo orden que se muestra en la timeline). No usa UNDO_ADVANCE_CYCLE (que sólo saca
  // el último por orden de inserción, no por fecha).
  const deleteAdvance = (idx: number) => {
    const sorted = [...(loan.advancedAt || [])].sort();
    const target = sorted[idx];
    if (target === undefined) return;
    // Remueve la primera ocurrencia de `target` en el array original (mantener el resto).
    const orig = loan.advancedAt || [];
    const removeAt = orig.indexOf(target);
    const updated = removeAt >= 0 ? [...orig.slice(0, removeAt), ...orig.slice(removeAt + 1)] : orig;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, advancedAt: updated } });
    setPendingDelete(null);
  };

  // Reeditar la fecha de un adelanto: se muestra un input date inline. Al confirmar,
  // se reemplaza la fecha en el array (el orden final lo define sort() por fecha).
  const editAdvanceDate = (idx: number, newDate: string) => {
    if (!newDate) return;
    const sorted = [...(loan.advancedAt || [])].sort();
    const target = sorted[idx];
    if (target === undefined) return;
    const orig = loan.advancedAt || [];
    const replaceAt = orig.indexOf(target);
    const updated = replaceAt >= 0
      ? [...orig.slice(0, replaceAt), newDate, ...orig.slice(replaceAt + 1)]
      : orig;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, advancedAt: updated } });
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
                      +<Money value={loan._profit * myShare(loan)} hide={hide} currency={cur} /> ({formatInterest(loan, cur)})
                    </div>
                  </div>
                </div>
              </div>
            );

            if (ev.type === "mora") {
              const adv = ev.isAdvanced;
              const paid = !!ev.isPaid;
              const advId = adv && ev.advIndex !== undefined ? `adv-${ev.advIndex}` : "";
              const isConfirmingAdvDelete = adv && pendingDelete === advId;
              // Tres estilos: pagado (amarillo/vencimiento cerrado), adelantado no pagado
              // (morado), mora natural no pagada (rojo). El pagado gana para que sea
              // trivial contar los vencimientos cerrados en la timeline.
              const colorRing = paid ? "border-amber-700/60" : (adv ? "border-purple-700/70" : "border-rose-700/70");
              const colorRingBg = ev.isCurrent
                ? (paid ? "bg-amber-900/40" : (adv ? "bg-purple-900/60" : "bg-rose-900/60"))
                : (paid ? "bg-amber-950/60" : (adv ? "bg-purple-950/60" : "bg-rose-950/60"));
              const colorDot = paid ? "bg-amber-400" : (adv ? "bg-purple-500" : "bg-rose-500");
              const colorText = paid ? "text-amber-400" : (adv ? "text-purple-300" : "text-rose-400");
              const colorTotal = paid ? "text-amber-200" : (adv ? "text-purple-200" : "text-rose-200");
              const colorAdded = paid ? "text-emerald-400/80" : (adv ? "text-purple-300" : "text-rose-400");
              const rowBg = ev.isCurrent
                ? (paid ? "bg-amber-950/15 ring-1 ring-amber-900/30" : (adv ? "bg-purple-950/20 ring-1 ring-purple-900/40" : "bg-rose-950/20 ring-1 ring-rose-900/40"))
                : "hover:bg-zinc-900/40";
              const Icon = paid ? CalendarCheck : (adv ? FastForward : AlertTriangle);
              const label = paid
                ? `Vencimiento ${ev.period}${adv ? " (adelantado)" : ""}`
                : (adv ? `Ciclo adelantado ${ev.period}` : `Cargo por mora ${ev.period}`);
              return (
                <div key={`mora-${ev.period}`} className={`group relative flex items-start gap-3 rounded-xl px-3 py-3 ${rowBg}`}>
                  <div className={`relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${colorRing} ${colorRingBg}`}>
                    <div className={`h-2 w-2 rounded-full ${colorDot} ${ev.isCurrent && !paid ? "animate-pulse" : ""}`} />
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${colorText}`}>
                        <Icon className="h-3 w-3" />
                        {label}
                        {ev.isCurrent && !paid && <Badge tone={adv ? "purple" : "danger"}>Actual</Badge>}
                        {paid && <Badge tone="success">Cubierto</Badge>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {adv && ev.advIndex !== undefined ? (
                          <input
                            type="date"
                            value={ev.date}
                            onChange={(e) => editAdvanceDate(ev.advIndex!, e.target.value)}
                            className={`rounded border ${paid ? "border-amber-800/40 bg-amber-950/30 text-amber-200" : "border-purple-800/40 bg-purple-950/30 text-purple-200"} px-1.5 py-0.5 text-[11px] outline-none focus:border-purple-600`}
                            title="Cambiar la fecha del adelanto"
                          />
                        ) : (
                          formatDate(ev.date)
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold tabular-nums ${colorTotal}`}>
                        <Money value={ev.total} hide={hide} currency={cur} />
                      </div>
                      <div className={`text-[11px] tabular-nums font-medium ${colorAdded}`}>
                        +<Money value={ev.added} hide={hide} currency={cur} /> ({formatInterest(loan, cur)})
                      </div>
                    </div>
                    {adv && ev.advIndex !== undefined && (
                      isConfirmingAdvDelete ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => deleteAdvance(ev.advIndex!)}
                            className="flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[10px] font-medium text-rose-300 hover:bg-rose-500/30"
                            title="Confirmar eliminación"
                          >
                            <Trash2 className="h-3 w-3" />
                            Confirmar
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                            title="Cancelar"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingDelete(advId)}
                          className="hidden shrink-0 rounded-md p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-rose-400 group-hover:block"
                          title="Eliminar adelanto"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            }

            if (ev.type === "payment") {
              const canMoveDown = currentCompoundPeriods > 0 && ev.timelinePos < currentCompoundPeriods;
              const canMoveUp = ev.timelinePos > 0;
              const isReordered = ev.timelinePos > 0;
              const payId = `pay-${ev.id}`;
              const isConfirmingDelete = pendingDelete === payId;
              return (
                <div key={ev.id} className={`group relative flex items-start gap-3 rounded-xl px-3 py-3 ring-1 ${isReordered ? "bg-amber-950/10 ring-amber-900/30" : "bg-emerald-950/10 ring-emerald-900/30"}`}>
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
                    {(canMoveUp || canMoveDown) && !isConfirmingDelete && (
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
                    {isConfirmingDelete ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => deletePayment(ev.id)}
                          className="flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[10px] font-medium text-rose-300 hover:bg-rose-500/30"
                          title="Confirmar eliminación"
                        >
                          <Trash2 className="h-3 w-3" />
                          Confirmar
                        </button>
                        <button
                          onClick={() => setPendingDelete(null)}
                          className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                          title="Cancelar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingDelete(payId)}
                        className="hidden shrink-0 rounded-md p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-rose-400 group-hover:block"
                        title="Eliminar pago"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                  <div className="text-[11px] text-zinc-600">
                    {loan.interestMode === "fixed" ? "(monto fijo)" : `(${formatInterest(loan, cur)} adicional)`}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
