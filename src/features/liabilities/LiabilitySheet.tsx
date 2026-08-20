// Sheet para crear y editar pasivos (deudas propias, ej: "le debo a mi papá").
// El monto adeudado se reduce con cada pago registrado (fecha + monto); lo que
// queda pendiente resta del capital total. Despacha ADD_LIABILITY, UPDATE_LIABILITY
// o DELETE_LIABILITY.
import { useState, useEffect } from "react";
import { Trash2, DollarSign, Plus, X, CalendarDays } from "lucide-react";
import { uid, todayISO, formatMoney, formatDate } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Textarea } from "../../components/ui.jsx";
import type { Liability, AssetPayment } from "../../types";

interface LiabilitySheetProps {
  open: boolean;
  onClose: () => void;
  editingLiability?: Liability | null;
}

interface LiabilityFormState {
  name: string;
  amount: string;
  startDate: string;
  notes: string;
}

const emptyForm = (): LiabilityFormState => ({
  name: "", amount: "", startDate: todayISO(), notes: "",
});

export default function LiabilitySheet({ open, onClose, editingLiability }: LiabilitySheetProps) {
  const { state, dispatch } = useApp();
  const cur = state.settings.currency;
  const [form, setForm] = useState<LiabilityFormState>(emptyForm);
  const [payments, setPayments] = useState<AssetPayment[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        editingLiability
          ? {
              name: editingLiability.name,
              amount: String(editingLiability.amount),
              startDate: editingLiability.startDate ?? todayISO(),
              notes: editingLiability.notes ?? "",
            }
          : emptyForm()
      );
      setPayments(editingLiability?.payments ?? []);
      setPayAmount("");
      setPayDate(todayISO());
      setConfirmDelete(false);
    }
  }, [open, editingLiability]);

  const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const owed = Math.max(0, Number(form.amount || 0) - paidTotal);

  const addPayment = () => {
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0 || !payDate) return;
    setPayments((arr) =>
      [{ id: uid("liabpay"), amount: amt, date: payDate }, ...arr].sort((a, b) => (a.date < b.date ? 1 : -1))
    );
    setPayAmount("");
  };

  const removePayment = (id: string) => setPayments((arr) => arr.filter((p) => p.id !== id));

  const canSubmit = form.name.trim().length > 0 && Number(form.amount) > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    const payload = {
      name: form.name.trim(),
      amount: Number(form.amount),
      startDate: form.startDate || todayISO(),
      notes: form.notes,
      payments,
    };
    if (editingLiability) {
      dispatch({ type: "UPDATE_LIABILITY", payload: { ...editingLiability, ...payload } });
    } else {
      dispatch({ type: "ADD_LIABILITY", payload: { id: uid("liability"), createdAt: Date.now(), ...payload } });
    }
    onClose();
  };

  const onDelete = () => {
    if (!editingLiability) return;
    dispatch({ type: "DELETE_LIABILITY", payload: editingLiability.id });
    onClose();
  };

  return (
    <Sheet
      open={open} onClose={onClose}
      title={editingLiability ? "Editar deuda" : "Nueva deuda"}
      subtitle="Lo que le debés a alguien — resta de tu capital total"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            {editingLiability && !confirmDelete && (
              <Button variant="ghost" size="sm" Icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Eliminar
              </Button>
            )}
            {editingLiability && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400">¿Eliminar?</span>
                <Button variant="danger" size="sm" onClick={onDelete}>Sí</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>Guardar</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Input label="A quién le debés" placeholder="ej. Papá"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

        <div className="grid grid-cols-2 gap-2">
          <Input label="Monto adeudado (original)" type="number" inputMode="decimal"
            placeholder="0" value={form.amount} Icon={DollarSign}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <Input label="Fecha" type="date" value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} Icon={CalendarDays} />
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Adeudado ahora</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-rose-400">
                {formatMoney(owed, false, cur)}
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500">
              Pagado {formatMoney(paidTotal, false, cur)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Fecha" type="date" value={payDate}
                onChange={(e) => setPayDate(e.target.value)} Icon={CalendarDays} />
              <Input label="Monto" type="number" inputMode="decimal"
                placeholder="0" value={payAmount} Icon={DollarSign}
                onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <Button variant="bronze" Icon={Plus} onClick={addPayment} className="w-full"
              disabled={!(Number(payAmount) > 0 && payDate)}>Registrar pago</Button>
          </div>

          {payments.length > 0 && (
            <div className="divide-y divide-zinc-800/70 overflow-hidden rounded-xl border border-zinc-800/70">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[11px] text-zinc-500">{formatDate(p.date)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums text-zinc-100">
                      {formatMoney(p.amount, false, cur)}
                    </span>
                    <button onClick={() => removePayment(p.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-rose-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Textarea label="Notas" rows={3}
          placeholder="Motivo de la deuda, acuerdo de pago, observaciones..."
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>
    </Sheet>
  );
}
