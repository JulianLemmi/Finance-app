import { useState, useEffect } from "react";
import {
  User as UserIcon, Tag, Banknote, TrendingUp, Calendar, Clock, Hash,
  CalendarClock, Shield, FileText, HelpCircle,
} from "lucide-react";
import { uid, todayISO, addDays, formatMoney, formatDate } from "../lib/utils.js";
import { PAYMENT_TYPES, GUARANTY_TYPES } from "../lib/constants.js";
import { useApp } from "../store/index.js";
import { Sheet, Button, Input, Select, Textarea } from "../components/ui.jsx";

function emptyLoan() {
  const start = todayISO();
  return {
    id: "", clientId: "", clientName: "", alias: "", amount: "",
    interestRate: "8", startDate: start, paymentType: "30",
    customDays: 30, dueDate: addDays(start, 30), guarantyType: "cash",
    guarantyDetail: "", status: "active", notes: "", payments: [],
    compoundInterest: false, noDueDate: false,
  };
}

export default function LoanFormSheet({ open, onClose, editingLoan }) {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState(() => emptyLoan());

  useEffect(() => {
    if (open) setForm(editingLoan ? { ...emptyLoan(), ...editingLoan } : emptyLoan());
  }, [open, editingLoan]);

  const updateField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const recalcDueDate = (startDate, paymentType, customDays) => {
    if (!startDate || startDate.length < 10) return "";
    const days = paymentType === "custom"
      ? Number(customDays) || 30
      : PAYMENT_TYPES[paymentType].days;
    return addDays(startDate, days);
  };

  const onStartChange = (v) =>
    setForm((f) => ({ ...f, startDate: v, dueDate: recalcDueDate(v, f.paymentType, f.customDays) }));

  const onPaymentTypeChange = (v) =>
    setForm((f) => ({ ...f, paymentType: v, dueDate: recalcDueDate(f.startDate, v, f.customDays) }));

  const onCustomDaysChange = (v) =>
    setForm((f) => ({ ...f, customDays: v, dueDate: recalcDueDate(f.startDate, "custom", v) }));

  const canSubmit = form.clientName.trim() && Number(form.amount) > 0 && Number(form.interestRate) >= 0;
  const profit = (Number(form.amount || 0) * Number(form.interestRate || 0)) / 100;

  const onSubmit = () => {
    if (!canSubmit) return;
    let clientId = form.clientId;
    if (!clientId) {
      const existing = state.clients.find(
        (c) => c.name.trim().toLowerCase() === form.clientName.trim().toLowerCase()
      );
      if (existing) {
        clientId = existing.id;
      } else {
        const newClient = {
          id: uid("client"), name: form.clientName.trim(), phone: "",
          observations: "", riskLevel: "low", createdAt: Date.now(),
        };
        dispatch({ type: "ADD_CLIENT", payload: newClient });
        clientId = newClient.id;
      }
    }
    const payload = {
      ...form, id: form.id || uid("loan"), clientId,
      amount: Number(form.amount), interestRate: Number(form.interestRate),
      customDays: Number(form.customDays) || null, createdAt: form.createdAt || Date.now(),
    };
    if (editingLoan) dispatch({ type: "UPDATE_LOAN", payload });
    else dispatch({ type: "ADD_LOAN", payload });
    onClose();
  };

  return (
    <Sheet
      open={open} onClose={onClose}
      title={editingLoan ? "Editar préstamo" : "Nuevo préstamo"}
      subtitle="Capturá los términos y la garantía"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            Ganancia esperada{" "}
            <span className="font-medium text-emerald-400 tabular-nums">
              {formatMoney(profit, false, state.settings.currency)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>
              {editingLoan ? "Guardar cambios" : "Crear préstamo"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Cliente" placeholder="Nombre y apellido" value={form.clientName}
            onChange={(e) => updateField("clientName", e.target.value)} Icon={UserIcon} />
          <Input label="Alias / descripción" placeholder="Préstamo auto, vacaciones, etc."
            value={form.alias} onChange={(e) => updateField("alias", e.target.value)} Icon={Tag} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Monto prestado" type="number" inputMode="decimal" placeholder="0"
            value={form.amount} onChange={(e) => updateField("amount", e.target.value)} Icon={Banknote} />
          <Input label="Interés (%)" type="number" inputMode="decimal" placeholder="8"
            value={form.interestRate} onChange={(e) => updateField("interestRate", e.target.value)} Icon={TrendingUp} />
        </div>

        {!form.noDueDate && (
          <button type="button" onClick={() => updateField("compoundInterest", !form.compoundInterest)}
            className={`self-start flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              form.compoundInterest
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 hover:text-zinc-400"
            }`}
          >
            <TrendingUp className="h-3 w-3" />
            Interés compuesto al vencer
          </button>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Inicio" type="date" value={form.startDate}
            onChange={(e) => onStartChange(e.target.value)} Icon={Calendar} />
          <Select label="Plazo" value={form.paymentType} onChange={onPaymentTypeChange} Icon={Clock}
            options={Object.entries(PAYMENT_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
          {form.noDueDate ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">Vencimiento</span>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 text-sm text-zinc-600 italic">
                <CalendarClock className="h-3.5 w-3.5" />
                Sin fecha definida
              </div>
            </div>
          ) : form.paymentType === "custom" ? (
            <Input label="Días" type="number" value={form.customDays}
              onChange={(e) => onCustomDaysChange(e.target.value)} Icon={Hash} />
          ) : (
            <Input label="Vencimiento" type="date" value={form.dueDate}
              onChange={(e) => updateField("dueDate", e.target.value)} Icon={CalendarClock} />
          )}
        </div>

        <button type="button"
          onClick={() => {
            const next = !form.noDueDate;
            setForm((f) => ({
              ...f, noDueDate: next,
              dueDate: next ? "" : recalcDueDate(f.startDate, f.paymentType, f.customDays),
            }));
          }}
          className={`self-start flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            form.noDueDate
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              : "bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 hover:text-zinc-400"
          }`}
        >
          <HelpCircle className="h-3 w-3" />
          Fecha de pago incierta
        </button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Garantía" value={form.guarantyType}
            onChange={(v) => updateField("guarantyType", v)} Icon={Shield}
            options={Object.entries(GUARANTY_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Input label="Detalle de garantía" placeholder="Marca, modelo, etc."
            value={form.guarantyDetail} onChange={(e) => updateField("guarantyDetail", e.target.value)}
            Icon={FileText} />
        </div>

        <Textarea label="Notas privadas" rows={3}
          placeholder="Acuerdos verbales, referencias, etc."
          value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />

        <div className="rounded-2xl border border-amber-900/30 bg-amber-950/20 p-4">
          <div className="text-[11px] uppercase tracking-wider text-amber-500/80">Resumen</div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-zinc-500 text-xs">Monto</div>
              <div className="font-semibold tracking-tight text-zinc-100 tabular-nums">
                {formatMoney(form.amount, false, state.settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">Ganancia</div>
              <div className="font-semibold tracking-tight text-emerald-400 tabular-nums">
                {formatMoney(profit, false, state.settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">A cobrar</div>
              <div className="font-semibold tracking-tight text-zinc-100 tabular-nums">
                {formatMoney(Number(form.amount || 0) + profit, false, state.settings.currency)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-zinc-500">Vence el {formatDate(form.dueDate)}</div>
        </div>
      </div>
    </Sheet>
  );
}
