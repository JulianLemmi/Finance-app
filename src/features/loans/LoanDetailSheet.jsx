import { useState, useMemo } from "react";
import {
  Edit2, RefreshCw, Layers, Banknote, Trash2, Calendar, CalendarRange,
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

  const onRefinance = () => {
    const newDue = addDays(todayISO(), 30);
    dispatch({
      type: "UPDATE_LOAN",
      payload: {
        id: loan.id, status: "refinanced",
        notes: (loan.notes || "") + `\n[${todayISO()}] Refinanciado a 30 días desde ${loan.dueDate}.`,
      },
    });
    dispatch({
      type: "ADD_LOAN",
      payload: {
        ...loan, id: uid("loan"), refinancedFromId: loan.id,
        startDate: todayISO(), dueDate: newDue, paymentType: "30",
        payments: [], status: "active", amount: loan._remaining,
        notes: `Refinanciación del préstamo previo (${formatDate(loan.dueDate)}).`,
        createdAt: Date.now(),
      },
    });
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
              <Button variant="secondary" Icon={Layers} onClick={onRefinance}
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
              { label: "Capital", value: <Money value={loan.amount} hide={hide} currency={cur} />, cls: "text-zinc-100" },
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
              <div className="flex items-center justify-between rounded-2xl border border-rose-900/40 bg-rose-950/20 px-4 py-3">
                <div className="text-sm text-rose-200">¿Eliminar definitivamente?</div>
                <div className="flex gap-2">
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
