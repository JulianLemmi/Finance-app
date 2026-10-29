// Pie estándar de los sheets de alta y edición:
//
//   [Eliminar → ¿Eliminar? Sí / No]                    [Cancelar] [Guardar]
//
// Estaba copiado palabra por palabra en los sheets de activos, pasivos y autos. El estado de
// la confirmación vive ACÁ y no en el sheet: el pie se desmonta cuando el sheet se cierra,
// así que al reabrirlo "Eliminar" vuelve a estar sin armar. Con el estado en el sheet (que
// sigue montado con `open={false}`) podía quedar el "¿Eliminar?" puesto de la vez anterior.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./button.jsx";

interface FormFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  /** Texto del botón principal. */
  submitLabel?: string;
  /** Sólo al editar: si se pasa, aparece "Eliminar" y pide confirmación antes de llamarla. */
  onDelete?: () => void;
}

export function FormFooter({ onCancel, onSubmit, canSubmit, submitLabel = "Guardar", onDelete }: FormFooterProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        {onDelete && !confirmDelete && (
          <Button variant="ghost" size="sm" Icon={Trash2} onClick={() => setConfirmDelete(true)}>
            Eliminar
          </Button>
        )}
        {onDelete && confirmDelete && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-rose-400">¿Eliminar?</span>
            <Button variant="danger" size="sm" onClick={onDelete}>Sí</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}
