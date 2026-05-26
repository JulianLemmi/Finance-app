import { useState, useMemo } from "react";
import {
  Edit2, RefreshCw, Layers, Banknote, Trash2, Calendar, CalendarRange, CalendarClock, TrendingUp,
} from "lucide-react";
import { todayISO, addDays, formatDate, formatShortDate, daysBetween } from "../../lib/utils.js";
import { GUARANTY_TYPES } from "../../lib/constants.js";
import { useApp } from "../../store/index.js";
import { uid } from "../../lib/utils.js";
import {
  Sheet, Button, Input, Card, Badge, StatusBadge, SectionTitle,
  Money, ProgressBar,
} from "../../components/ui.jsx";
import LoanChain from "./LoanChain.jsx";
import PaymentSheet from "./PaymentSheet.jsx";
import LoanFormSheet from "./LoanFormSheet.jsx";
import LoanTimeline from "./LoanTimeline.jsx";
import PaymentHistory from "./PaymentHistory.jsx";
import PhotoGallery from "./PhotoGallery.jsx";

export default function LoanDetailSheet({ open, onClose, loanId }) {
  const { state, dispatch, derived, userId } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("15");
  const [refinanceOpen, setRefinanceOpen] = useState(false);
  const [refinanceForm, setRefinanceForm] = useState({ amount: "", rate: "", days: "30" });

  const loan = useMemo(
    () => derived.loansResolved.find((l) => l.id === loanId),
    [derived.loansResolved, loanId]
  );

  if (!loan) return null;

  const loanTermDays = Math.max(1, daysBetween(loan.startDate, loan.dueDate) || 30);
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const daysOverdue = loan._status === "overdue"
    ? Math.max(0, daysBetween(loan.dueDate, todayISO()))
    : 0;
  const currentCompoundPeriods = daysOverdue > 0 ? Math.floor(daysOverdue / loanTermDays) : 0;
  const monthsOverdue = Math.floor(daysOverdue / 30);
  const extraDaysOverdue = daysOverdue % 30;
  const overdueLabel = monthsOverdue > 0
    ? `${monthsOverdue} ${monthsOverdue === 1 ? "mes" : "meses"}${extraDaysOverdue > 0 ? ` ${extraDaysOverdue}d` : ""}`
    : `${daysOverdue}d`;

  const openRefinance = () => {
    setRefinanceForm({
      amount: String(Math.round(loan._remaining)),
      rate: String(loan.interestRate),
      days: "30",
    });
    setRefinanceOpen(true);
  };

  const onConfirmRefinance = () => {
    const amount = Number(refinanceForm.amount);
    const rate = Number(refinanceForm.rate);
    const days = Number(refinanceForm.days);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!Number.isFinite(rate) || rate < 0) return;
    if (!Number.isFinite(days) || days <= 0) return;

    const newDue = addDays(todayISO(), days);
    dispatch({
      type: "UPDATE_LOAN",
      payload: {
        id: loan.id, status: "refinanced",
        notes: (loan.notes || "") + `\n[${todayISO()}] Refinanciado a ${days} días desde ${loan.dueDate}.`,
      },
    });
    dispatch({
      type: "ADD_LOAN",
      payload: {
        ...loan, id: uid("loan"), refinancedFromId: loan.id,
        startDate: todayISO(), dueDate: newDue,
        paymentType: days === 15 ? "15" : days === 30 ? "30" : "custom",
        customDays: days,
        payments: [], status: "active", amount, interestRate: rate,
        notes: `Refinanciación del préstamo previo (${formatDate(loan.dueDate)}).`,
        createdAt: Date.now(),
      },
    });
    setRefinanceOpen(false);
    onClose();
  };

  const onExtendConfirm = () => {
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) return;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, dueDate: addDays(loan.dueDate, days) } });
    setExtendOpen(false);
  };

  const onDelete = () => {
    dispatch({ type: "DELETE_LOAN", payload: loan.id });
    onClose();
  };

  const loanChain = useMemo(() => {
    const all = derived.loansResolved;
    let root = loan;
    while (root.refinancedFromId) {
      const parent = all.find((l) => l.id === root.refinancedFromId);
      if (!parent) break;
      root = parent;
    }
    const chain = [root];
    let cur = root;
    while (true) {
      const next = all.find((l) => l.refinancedFromId === cur.id);
      if (!next) break;
      chain.push(next);
      cur = next;
    }
    return chain;
  }, [loan, derived.loansResolved]);

  const G = GUARANTY_TYPES[loan.guarantyType] || GUARANTY_TYPES.other;

  return (
    <>
      <Sheet
        open={open} onClose={onClose}
        title={loan.clientName}
        subtitle={loan.alias || `Préstamo · ${formatDate(loan.startDate)}`}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" Icon={Edit2} onClick={() => setEditOpen(true)}>Editar</Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" Icon={RefreshCw} onClick={() => { setExtendDays("15"); setExtendOpen(true); }}>
                Extender
              </Button>
              <Button variant="secondary" Icon={Layers} onClick={openRefinance}
                disabled={loan._status === "paid" || loan._status === "refinanced"}>
                Refinanciar
              </Button>
              <Button variant="bronze" Icon={Banknote} onClick={() => setPaymentOpen(true)}
                disabled={loan._remaining <= 0}>
                Registrar pago
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Summary card */}
          <div className="rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/60 to-zinc-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <StatusBadge status={loan._status} />
              <Badge tone="bronze">
                <G.Icon className="h-3 w-3" />
                {G.label}
              </Badge>
            </div>
            {loan._status === "overdue" && daysOverdue > 0 && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-rose-900/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-medium text-rose-300">
                <CalendarClock className="h-3 w-3" />
                Vencido hace {overdueLabel}
              </div>
            )}
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Deuda restante</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
              <Money value={loan._remaining} hide={hide} currency={cur} />
            </div>
            <div className="mt-3">
              <ProgressBar value={loan._progress} tone={loan._status === "overdue" ? "rose" : "bronze"} />
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Cobrado{" "}
                  <Money value={loan._paid} hide={hide} currency={cur} className="text-zinc-300" />
                </span>
                <span>
                  Total acumulado{" "}
                  <Money value={loan._compoundReturn} hide={hide} currency={cur}
                    className={loan._compoundReturn > loan._return ? "text-rose-300" : "text-zinc-300"} />
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <span className="text-zinc-500">Inicio</span>
              <span className="font-medium text-zinc-200">{formatDate(loan.startDate)}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-500">Plazo</span>
              <span className="font-medium text-zinc-200">{loanTermDays} días</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-500">Vence</span>
              <span className={`font-medium ${loan._status === "overdue" ? "text-rose-400" : "text-zinc-200"}`}>
                {formatDate(loan.dueDate)}
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Capital inicial", value: <Money value={loan.amount} hide={hide} currency={cur} />, cls: "text-zinc-100" },
              { label: "Ganancia", value: <Money value={loan._profit} hide={hide} currency={cur} />, cls: "text-emerald-400" },
              { label: "Interés", value: `${Number(loan.interestRate).toFixed(1)}%`, cls: "text-zinc-100" },
              { label: "Vence", value: formatShortDate(loan.dueDate), cls: loan._status === "overdue" ? "text-rose-400" : "text-zinc-100" },
            ].map(({ label, value, cls }) => (
              <Card key={label} className="p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
                <div className={`mt-1 text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
              </Card>
            ))}
          </div>

          <LoanTimeline
            loan={loan}
            currentCompoundPeriods={currentCompoundPeriods}
            loanTermDays={loanTermDays}
          />

          <LoanChain
            chain={loanChain}
            currentLoanId={loan.id}
            onOpenLoan={(id) =>
              dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })
            }
          />

          <PaymentHistory loan={loan} />

          {loan.notes && (
            <div>
              <SectionTitle>Notas</SectionTitle>
              <Card className="whitespace-pre-wrap p-4 text-sm text-zinc-300">{loan.notes}</Card>
            </div>
          )}

          <PhotoGallery loan={loan} userId={userId} />

          {/* Delete */}
          <div className="pt-2">
            {confirmDelete ? (
              <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 px-4 py-3">
                <div className="text-sm text-rose-200">¿Eliminar definitivamente?</div>
                {loan._remaining > 0 && (loan._status === "active" || loan._status === "overdue") && (
                  <div className="mt-2 rounded-xl border border-rose-700/40 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
                    Préstamo {loan._status === "overdue" ? "atrasado" : "activo"} con saldo pendiente de{" "}
                    <span className="font-semibold tabular-nums">
                      <Money value={loan._remaining} hide={hide} currency={cur} />
                    </span>
                    . Esta acción no se puede deshacer.
                  </div>
                )}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                  <Button variant="danger" size="sm" Icon={Trash2} onClick={onDelete}>Eliminar</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-1 text-xs text-zinc-500 hover:text-rose-400">
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar préstamo
              </button>
            )}
          </div>
        </div>
      </Sheet>

      <PaymentSheet open={paymentOpen} onClose={() => setPaymentOpen(false)} loan={loan} />
      <LoanFormSheet open={editOpen} onClose={() => setEditOpen(false)} editingLoan={editOpen ? loan : null} />

      <Sheet open={refinanceOpen} onClose={() => setRefinanceOpen(false)}
        title="Refinanciar préstamo"
        subtitle={`Términos iniciales pre-cargados de ${loan.clientName}`}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              Nueva ganancia{" "}
              <span className="font-medium text-emerald-400 tabular-nums">
                <Money value={(Number(refinanceForm.amount || 0) * Number(refinanceForm.rate || 0)) / 100} hide={hide} currency={cur} />
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRefinanceOpen(false)}>Cancelar</Button>
              <Button variant="bronze" onClick={onConfirmRefinance}
                disabled={
                  !(Number(refinanceForm.amount) > 0) ||
                  !(Number(refinanceForm.rate) >= 0) ||
                  !(Number(refinanceForm.days) > 0)
                }>
                Confirmar refinanciación
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-900/30 bg-amber-950/15 p-4 text-xs text-amber-200/80">
            El préstamo original se marca como <span className="font-medium text-amber-200">refinanciado</span> y se
            crea uno nuevo con los términos que ajustes acá.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nuevo monto" type="number" inputMode="decimal" Icon={Banknote}
              value={refinanceForm.amount}
              onChange={(e) => setRefinanceForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input label="Tasa de interés (%)" type="number" inputMode="decimal" Icon={TrendingUp}
              value={refinanceForm.rate}
              onChange={(e) => setRefinanceForm((f) => ({ ...f, rate: e.target.value }))} />
          </div>
          <Input label="Plazo (días)" type="number" inputMode="numeric" Icon={Calendar}
            value={refinanceForm.days}
            onChange={(e) => setRefinanceForm((f) => ({ ...f, days: e.target.value }))} />
          <div className="grid grid-cols-3 gap-2">
            {[15, 30, 60].map((d) => (
              <button key={d} type="button"
                onClick={() => setRefinanceForm((f) => ({ ...f, days: String(d) }))}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800">
                {d} días
              </button>
            ))}
          </div>
          {Number(refinanceForm.days) > 0 && (
            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4 text-sm text-zinc-400">
              Nuevo vencimiento:{" "}
              <span className="font-medium text-zinc-100">
                {formatDate(addDays(todayISO(), Number(refinanceForm.days)))}
              </span>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={extendOpen} onClose={() => setExtendOpen(false)}
        title="Extender préstamo" subtitle={`Vence el ${formatDate(loan.dueDate)}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExtendOpen(false)}>Cancelar</Button>
            <Button variant="bronze" onClick={onExtendConfirm} disabled={!(Number(extendDays) > 0)}>
              Confirmar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Días a extender" type="number" inputMode="numeric" placeholder="15"
            value={extendDays} onChange={(e) => setExtendDays(e.target.value)} Icon={Calendar} />
          <div className="grid grid-cols-3 gap-2">
            {[7, 15, 30].map((d) => (
              <button key={d} onClick={() => setExtendDays(String(d))}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800">
                {d} días
              </button>
            ))}
          </div>
          {Number(extendDays) > 0 && (
            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4 text-sm text-zinc-400">
              Nuevo vencimiento:{" "}
              <span className="font-medium text-zinc-100">
                {formatDate(addDays(loan.dueDate, Number(extendDays)))}
              </span>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
