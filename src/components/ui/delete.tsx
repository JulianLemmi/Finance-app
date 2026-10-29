// Borrar con confirmación en línea. Dos piezas:
//
//  - `ConfirmDelete`: el par "Confirmar / cancelar" que reemplaza al botón mientras se decide.
//  - `InlineDelete`: el botón de borrar completo, con su estado de "armado".
//
// Por qué existe: varios botones de borrar (movimientos, fotos, cobros de estacionamiento,
// contactos) estaban escritos como `hidden group-hover:flex`. En Tailwind 4 `group-hover:`
// sólo aplica en dispositivos con hover real, así que en un teléfono esos botones NO
// APARECÍAN NUNCA: no había forma de borrar. Hacerlos visibles a secas habría sido peor —dos
// de ellos borraban sin confirmar—, por eso la visibilidad y la confirmación van juntas.
import { useState } from "react";
import { Trash2, X } from "lucide-react";

interface ConfirmDeleteProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDelete({ onConfirm, onCancel }: ConfirmDeleteProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onConfirm}
        className="flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[10px] font-medium text-rose-300 hover:bg-rose-500/30"
        title="Confirmar eliminación"
      >
        <Trash2 className="h-3 w-3" />
        Confirmar
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        title="Cancelar"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface InlineDeleteProps {
  onConfirm: () => void;
  /** Texto accesible del botón. */
  label?: string;
  /** Con mouse, el botón aparece recién al pasar por encima de la fila (que tiene que ser
   *  un `group`). En pantallas táctiles se ve siempre, atenuado: no hay hover. */
  revealOnHover?: boolean;
  /** Estilo del botón disparador, para los casos que no son una fila (ej. sobre una foto). */
  buttonClassName?: string;
  /** Ícono del disparador; por defecto el tacho. */
  icon?: "trash" | "x";
}

const BASE = "flex shrink-0 items-center justify-center rounded-lg transition-all";
const TONO = "text-zinc-500 hover:bg-zinc-800 hover:text-rose-400";
// `pointer-fine` = mouse. Fuera de ahí (táctil) el botón queda visible, atenuado.
const REVELAR = "opacity-60 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100";

export function InlineDelete({
  onConfirm, label = "Eliminar", revealOnHover = false, buttonClassName, icon = "trash",
}: InlineDeleteProps) {
  const [armado, setArmado] = useState(false);
  if (armado) {
    return <ConfirmDelete onConfirm={() => { setArmado(false); onConfirm(); }} onCancel={() => setArmado(false)} />;
  }
  const Icono = icon === "x" ? X : Trash2;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setArmado(true)}
      className={buttonClassName ?? `${BASE} h-7 w-7 ${TONO}${revealOnHover ? ` ${REVELAR}` : ""}`}
    >
      <Icono className="h-3.5 w-3.5" />
    </button>
  );
}
