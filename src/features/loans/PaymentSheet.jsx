import { useState, useEffect } from "react";
import { Banknote, Calendar } from "lucide-react";
import { uid, todayISO, formatMoney } from "../../lib/utils.js";
import { remainingDebt } from "../../lib/calcs.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Textarea } from "../../components/ui.jsx";

export default function PaymentSheet({ open, onClose, loan }) {
  const { state, dispatch } = useApp();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) { setAmount(""); setDate(todayISO()); setNote(""); }
  }, [open]);

  if (!loan) return null;

  const remaining = remainingDebt(loan);
  const parsedAmount = Number(amount);
  const amountError = amount && parsedAmount > remaining + 0.001
    ? `Supera el saldo restante (${state.settings.currency}${Math.round(remaining).toLocaleString("es-AR")})`
    : null;

  const onSubmit = () => {
    const value = parsedAmount;
    if (!(value > 0)) return;
    dispatch({
      type: "ADD_PAYMENT",
      payload: {
        loanId: loan.id,
        payment: { id: uid("pay"), amount: value, date, note, createdAt: Date.now() },
      },
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar pago"
      subtitle={`${loan.clientName} · resta ${formatMoney(remaining, false, state.settings.currency)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="bronze" onClick={onSubmit} disabled={!(parsedAmount > 0) || !!amountError}>
            Confirmar pago
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          Icon={Banknote}
          error={amountError}
        />
        <div className="grid grid-cols-3 gap-2">
          {[0.25, 0.5, 1].map((f) => (
            <button
              key={f}
              onClick={() => setAmount(String(Math.round(remaining * f)))}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {f === 1 ? "Total" : `${Math.round(f * 100)}%`}
            </button>
          ))}
        </div>
        <Input
          label="Fecha"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          Icon={Calendar}
        />
        <Textarea
          label="Nota"
          rows={2}
          placeholder="Opcional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
