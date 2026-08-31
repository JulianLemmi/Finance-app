// Vista principal de un préstamo individual. Muestra resumen financiero, estado,
// timeline, historial de pagos y contactos. Contiene los flujos de extender,
// refinanciar y eliminar el préstamo, cada uno con su propio sheet interno.
import { useState, useMemo } from "react";
import {
  Edit2, RefreshCw, Layers, Banknote, Trash2, Calendar, CalendarRange, CalendarClock, TrendingUp,
  MessageSquare, Plus, X, Users, Car as CarIcon, FastForward, Undo2,
} from "lucide-react";
import { todayISO, addDays, addCalendarMonths, formatDate, formatShortDate, daysBetween, getNextRenewalDate, getLoanCycleDays, loanElapsedPeriods, formatInterest, myShare, formatMoney, advancedCycles } from "../../lib/utils.js";
import { nextPeriodInterest } from "../../lib/calcs.js";
import { GUARANTY_TYPES } from "../../lib/constants.js";
import { useApp } from "../../store/index.js";
import { uid } from "../../lib/utils.js";
import {
  Sheet, Button, Input, Card, Badge, StatusBadge, SectionTitle,
  Money, AnimatedMoney, ProgressBar,
} from "../../components/ui.jsx";
import LoanChain from "./LoanChain.jsx";
import PaymentSheet from "./PaymentSheet.jsx";
import LoanFormSheet from "./LoanFormSheet.jsx";
import LoanTimeline from "./LoanTimeline.jsx";
import PaymentHistory from "./PaymentHistory.jsx";
import PhotoGallery from "./PhotoGallery.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanDetailSheetProps {
  open: boolean;
  onClose: () => void;
  loanId: string;
}

export default function LoanDetailSheet({ open, onClose, loanId }: LoanDetailSheetProps) {
  const { state, dispatch, derived, userId } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("15");
  const [refinanceOpen, setRefinanceOpen] = useState(false);

  const [contactNote, setContactNote] = useState("");
  const [contactDate, setContactDate] = useState(() => todayISO());
  const [showContactForm, setShowContactForm] = useState(false);

  const [parkingAmount, setParkingAmount] = useState("");
  const [parkingDate, setParkingDate] = useState(() => todayISO());
  const [parkingNote, setParkingNote] = useState("");
  const [showParkingForm, setShowParkingForm] = useState(false);

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceDate, setAdvanceDate] = useState(() => todayISO());

  const loan = useMemo(
    () => derived.loansResolved.find((l) => l.id === loanId),
    [derived.loansResolved, loanId]
  );

  if (!loan) return null;

  // Mismo cálculo que usan `getNextRenewalDate`, `remainingDebt` y el resto de la app
  // (prioriza paymentType/customDays sobre la distancia cruda entre fechas): si acá se
  // calculara distinto, la línea de tiempo mostraría vencimientos que no coinciden con
  // el mapa de vencimientos ni con "Próximos vencimientos" de Inicio.
  const loanTermDays = getLoanCycleDays(loan);
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const daysOverdue =
    loan._status === "overdue" ? Math.max(0, daysBetween(loan.dueDate, todayISO())) : 0;
  const advCycles = advancedCycles(loan);
  // Próximo vencimiento: en los vencidos y en los que tienen adelantos manuales el próximo
  // se corre según ciclos ya devengados; en los activos sin adelantos es el propio dueDate.
  const nextDueDate = (loan._status === "overdue" || advCycles > 0) ? getNextRenewalDate(loan) : loan.dueDate;
  // Ciclos ya capitalizados (los naturales por vencimiento + los adelantados a mano):
  // define cuántas filas de "mora" se ven en la timeline.
  const currentCompoundPeriods = (daysOverdue > 0 ? loanElapsedPeriods(loan, loan.dueDate, todayISO()) : 0) + advCycles;
  const monthsOverdue = Math.floor(daysOverdue / 30);
  const extraDaysOverdue = daysOverdue % 30;
  const overdueLabel =
    monthsOverdue > 0
      ? `${monthsOverdue} ${monthsOverdue === 1 ? "mes" : "meses"}${extraDaysOverdue > 0 ? ` ${extraDaysOverdue}d` : ""}`
      : `${daysOverdue}d`;

  const onExtendConfirm = () => {
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) return;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, dueDate: addDays(loan.dueDate, days) } });
    setExtendOpen(false);
  };

  const onAdvanceConfirm = () => {
    if (!advanceDate) return;
    dispatch({ type: "ADVANCE_CYCLE", payload: { loanId: loan.id, date: advanceDate } });
    setAdvanceOpen(false);
    setAdvanceDate(todayISO());
  };

  const onUndoAdvance = () => {
    dispatch({ type: "UNDO_ADVANCE_CYCLE", payload: { loanId: loan.id } });
  };

  const onDelete = () => {
    dispatch({ type: "DELETE_LOAN", payload: loan.id });
    onClose();
  };

  const loanChain = useMemo<ResolvedLoan[]>(() => {
    const all = derived.loansResolved;
    let root: ResolvedLoan = loan;
    while (root.refinancedFromId) {
      const parent = all.find((l) => l.id === root.refinancedFromId);
      if (!parent) break;
      root = parent;
    }
    const chain: ResolvedLoan[] = [root];
    let node = root;
    while (true) {
      const next = all.find((l) => l.refinancedFromId === node.id);
      if (!next) break;
      chain.push(next);
      node = next;
    }
    return chain;
  }, [loan, derived.loansResolved]);

  const G = GUARANTY_TYPES[loan.guarantyType as keyof typeof GUARANTY_TYPES] || GUARANTY_TYPES.other;

  const parkingFee = Number(loan.parkingFee || 0);
  const parkingActive = parkingFee > 0;
  const parkingMonthsAccrued = parkingActive
    ? Math.max(1, 1 + Math.floor(Math.max(0, daysBetween(loan.startDate, todayISO())) / 30))
    : 0;
  const parkingAccrued = parkingFee * parkingMonthsAccrued;
  const parkingCollected = (loan.parkingPayments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
  const parkingPending = Math.max(0, parkingAccrued - parkingCollected);

  const addParkingPayment = () => {
    const amount = Number(parkingAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    dispatch({
      type: "ADD_PARKING_PAYMENT",
      payload: {
        loanId: loan.id,
        payment: { id: uid("pkg"), amount, date: parkingDate, note: parkingNote.trim() || undefined, createdAt: Date.now() },
      },
    });
    setParkingAmount(""); setParkingNote(""); setParkingDate(todayISO());
    setShowParkingForm(false);
  };

  const addContact = () => {
    if (!contactNote.trim()) return;
    dispatch({
      type: "ADD_CONTACT",
      payload: {
        loanId: loan.id,
        contact: { id: uid("ct"), date: contactDate, note: contactNote.trim(), createdAt: Date.now() },
      },
    });
    setContactNote("");
    setShowContactForm(false);
  };

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
              <Button variant="secondary" Icon={FastForward}
                onClick={() => { setAdvanceDate(todayISO()); setAdvanceOpen(true); }}
                disabled={loan._status === "paid" || loan._status === "refinanced" || loan.noDueDate}>
                Adelantar
              </Button>
              <Button variant="secondary" Icon={RefreshCw} onClick={() => { setExtendDays("15"); setExtendOpen(true); }}>
                Extender
              </Button>
              <Button variant="secondary" Icon={Layers} onClick={() => setRefinanceOpen(true)}
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
          <div className="fa-grain relative overflow-hidden rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/60 to-zinc-950 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={loan._status} />
                {loan.sharedWith && (
                  <Badge tone="info">
                    <Users className="h-3 w-3" />
                    {loan.sharedWith} · mío {Math.round(myShare(loan) * 100)}%
                  </Badge>
                )}
                {advCycles > 0 && (
                  <Badge tone="purple">
                    <FastForward className="h-3 w-3" />
                    +{advCycles} adelantado{advCycles > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
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
              <AnimatedMoney value={loan._remaining} hide={hide} currency={cur} duration={800} />
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
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <span className="whitespace-nowrap">
                <span className="text-zinc-500">Inicio </span>
                <span className="font-medium text-zinc-200">{formatDate(loan.startDate)}</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span className="whitespace-nowrap">
                <span className="text-zinc-500">Plazo </span>
                <span className="font-medium text-zinc-200">{loanTermDays} días</span>
              </span>
              <span className="text-zinc-700">·</span>
              <span className="whitespace-nowrap">
                <span className="text-zinc-500">Vence </span>
                <span className={`font-medium ${loan._status === "overdue" ? "text-rose-400" : "text-zinc-200"}`}>
                  {formatDate(loan.dueDate)}
                </span>
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Capital inicial", value: <Money value={loan.amount} hide={hide} currency={cur} />, cls: "text-zinc-100" },
              { label: "Próx. ganancia", value: <Money value={loan._nextProfit * myShare(loan)} hide={hide} currency={cur} />, cls: "text-emerald-400" },
              { label: "Interés", value: formatInterest(loan, cur), cls: "text-zinc-100" },
              { label: "Vence", value: formatDate(nextDueDate), cls: loan._status === "overdue" ? "text-rose-400" : "text-zinc-100" },
            ].map(({ label, value, cls }) => (
              <Card key={label} className="p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
                <div className={`mt-1 text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
              </Card>
            ))}
          </div>

          {/* ── Tu parte (préstamo compartido) ── */}
          {loan.sharedWith && (
            <div className="rounded-2xl border border-blue-900/30 bg-blue-950/15 p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-blue-300/80">
                <Users className="h-3 w-3" />
                Tu parte ({Math.round(myShare(loan) * 100)}%)
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-zinc-500 text-xs">Tu capital</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    <Money value={Number(loan.amount) * myShare(loan)} hide={hide} currency={cur} />
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs">Tu ganancia esperada</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-emerald-400">
                    <Money value={loan._profit * myShare(loan)} hide={hide} currency={cur} />
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs">Cobrado tuyo</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    <Money value={loan._paid * myShare(loan)} hide={hide} currency={cur} />
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs">Deuda pendiente tuya</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    <Money value={loan._remaining * myShare(loan)} hide={hide} currency={cur} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Estacionamiento ── */}
          {parkingActive && (
            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400">
                  <CarIcon className="h-3 w-3" />
                  Estacionamiento
                  {loan.parkingRecipient && (
                    <span className="normal-case tracking-normal text-zinc-500">
                      · para {loan.parkingRecipient}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setShowParkingForm((v) => !v); setParkingAmount(String(parkingFee)); setParkingNote(""); setParkingDate(todayISO()); }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                >
                  {showParkingForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {showParkingForm ? "Cancelar" : "Registrar cobro"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-zinc-500 text-xs">Cargo mensual</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    {formatMoney(parkingFee, hide, cur)}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs">Devengado ({parkingMonthsAccrued}m)</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                    {formatMoney(parkingAccrued, hide, cur)}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs">Cobrado</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-emerald-400">
                    {formatMoney(parkingCollected, hide, cur)}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs">Pendiente</div>
                  <div className={`mt-0.5 font-semibold tabular-nums ${parkingPending > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                    {formatMoney(parkingPending, hide, cur)}
                  </div>
                </div>
              </div>
              {showParkingForm && (
                <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Monto" type="number" inputMode="decimal" Icon={Banknote}
                      value={parkingAmount}
                      onChange={(e) => setParkingAmount(e.target.value)} />
                    <Input label="Fecha" type="date" Icon={Calendar}
                      value={parkingDate}
                      onChange={(e) => setParkingDate(e.target.value)} />
                  </div>
                  <input
                    placeholder="Nota (opcional)"
                    value={parkingNote}
                    onChange={(e) => setParkingNote(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700/60 focus:ring-1 focus:ring-amber-700/40"
                  />
                  <div className="flex justify-end">
                    <Button variant="bronze" size="sm" onClick={addParkingPayment} disabled={!(Number(parkingAmount) > 0)}>
                      Guardar cobro
                    </Button>
                  </div>
                </div>
              )}
              {(loan.parkingPayments || []).length > 0 && (
                <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
                  {[...(loan.parkingPayments || [])]
                    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                    .map((p) => (
                      <div key={p.id} className="group flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium tabular-nums text-zinc-200">
                            {formatMoney(Number(p.amount), hide, cur)}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {formatShortDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => dispatch({ type: "DELETE_PARKING_PAYMENT", payload: { loanId: loan.id, paymentId: p.id ?? "" } })}
                          className="hidden shrink-0 rounded-lg p-1 text-zinc-600 transition-colors hover:text-rose-400 group-hover:block"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          <LoanTimeline loan={loan} currentCompoundPeriods={currentCompoundPeriods} />

          <LoanChain
            chain={loanChain}
            currentLoanId={loan.id}
            onOpenLoan={(id) =>
              dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })
            }
          />

          <PaymentHistory loan={loan} />

          {/* ── Historial de contactos ── */}
          <div>
            <SectionTitle action={
              <button
                onClick={() => { setShowContactForm((v) => !v); setContactNote(""); setContactDate(todayISO()); }}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                {showContactForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {showContactForm ? "Cancelar" : "Agregar"}
              </button>
            }>
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
                Contactos
                {(loan.contacts || []).length > 0 && (
                  <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-400">
                    {(loan.contacts || []).length}
                  </span>
                )}
              </span>
            </SectionTitle>

            {showContactForm && (
              <div className="mb-3 space-y-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-3">
                <div className="flex gap-2">
                  <input
                    placeholder="¿Qué pasó? (llamó, prometió pagar, sin respuesta...)"
                    value={contactNote}
                    onChange={(e) => setContactNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addContact(); }}
                    className="flex-1 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700/60 focus:ring-1 focus:ring-amber-700/40"
                  />
                  <input
                    type="date"
                    value={contactDate}
                    onChange={(e) => setContactDate(e.target.value)}
                    className="w-36 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-amber-700/60"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    disabled={!contactNote.trim()}
                    onClick={addContact}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-900/40 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-900/60 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {(loan.contacts || []).length === 0 && !showContactForm ? (
              <Card className="p-4 text-sm text-zinc-600">Sin registros de contacto aún.</Card>
            ) : (
              <Card className="divide-y divide-zinc-800/60">
                {[...(loan.contacts || [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map((c) => (
                  <div key={c.id} className="group flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200">{c.note}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{formatShortDate(c.date)}</p>
                    </div>
                    <button
                      onClick={() => dispatch({ type: "DELETE_CONTACT", payload: { loanId: loan.id, contactId: c.id } })}
                      className="hidden shrink-0 rounded-lg p-1 text-zinc-600 transition-colors hover:text-rose-400 group-hover:block"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </div>

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
      <LoanFormSheet
        open={refinanceOpen}
        onClose={() => { setRefinanceOpen(false); onClose(); }}
        refinancingFrom={refinanceOpen ? loan : null}
      />

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

      <Sheet open={advanceOpen} onClose={() => setAdvanceOpen(false)}
        title="Adelantar vencimiento"
        subtitle={`Devengar el próximo interés de ${loan.clientName} antes de la fecha`}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              Se sumará{" "}
              <span className="font-medium text-amber-400 tabular-nums">
                <Money value={nextPeriodInterest(loan)} hide={hide} currency={cur} />
              </span>
              {" "}a la deuda
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setAdvanceOpen(false)}>Cancelar</Button>
              <Button variant="bronze" Icon={FastForward} onClick={onAdvanceConfirm} disabled={!advanceDate}>
                Confirmar adelanto
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-purple-900/30 bg-purple-950/15 p-4 text-xs text-purple-200/80">
            Usalo cuando el cliente quiere pagar un vencimiento antes de que llegue la fecha.
            Se capitaliza el próximo ciclo como si ya hubiera vencido y el siguiente
            vencimiento pasa a la fecha posterior.
          </div>
          <Input label="Fecha del adelanto" type="date" Icon={Calendar}
            value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Deuda actual</div>
              <div className="mt-1 font-semibold tabular-nums text-zinc-100">
                <Money value={loan._remaining} hide={hide} currency={cur} />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Interés a devengar</div>
              <div className="mt-1 font-semibold tabular-nums text-amber-400">
                +<Money value={nextPeriodInterest(loan)} hide={hide} currency={cur} />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Próximo vencimiento actual</div>
              <div className="mt-1 font-medium text-zinc-300">{formatDate(nextDueDate)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Pasará a</div>
              <div className="mt-1 font-medium text-purple-300">
                {formatDate(loanPeriodDateAfterAdvance(loan, nextDueDate))}
              </div>
            </div>
          </div>
          {advCycles > 0 && (
            <button onClick={onUndoAdvance}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300">
              <Undo2 className="h-3.5 w-3.5" />
              Deshacer último adelanto ({advCycles} en total)
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}

// Fecha del próximo vencimiento si sumáramos un adelanto más. Se calcula avanzando un
// ciclo desde el próximo actual, respetando `paymentType` (mes calendario para "30").
function loanPeriodDateAfterAdvance(
  loan: { paymentType: string; customDays?: number; startDate: string; dueDate: string },
  nextDueDate: string,
): string {
  if (loan.paymentType === "30") return addCalendarMonths(nextDueDate, 1);
  const term = getLoanCycleDays(loan as never);
  return addDays(nextDueDate, term);
}
