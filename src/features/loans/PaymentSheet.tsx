// Sheet para registrar un pago sobre un préstamo. Valida que el monto no supere
// el saldo restante, ofrece atajos de 25/50/100%, y despacha ADD_PAYMENT.
import { useState, useEffect } from "react";
import { Banknote, Calendar } from "lucide-react";
import { uid, todayISO, formatMoney } from "../../lib/utils.js";
import { remainingDebt } from "../../lib/calcs.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Textarea } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  loan: ResolvedLoan | null;
}

export default function PaymentSheet({ open, onClose, loan }: PaymentSheetProps) {
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
  const amountError =
    amount && parsedAmount > remaining + 0.001
      ? `Supera el saldo restante (${state.settings.currency}${Math.round(remaining).toLocaleString("es-AR")})`
      : null;
  const remainingAfter =
    parsedAmount > 0 && !amountError ? Math.max(0, remaining - parsedAmount) : null;

  const onSubmit = () => {
    if (!(parsedAmount > 0)) return;
    dispatch({
      type: "ADD_PAYMENT",
      payload: {
        loanId: loan.id,
        payment: { id: uid("pay"), amount: parsedAmount, date, note, createdAt: Date.now() },
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
        {remainingAfter !== null && (
          <div className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs">
            <span className="text-zinc-500">
              {remainingAfter === 0 ? "Cierra el préstamo" : "Queda después"}
            </span>
            <span className={`font-medium tabular-nums ${remainingAfter === 0 ? "text-emerald-400" : "text-zinc-200"}`}>
              {formatMoney(remainingAfter, false, state.settings.currency)}
            </span>
          </div>
        )}
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
