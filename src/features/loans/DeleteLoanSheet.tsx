// Sheet "Eliminar préstamo": confirmación antes de borrar, con un aviso aparte si el préstamo
// todavía tiene saldo. Se monta sólo cuando se abre (ver LoanDetailSheet), igual que el resto
// de las operaciones.
import { Trash2, AlertTriangle, Archive } from "lucide-react";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface DeleteLoanSheetProps {
  open: boolean;
  /** Cancelar: vuelve al detalle. */
  onClose: () => void;
  /** Se llama después de borrar, para que el detalle también se cierre. */
  onDeleted: () => void;
  loan: ResolvedLoan;
  hide: boolean;
  cur: string;
}

export default function DeleteLoanSheet({ open, onClose, onDeleted, loan, hide, cur }: DeleteLoanSheetProps) {
  const { dispatch } = useApp();
  const enCurso = loan._status === "active" || loan._status === "overdue";

  const onDelete = () => {
    dispatch({ type: "DELETE_LOAN", payload: loan.id });
    onDeleted();
  };

  return (
    <Sheet open={open} onClose={onClose}
      title="Eliminar préstamo" subtitle={loan.alias ? `${loan.clientName} · ${loan.alias}` : loan.clientName}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" Icon={Trash2} onClick={onDelete}>Eliminar</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-zinc-300">
          ¿Eliminar definitivamente este préstamo? Se borra con sus pagos, adicionales, contactos
          y fotos. <span className="font-medium text-rose-300">No se puede deshacer.</span>
        </p>
        {loan._remaining > 0 && enCurso && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-700/40 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Préstamo {loan._status === "overdue" ? "atrasado" : "activo"} con saldo pendiente de{" "}
              <span className="font-semibold tabular-nums">
                <Money value={loan._remaining} hide={hide} currency={cur} />
              </span>
              . Al eliminarlo, esa plata deja de contar en Inicio y en Finanzas.
            </span>
          </div>
        )}
        <div className="flex items-start gap-2 text-[11px] text-zinc-500">
          <Archive className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Si sólo querés sacarlo del listado, archivalo: mantené apretada su card en Préstamos y
            conserva el historial.
          </span>
        </div>
      </div>
    </Sheet>
  );
}
