// Sheet "Extender préstamo": corre el vencimiento una cantidad de días. Se monta sólo cuando
// se abre, así que el campo arranca en 15 cada vez sin tener que resetearlo a mano.
import { useState } from "react";
import { Calendar } from "lucide-react";
import { addDays, formatDate } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface ExtendSheetProps {
  open: boolean;
  onClose: () => void;
  loan: ResolvedLoan;
}

export default function ExtendSheet({ open, onClose, loan }: ExtendSheetProps) {
  const { dispatch } = useApp();
  const [extendDays, setExtendDays] = useState("15");

  const onExtendConfirm = () => {
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) return;
    dispatch({ type: "UPDATE_LOAN", payload: { id: loan.id, dueDate: addDays(loan.dueDate, days) } });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}
      title="Extender préstamo" subtitle={`Vence el ${formatDate(loan.dueDate)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
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
  );
}
