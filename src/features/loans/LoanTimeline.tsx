// Línea de tiempo cronológica del préstamo: inicio, vencimiento, cargos por mora y
// pagos ordenados por fecha. En desktop cada evento muestra el detalle en 2 columnas
// (izquierda: fecha/nota editable, derecha: monto/subtotal); en mobile se apila en una.
//
// Casi todo es editable: fechas de inicio/vencimiento/adelanto con un date picker inline,
// pagos con un panel expandible (fecha, monto, nota). Las flechitas mueven el pago entre
// ciclos de mora (via `timelinePos`) y la X elimina pagos y adelantos. La mora natural
// no se edita desde acá: se mueve con "Extender" y "Editar" del footer del detalle.
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, TrendingUp, Clock, ChevronUp, ChevronDown, FastForward,
  X, Trash2, CalendarCheck, Pencil, Check,
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

// ── Estilos compartidos por tipo ──────────────────────────────────────────────
// Un date input pequeño usado para editar fechas en línea. Colores tomados del contexto.
function DateInput({
  value, onChange, tone, title,
}: {
  value: string;
  onChange: (v: string) => void;
  tone: "emerald" | "amber" | "purple" | "rose" | "zinc";
  title?: string;
}) {
  const cls = {
    emerald: "border-emerald-800/40 bg-emerald-950/30 text-emerald-200 focus:border-emerald-600",
    amber:   "border-amber-800/40 bg-amber-950/30 text-amber-200 focus:border-amber-600",
    purple:  "border-purple-800/40 bg-purple-950/30 text-purple-200 focus:border-purple-600",
    rose:    "border-rose-800/40 bg-rose-950/30 text-rose-200 focus:border-rose-600",
    zinc:    "border-zinc-700/50 bg-zinc-800/40 text-zinc-300 focus:border-zinc-500",
  }[tone];
  return (
    <input
      type="date" value={value} title={title}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border ${cls} px-1.5 py-0.5 text-[11px] tabular-nums outline-none`}
    />
  );
}

// Un botón de acción con estilo consistente (X, lápiz, flecha, etc.).
function IconAction({
  onClick, disabled, title, children, tone = "zinc",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  tone?: "zinc" | "rose";
}) {
  const hoverTone = tone === "rose" ? "hover:text-rose-400" : "hover:text-zinc-200";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 opacity-60 transition-all hover:bg-zinc-800/70 hover:opacity-100 ${hoverTone} disabled:cursor-not-allowed disabled:opacity-20`}
    >
      {children}
    </button>
  );
}

// Popover inline de confirmación de eliminación (patrón compartido entre pagos y adelantos).
function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={onConfirm}
        className="flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[10px] font-medium text-rose-300 hover:bg-rose-500/30"
        title="Confirmar eliminación"
      >
        <Trash2 className="h-3 w-3" />
        Confirmar
      </button>
      <button
        onClick={onCancel}
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        title="Cancelar"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// Contenedor común de un evento de la timeline. Renderiza el punto/línea a la izquierda
// y le da el layout responsive al contenido: en sm+ arma 2 columnas (info | monto),
// en mobile todo apilado en una sola.
function EventRow({
  ringCls, dotCls, pulse, children,
}: {
  ringCls: string;
  dotCls: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative pl-9">
      <div className={`absolute left-0 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border ${ringCls}`}>
        <div className={`h-2 w-2 rounded-full ${dotCls} ${pulse ? "animate-pulse" : ""}`} />
      </div>
      {children}
    </div>
  );
}

export default function LoanTimeline({ loan, currentCompoundPeriods }: LoanTimelineProps) {
  const { state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const overdueTimelinePeriods = useMemo<MoraEvent[]>(() => {
    if (!loan.dueDate || currentCompoundPeriods === 0) return [];
    if (loan._status !== "overdue" && advancedCycles(loan) === 0) return [];

    const payments = loan.payments || [];
    const getPos = (p: typeof payments[number]) =>
      resolvePaymentPos(p, currentCompoundPeriods, loan);

    let balance = expectedReturn(loan);
    payments.filter((p) => getPos(p) === 0).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });

    const advDates = [...(loan.advancedAt || [])].sort();
    const naturalCycles = currentCompoundPeriods - advDates.length;

    const share = myShare(loan);
    const result: MoraEvent[] = [];
    for (let i = 1; i <= currentCompoundPeriods; i++) {
      const prevBalance = Math.max(0, balance);
      const added = periodInterest(loan, prevBalance);
      const afterMora = prevBalance + added;
      const isAdvanced = i > naturalCycles;
      const advIdx = i - naturalCycles - 1;
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
  const nextOverdueAdded = nextOverdueDate ? loan._nextProfit * myShare(loan) : 0;

  // ── Handlers ────────────────────────────────────────────────────────────────
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

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<{ date: string; amount: string; note: string }>({ date: "", amount: "", note: "" });

  const deletePayment = (paymentId: string) => {
    const updated = (loan.payments || []).filter((p) => p.id !== paymentId);
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, payments: updated } });
    setPendingDelete(null);
  };

  const openEditPayment = (id: string, date: string, amount: number, note?: string) => {
    setPaymentDraft({ date, amount: String(amount), note: note ?? "" });
    setEditingPaymentId(id);
    setPendingDelete(null);
  };
  const saveEditPayment = () => {
    if (!editingPaymentId) return;
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !paymentDraft.date) return;
    const updated = (loan.payments || []).map((p) =>
      p.id === editingPaymentId
        ? { ...p, date: paymentDraft.date, amount, note: paymentDraft.note.trim() || undefined }
        : p
    );
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, payments: updated } });
    setEditingPaymentId(null);
  };

  const deleteAdvance = (idx: number) => {
    const sorted = [...(loan.advancedAt || [])].sort();
    const target = sorted[idx];
    if (target === undefined) return;
    const orig = loan.advancedAt || [];
    const removeAt = orig.indexOf(target);
    const updated = removeAt >= 0 ? [...orig.slice(0, removeAt), ...orig.slice(removeAt + 1)] : orig;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, advancedAt: updated } });
    setPendingDelete(null);
  };

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

  const editStartDate = (newDate: string) => {
    if (!newDate) return;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, startDate: newDate } });
  };
  const editDueDate = (newDate: string) => {
    if (!newDate) return;
    // El reducer rechaza si dueDate < startDate; el input date del navegador ya limita
    // pero por las dudas el reducer sirve de red.
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, dueDate: newDate } });
  };

  return (
    <div>
      <SectionTitle>Línea de tiempo</SectionTitle>
      <div className="relative">
        {/* Línea conectora vertical, corre por detrás de los puntos. */}
        <div className="pointer-events-none absolute left-[11px] top-6 bottom-6 w-px bg-gradient-to-b from-transparent via-zinc-800 to-transparent" />
        <div className="space-y-2">

          {allTimelineEvents.map((ev) => {
            // ── INICIO ──────────────────────────────────────────────────────
            if (ev.type === "start") return (
              <EventRow
                key="start"
                ringCls="border-emerald-700/60 bg-emerald-950/80"
                dotCls="bg-emerald-400"
              >
                <div className="rounded-xl px-3 py-2.5 hover:bg-zinc-900/40">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Inicio del préstamo
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
                    <div className="text-[11px] text-zinc-500">
                      <DateInput value={loan.startDate} onChange={editStartDate} tone="emerald" title="Editar fecha de inicio" />
                    </div>
                    <div className="sm:text-right">
                      <div className="text-sm font-semibold tabular-nums text-zinc-100">
                        <Money value={loan.amount} hide={hide} currency={cur} />
                      </div>
                      <div className="text-[11px] text-zinc-500">Capital prestado</div>
                    </div>
                  </div>
                </div>
              </EventRow>
            );

            // ── VENCIMIENTO ORIGINAL ────────────────────────────────────────
            if (ev.type === "due") {
              const overdue = loan._status === "overdue";
              return (
                <EventRow
                  key="due"
                  ringCls={overdue ? "border-rose-700/60 bg-rose-950/80" : "border-amber-700/60 bg-amber-950/80"}
                  dotCls={overdue ? "bg-rose-400" : "bg-amber-400"}
                >
                  <div className={`rounded-xl px-3 py-2.5 hover:bg-zinc-900/40 ${overdue ? "bg-rose-950/10" : ""}`}>
                    <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider ${overdue ? "text-rose-400" : "text-amber-400"}`}>
                      {overdue ? "Vencido" : "Vencimiento"}
                      {overdue && (
                        <Badge tone="danger">hace {Math.abs(loan._daysUntilDue ?? 0)}d</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
                      <div className="text-[11px] text-zinc-500">
                        <DateInput
                          value={loan.dueDate}
                          onChange={editDueDate}
                          tone={overdue ? "rose" : "amber"}
                          title="Editar fecha de vencimiento"
                        />
                      </div>
                      <div className="sm:text-right">
                        <div className="text-sm font-semibold tabular-nums text-zinc-100">
                          <Money value={loan._return} hide={hide} currency={cur} />
                        </div>
                        <div className="text-[11px] text-emerald-400/80 tabular-nums">
                          +<Money value={loan._profit * myShare(loan)} hide={hide} currency={cur} /> ({formatInterest(loan, cur)})
                        </div>
                      </div>
                    </div>
                  </div>
                </EventRow>
              );
            }

            // ── CARGO POR MORA / CICLO ADELANTADO / VENCIMIENTO CUBIERTO ────
            if (ev.type === "mora") {
              const adv = ev.isAdvanced;
              const paid = !!ev.isPaid;
              const advId = adv && ev.advIndex !== undefined ? `adv-${ev.advIndex}` : "";
              const isConfirming = adv && pendingDelete === advId;

              const ringTone = paid ? "border-amber-700/60" : (adv ? "border-purple-700/70" : "border-rose-700/70");
              const bgRing = ev.isCurrent
                ? (paid ? "bg-amber-900/40" : (adv ? "bg-purple-900/60" : "bg-rose-900/60"))
                : (paid ? "bg-amber-950/60" : (adv ? "bg-purple-950/60" : "bg-rose-950/60"));
              const dotBg = paid ? "bg-amber-400" : (adv ? "bg-purple-500" : "bg-rose-500");
              const textTone = paid ? "text-amber-400" : (adv ? "text-purple-300" : "text-rose-400");
              const totalTone = paid ? "text-amber-200" : (adv ? "text-purple-200" : "text-rose-200");
              const addedTone = paid ? "text-emerald-400/80" : (adv ? "text-purple-300" : "text-rose-400");
              const rowBg = ev.isCurrent
                ? (paid ? "bg-amber-950/15 ring-1 ring-amber-900/30" : (adv ? "bg-purple-950/20 ring-1 ring-purple-900/40" : "bg-rose-950/20 ring-1 ring-rose-900/40"))
                : "hover:bg-zinc-900/40";
              const Icon = paid ? CalendarCheck : (adv ? FastForward : AlertTriangle);
              const label = paid
                ? `Vencimiento ${ev.period}${adv ? " (adelantado)" : ""}`
                : (adv ? `Ciclo adelantado ${ev.period}` : `Cargo por mora ${ev.period}`);

              return (
                <EventRow key={`mora-${ev.period}`} ringCls={`${ringTone} ${bgRing}`} dotCls={dotBg} pulse={ev.isCurrent && !paid}>
                  <div className={`rounded-xl px-3 py-2.5 ${rowBg}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className={`flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider ${textTone}`}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                        {ev.isCurrent && !paid && <Badge tone={adv ? "purple" : "danger"}>Actual</Badge>}
                        {paid && <Badge tone="success">Cubierto</Badge>}
                      </div>
                      {adv && ev.advIndex !== undefined && (
                        isConfirming
                          ? <ConfirmDelete onConfirm={() => deleteAdvance(ev.advIndex!)} onCancel={() => setPendingDelete(null)} />
                          : (
                            <IconAction tone="rose" title="Eliminar adelanto" onClick={() => setPendingDelete(advId)}>
                              <X className="h-3.5 w-3.5" />
                            </IconAction>
                          )
                      )}
                    </div>
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
                      <div className="text-[11px] text-zinc-500">
                        {adv && ev.advIndex !== undefined ? (
                          <DateInput
                            value={ev.date}
                            onChange={(v) => editAdvanceDate(ev.advIndex!, v)}
                            tone={paid ? "amber" : "purple"}
                            title="Cambiar la fecha del adelanto"
                          />
                        ) : (
                          <span className="tabular-nums">{formatDate(ev.date)}</span>
                        )}
                        {!adv && (
                          <div className="mt-0.5 text-[10px] text-zinc-600">
                            Usá "Extender" para mover esta fecha
                          </div>
                        )}
                      </div>
                      <div className="sm:text-right">
                        <div className={`text-sm font-semibold tabular-nums ${totalTone}`}>
                          <Money value={ev.total} hide={hide} currency={cur} />
                        </div>
                        <div className={`text-[11px] tabular-nums font-medium ${addedTone}`}>
                          +<Money value={ev.added} hide={hide} currency={cur} /> ({formatInterest(loan, cur)})
                        </div>
                      </div>
                    </div>
                  </div>
                </EventRow>
              );
            }

            // ── PAGO RECIBIDO ───────────────────────────────────────────────
            if (ev.type === "payment") {
              const canMoveDown = currentCompoundPeriods > 0 && ev.timelinePos < currentCompoundPeriods;
              const canMoveUp = ev.timelinePos > 0;
              const isReordered = ev.timelinePos > 0;
              const payId = `pay-${ev.id}`;
              const isConfirmingDelete = pendingDelete === payId;
              const isEditing = editingPaymentId === ev.id;

              return (
                <EventRow
                  key={ev.id}
                  ringCls={isReordered ? "border-amber-700/60 bg-amber-950/80" : "border-emerald-700/60 bg-emerald-950/80"}
                  dotCls={isReordered ? "bg-amber-400" : "bg-emerald-400"}
                >
                  <div className={`rounded-xl px-3 py-2.5 ring-1 ${isReordered ? "bg-amber-950/10 ring-amber-900/30" : "bg-emerald-950/10 ring-emerald-900/30"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className={`flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider ${isReordered ? "text-amber-400" : "text-emerald-400"}`}>
                        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                        Pago recibido
                        {isReordered && <Badge tone="warning">Reordenado</Badge>}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {isConfirmingDelete ? (
                          <ConfirmDelete onConfirm={() => deletePayment(ev.id)} onCancel={() => setPendingDelete(null)} />
                        ) : isEditing ? (
                          <>
                            <IconAction title="Guardar cambios" onClick={saveEditPayment}>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            </IconAction>
                            <IconAction title="Cancelar" onClick={() => setEditingPaymentId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </IconAction>
                          </>
                        ) : (
                          <>
                            {(canMoveUp || canMoveDown) && (
                              <div className="flex flex-col gap-0.5">
                                <IconAction disabled={!canMoveUp} title="Mover antes del cargo anterior" onClick={() => movePayment(ev.id, "up")}>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </IconAction>
                                <IconAction disabled={!canMoveDown} title="Mover después del próximo cargo" onClick={() => movePayment(ev.id, "down")}>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </IconAction>
                              </div>
                            )}
                            <IconAction title="Editar pago" onClick={() => openEditPayment(ev.id, ev.date, ev.amount, ev.note)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </IconAction>
                            <IconAction tone="rose" title="Eliminar pago" onClick={() => setPendingDelete(payId)}>
                              <X className="h-3.5 w-3.5" />
                            </IconAction>
                          </>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2 sm:grid-cols-[auto_1fr]">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] uppercase tracking-wider text-emerald-500/80">Fecha</label>
                          <DateInput
                            value={paymentDraft.date}
                            onChange={(v) => setPaymentDraft((d) => ({ ...d, date: v }))}
                            tone="emerald"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] uppercase tracking-wider text-emerald-500/80">Monto</label>
                          <input
                            type="number" inputMode="decimal"
                            value={paymentDraft.amount}
                            onChange={(e) => setPaymentDraft((d) => ({ ...d, amount: e.target.value }))}
                            className="w-24 rounded border border-emerald-800/40 bg-emerald-950/30 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-200 outline-none focus:border-emerald-600"
                          />
                        </div>
                        <input
                          type="text" placeholder="Nota (opcional)"
                          value={paymentDraft.note}
                          onChange={(e) => setPaymentDraft((d) => ({ ...d, note: e.target.value }))}
                          className="rounded border border-emerald-800/40 bg-emerald-950/30 px-2 py-1 text-[11px] text-emerald-100 placeholder:text-emerald-800 outline-none focus:border-emerald-600 sm:col-span-2"
                        />
                      </div>
                    ) : (
                      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
                        <div className="min-w-0 text-[11px] text-zinc-500">
                          <span className="tabular-nums">{formatDate(ev.date)}</span>
                          {ev.note && <span className="ml-1 text-zinc-400"> · {ev.note}</span>}
                        </div>
                        <div className="sm:text-right">
                          <div className="text-sm font-semibold tabular-nums text-emerald-300">
                            <Money value={ev.amount} hide={hide} currency={cur} />
                          </div>
                          {ev.interestInPayment > 0.01 && (
                            <div className="text-[11px] text-zinc-500 tabular-nums">
                              Interés cubierto:{" "}
                              <span className="text-amber-400"><Money value={ev.interestInPayment} hide={hide} currency={cur} /></span>
                              <span className="text-zinc-600"> / <Money value={ev.totalInterestAccrued} hide={hide} currency={cur} /></span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </EventRow>
              );
            }

            return null;
          })}

          {/* ── PROYECCIÓN DEL PRÓXIMO CICLO ───────────────────────────── */}
          {nextOverdueDate && (
            <EventRow
              ringCls="border-dashed border-zinc-700/60 bg-zinc-900"
              dotCls="bg-transparent"
            >
              <div className="rounded-xl border border-dashed border-zinc-800/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <Clock className="h-3.5 w-3.5" />
                  Próximo cargo proyectado
                </div>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
                  <div className="text-[11px] text-zinc-600 tabular-nums">
                    {formatDate(nextOverdueDate)} · si no se paga
                  </div>
                  <div className="sm:text-right">
                    <div className="text-sm font-semibold tabular-nums text-zinc-500">
                      +<Money value={nextOverdueAdded} hide={hide} currency={cur} />
                    </div>
                    <div className="text-[11px] text-zinc-600">
                      {loan.interestMode === "fixed" ? "(monto fijo)" : `(${formatInterest(loan, cur)} adicional)`}
                    </div>
                  </div>
                </div>
              </div>
            </EventRow>
          )}

        </div>
      </div>
    </div>
  );
}
