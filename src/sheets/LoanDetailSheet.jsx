import { useState, useMemo, useRef } from "react";
import {
  Edit2, RefreshCw, Layers, Banknote, Camera, X, ArrowDown,
  Check, Receipt, Trash2, Calendar,
} from "lucide-react";
import { uid, todayISO, addDays, formatDate, formatShortDate } from "../lib/utils.js";
import { GUARANTY_TYPES } from "../lib/constants.js";
import { compoundPeriods } from "../lib/calcs.js";
import { uploadPhoto, deletePhoto } from "../lib/storage.js";
import { useApp } from "../store/index.js";
import {
  Sheet, Button, Input, Card, Badge, StatusBadge, SectionTitle,
  EmptyState, Money, ProgressBar,
} from "../components/ui.jsx";
import PaymentSheet from "./PaymentSheet.jsx";
import LoanFormSheet from "./LoanFormSheet.jsx";

export default function LoanDetailSheet({ open, onClose, loanId }) {
  const { state, dispatch, derived } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("15");
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef(null);

  const loan = useMemo(
    () => derived.loansResolved.find((l) => l.id === loanId),
    [derived.loansResolved, loanId]
  );

  if (!loan) return null;

  const userId = state.userId;

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

  const onMarkPaid = () => {
    const r = loan._remaining;
    if (r > 0) {
      dispatch({
        type: "ADD_PAYMENT",
        payload: {
          loanId: loan.id,
          payment: { id: uid("pay"), amount: r, date: todayISO(), note: "Pago final", createdAt: Date.now() },
        },
      });
    }
  };

  const onDelete = () => {
    dispatch({ type: "DELETE_LOAN", payload: loan.id });
    onClose();
  };

  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const newPhotos = await Promise.all(
        Array.from(files).map((file) => uploadPhoto(userId, loan.id, file))
      );
      dispatch({
        type: "UPDATE_LOAN",
        payload: { id: loan.id, photos: [...(loan.photos || []), ...newPhotos] },
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photo) => {
    await deletePhoto(photo);
    dispatch({
      type: "UPDATE_LOAN",
      payload: { id: loan.id, photos: (loan.photos || []).filter((p) => p.id !== photo.id) },
    });
  };

  const G = GUARANTY_TYPES[loan.guarantyType] || GUARANTY_TYPES.other;
  const periods = compoundPeriods(loan);

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
              <Money value={loan._remaining} hide={state.settings.hideBalances} currency={state.settings.currency} />
            </div>
            <div className="mt-3">
              <ProgressBar value={loan._progress} tone={loan._status === "overdue" ? "rose" : "bronze"} />
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Cobrado{" "}
                  <Money value={loan._paid} hide={state.settings.hideBalances}
                    currency={state.settings.currency} className="text-zinc-300" />
                </span>
                <span>
                  Total acumulado{" "}
                  <Money value={loan._compoundReturn} hide={state.settings.hideBalances}
                    currency={state.settings.currency}
                    className={loan._compoundReturn > loan._return ? "text-rose-300" : "text-zinc-300"} />
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Capital", value: <Money value={loan.amount} hide={state.settings.hideBalances} currency={state.settings.currency} />, cls: "text-zinc-100" },
              { label: "Ganancia", value: <Money value={loan._profit} hide={state.settings.hideBalances} currency={state.settings.currency} />, cls: "text-emerald-400" },
              { label: "Interés", value: `${Number(loan.interestRate).toFixed(1)}%`, cls: "text-zinc-100" },
              { label: "Vence", value: formatShortDate(loan.dueDate), cls: "text-zinc-100" },
            ].map(({ label, value, cls }) => (
              <Card key={label} className="p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
                <div className={`mt-1 text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
              </Card>
            ))}
          </div>

          {periods.length > 0 && (
            <div>
              <SectionTitle>Acumulación de deuda por período</SectionTitle>
              <Card className="divide-y divide-zinc-800/70 overflow-hidden">
                {periods.map((p) => (
                  <div key={p.period} className={`flex items-center justify-between px-4 py-3 ${p.isCurrent ? "bg-amber-950/20" : ""}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">Período {p.period}</span>
                        {p.isCurrent && <Badge tone="warning">Actual</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">{formatDate(p.date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-zinc-100">
                        <Money value={p.total} hide={state.settings.hideBalances} currency={state.settings.currency} />
                      </div>
                      <div className="text-xs text-rose-400 tabular-nums">
                        +<Money value={p.added} hide={state.settings.hideBalances} currency={state.settings.currency} />
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          <div>
            <SectionTitle action={
              loan._remaining > 0 && (
                <button onClick={onMarkPaid}
                  className="text-[11px] font-medium uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
                  Marcar como pagado
                </button>
              )
            }>
              Historial de pagos
            </SectionTitle>
            {loan.payments?.length ? (
              <Card className="divide-y divide-zinc-800/70">
                {[...loan.payments].sort((a, b) => (a.date < b.date ? 1 : -1)).map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                        <ArrowDown className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-100 tabular-nums">
                          <Money value={p.amount} hide={state.settings.hideBalances} currency={state.settings.currency} />
                        </div>
                        <div className="text-xs text-zinc-500">
                          {formatDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                        </div>
                      </div>
                    </div>
                    <Check className="h-4 w-4 text-zinc-600" />
                  </div>
                ))}
              </Card>
            ) : (
              <EmptyState Icon={Receipt} title="Sin pagos registrados"
                hint="Cuando registres un pago aparecerá acá con su fecha y nota." />
            )}
          </div>

          {loan.notes ? (
            <div>
              <SectionTitle>Notas</SectionTitle>
              <Card className="whitespace-pre-wrap p-4 text-sm text-zinc-300">{loan.notes}</Card>
            </div>
          ) : null}

          <div>
            <SectionTitle action={
              <button onClick={() => photoInputRef.current?.click()}
                className="text-[11px] font-medium uppercase tracking-wider text-amber-500 hover:text-amber-400">
                {uploading ? "Subiendo..." : "+ Agregar"}
              </button>
            }>
              Fotos adjuntas
            </SectionTitle>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            {loan.photos?.length ? (
              <div className="grid grid-cols-3 gap-2">
                {loan.photos.map((photo) => (
                  <div key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800/70">
                    <img src={photo.url || photo.data} alt={photo.name}
                      className="h-full w-full cursor-pointer object-cover transition-transform group-hover:scale-105"
                      onClick={() => setLightboxPhoto(photo)} />
                    <button onClick={() => removePhoto(photo)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState Icon={Camera} title="Sin fotos adjuntas"
                hint="Comprobantes, garantías o documentación del préstamo." />
            )}
          </div>

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

      {lightboxPhoto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/92 p-4"
          onClick={() => setLightboxPhoto(null)}>
          <img src={lightboxPhoto.url || lightboxPhoto.data} alt={lightboxPhoto.name}
            className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxPhoto(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900/90 text-zinc-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
