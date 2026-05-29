// Lista de pagos registrados en un préstamo con acciones de editar y eliminar.
// Incluye el atajo "Marcar como pagado" que registra el saldo restante de una vez.
import { useState } from "react";
import { ArrowDown, Edit2, Trash2, Receipt } from "lucide-react";
import { uid, todayISO, formatDate } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import { Card, Button, Input, SectionTitle, EmptyState, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface PaymentHistoryProps {
  loan: ResolvedLoan;
}

interface EditingPayment {
  id: string;
  amount: string;
  date: string;
  note: string;
}

export default function PaymentHistory({ loan }: PaymentHistoryProps) {
  const { state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const [editingPayment, setEditingPayment] = useState<EditingPayment | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

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

  const onDeletePayment = (paymentId: string) => {
    dispatch({
      type: "UPDATE_LOAN",
      payload: { id: loan.id, payments: (loan.payments || []).filter((p) => p.id !== paymentId) },
    });
    setDeletingPaymentId(null);
  };

  const onSaveEdit = () => {
    if (!editingPayment) return;
    const updated = (loan.payments || []).map((p) =>
      p.id === editingPayment.id
        ? { ...p, amount: Number(editingPayment.amount) || p.amount, date: editingPayment.date || p.date, note: editingPayment.note }
        : p
    );
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, payments: updated } });
    setEditingPayment(null);
  };

  return (
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
            <div key={p.id}>
              {editingPayment?.id === p.id ? (
                <div className="space-y-3 px-4 py-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Monto" type="number" inputMode="decimal"
                      value={editingPayment!.amount}
                      onChange={(e) => setEditingPayment((v) => v ? { ...v, amount: e.target.value } : v)} />
                    <Input label="Fecha" type="date"
                      value={editingPayment!.date}
                      onChange={(e) => setEditingPayment((v) => v ? { ...v, date: e.target.value } : v)} />
                  </div>
                  <Input label="Nota" placeholder="Opcional"
                    value={editingPayment!.note}
                    onChange={(e) => setEditingPayment((v) => v ? { ...v, note: e.target.value } : v)} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingPayment(null)}>Cancelar</Button>
                    <Button variant="bronze" size="sm" onClick={onSaveEdit}>Guardar</Button>
                  </div>
                </div>
              ) : deletingPaymentId === p.id ? (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm text-rose-200">¿Eliminar este pago?</div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDeletingPaymentId(null)}>Cancelar</Button>
                    <Button variant="danger" size="sm" Icon={Trash2} onClick={() => onDeletePayment(p.id!)}>Eliminar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                      <ArrowDown className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-100 tabular-nums">
                        <Money value={p.amount} hide={hide} currency={cur} />
                      </div>
                      <div className="text-xs text-zinc-500">
                        {formatDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingPayment({ id: p.id!, amount: String(p.amount), date: p.date, note: p.note || "" })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingPaymentId(p.id!)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState Icon={Receipt} title="Sin pagos registrados"
          hint="Cuando registres un pago aparecerá acá con su fecha y nota." />
      )}
    </div>
  );
}
