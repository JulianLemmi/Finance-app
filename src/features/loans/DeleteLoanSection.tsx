// Eliminar el préstamo: confirmación en dos pasos, y un aviso aparte si todavía tiene saldo.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "../../store/index.js";
import { Button, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface DeleteLoanSectionProps {
  loan: ResolvedLoan;
  hide: boolean;
  cur: string;
  /** Se llama después de borrar, para que el detalle se cierre. */
  onDeleted: () => void;
}

export default function DeleteLoanSection({ loan, hide, cur, onDeleted }: DeleteLoanSectionProps) {
  const { dispatch } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onDelete = () => {
    dispatch({ type: "DELETE_LOAN", payload: loan.id });
    onDeleted();
  };

  return (
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
  );
}
