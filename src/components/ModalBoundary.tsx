// Red de seguridad para los sheets que monta ModalRoot (detalle de préstamo, formularios...).
//
// El único ErrorBoundary de la app envolvía las pantallas de cada pestaña. ModalRoot quedaba
// afuera, así que si `LoanDetailSheet` o `ClientDetailSheet` lanzaban al renderizar —por un
// dato raro en un respaldo, por ejemplo— React desmontaba TODA la app y quedaba la pantalla
// en blanco, sin forma de volver. Con esto el error queda contenido en el sheet: se ve un
// aviso y la app sigue viva.
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useApp } from "../store/index.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { Button } from "./ui.jsx";

interface CaidoProps {
  error: Error | null;
  onClose: () => void;
}

function SheetCaido({ error, onClose }: CaidoProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div role="alertdialog" aria-label="No se pudo abrir"
        className="w-full max-w-sm rounded-3xl border border-rose-900/50 bg-zinc-950 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-tight text-zinc-100">No se pudo abrir esto</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
          Algo falló al mostrar esta pantalla. El resto de la app sigue funcionando.
        </p>
        {error?.message && (
          <p className="mt-3 break-words rounded-xl bg-zinc-900/70 px-3 py-2 text-left font-mono text-[10px] text-zinc-500">
            {error.message}
          </p>
        )}
        <Button variant="bronze" className="mt-5 w-full" onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  );
}

export default function ModalBoundary({ children }: { children: ReactNode }) {
  const { state, dispatch } = useApp();
  const modal = state.ui.modal;
  // La `key` cambia con el modal: cada uno arranca con un boundary limpio. Sin esto, después
  // de un error quedaría el aviso puesto y el modal siguiente que se abra tampoco se vería.
  const key = modal ? `${modal.type}:${modal.payload?.id ?? modal.payload?.clientId ?? ""}` : "ninguno";
  return (
    <ErrorBoundary
      key={key}
      fallback={({ error }) => <SheetCaido error={error} onClose={() => dispatch({ type: "CLOSE_MODAL" })} />}
    >
      {children}
    </ErrorBoundary>
  );
}
