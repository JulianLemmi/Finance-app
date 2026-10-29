// Bottom sheet con entrada con resorte, animación de salida y gesto de
// arrastre vertical para cerrar (drag-to-dismiss) desde el header/handle.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { registrarOverlay, type CapaOverlay } from "../../lib/overlay.js";
import { atraparTab } from "../../lib/focus.js";
import { IconButton } from "./button.jsx";

type SheetSize = "sm" | "md" | "lg" | "xl";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: SheetSize;
  /** Achica el contenido en el teléfono para que entre más sin scrollear (ver `.fa-dense`
   *  en GlobalStyles). Para los sheets largos, como el detalle de un préstamo. */
  dense?: boolean;
}

const widths: Record<SheetSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  // "xl" es para los sheets que en pantalla ancha se abren a dos columnas (el detalle de
  // un préstamo): con max-w-2xl sobraba media pantalla y todo quedaba apilado en una sola.
  xl: "sm:max-w-3xl lg:max-w-6xl",
};

const CLOSE_MS = 220;
/** Lo que dura la animación de entrada del panel (keyframe `fa-sheet`). */
const OPEN_MS = 340;
const DISMISS_THRESHOLD = 110;

export function Sheet({ open, onClose, title, subtitle, footer, children, size = "md", dense = false }: SheetProps) {
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [blurListo, setBlurListo] = useState(false);
  const closingRef = useRef(false);
  const dragStart = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const capaRef = useRef<CapaOverlay | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // `onClose` por ref: los padres lo pasan casi siempre como una función en línea, o sea
  // nueva en cada render. Si `requestClose` dependiera de él, el efecto del teclado se
  // volvía a montar en cada render del padre.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Algunos sheets quedan montados con open=false: resetear al reabrir.
  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setClosing(false);
      setDragY(0);
      setDragging(false);
    }
  }, [open]);

  // Si el sheet se desmonta durante la animación de salida, el `onClose` pendiente no
  // tiene que dispararse: llegaría a un padre que ya no es el mismo (por ejemplo cerrando
  // el modal SIGUIENTE).
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => onCloseRef.current?.(), CLOSE_MS);
  }, []);

  // La capa: se registra al ABRIR y se da de baja al cerrar, y nada más. Antes esto vivía
  // en el mismo efecto que el teclado, que dependía de `requestClose` y se rehacía en cada
  // render del padre: cada vez se apagaba el desenfoque, se des-registraba la capa (el
  // fondo animado se reanudaba un instante) y se reiniciaba el temporizador de OPEN_MS.
  useEffect(() => {
    if (!open) return;
    // Quién tenía el foco al abrir (el botón que disparó el sheet): se lo devolvemos al cerrar.
    const opener = document.activeElement as HTMLElement | null;
    // Registra la capa en la pila (ver lib/overlay.ts): frena el fondo animado, bloquea el
    // scroll del body y le dice a Escape cuál es la de arriba.
    const capa = registrarOverlay();
    capaRef.current = capa;
    // El foco entra al diálogo, salvo que algo de adentro ya lo tenga (un `autoFocus`).
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    // El `backdrop-filter` de pantalla completa recién se aplica cuando la animación de
    // entrada terminó. Desenfocar mientras el sheet entra y el navegador está armando su
    // contenido es lo más caro del momento más caro: con el desenfoque desde el frame 0,
    // abrir el detalle de un cliente caía 4 frames y el de un préstamo 9; aplicándolo
    // después, 0 y 1. En reposo no cuesta nada, porque el fondo animado ya está frenado.
    const tBlur = window.setTimeout(() => setBlurListo(true), OPEN_MS);
    return () => {
      window.clearTimeout(tBlur);
      capa.liberar();
      capaRef.current = null;
      setBlurListo(false);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Con sheets apilados sólo reacciona el de arriba: antes un Escape cerraba todos.
      if (!capaRef.current?.esLaDeArriba()) return;
      if (e.key === "Escape") requestClose();
      else if (e.key === "Tab" && panelRef.current) atraparTab(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Apretar un control del header NO arrastra. Esto no es cosmético: abajo se hace
    // `setPointerCapture` sobre el header, y con el puntero capturado el `pointerup` se
    // le redirige al header, así que el navegador dispara el `click` ahí y no en el
    // botón que se apretó. Resultado: la X de cerrar no cerraba nunca.
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
    dragStart.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    const dy = e.clientY - dragStart.current;
    // Hacia abajo sigue el dedo; hacia arriba resiste (rubber-band).
    setDragY(dy > 0 ? dy : Math.max(-28, dy * 0.25));
  };
  const endDrag = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD) requestClose();
    else setDragY(0);
  };

  const panelTransform = closing ? "translateY(110%)" : dragY !== 0 ? `translateY(${dragY}px)` : undefined;
  const panelTransition = dragging
    ? "none"
    : closing
      ? `transform ${CLOSE_MS}ms cubic-bezier(.4,0,1,1), opacity ${CLOSE_MS}ms ease-in`
      : "transform 340ms cubic-bezier(.22,1.18,.36,1)";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="cerrar"
        tabIndex={-1}
        onClick={requestClose}
        className={`absolute inset-0 bg-black/60${blurListo ? " backdrop-blur-sm" : ""}`}
        style={{
          animation: closing ? undefined : "fa-fade 200ms ease-out",
          opacity: closing ? 0 : 1,
          transition: `opacity ${CLOSE_MS}ms ease-in`,
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex h-[92vh] w-full flex-col outline-none rounded-t-3xl border border-zinc-800/80 bg-zinc-950 shadow-[0_-12px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-auto sm:max-h-[88vh] sm:rounded-3xl ${widths[size]}`}
        style={{
          animation: closing ? undefined : "fa-sheet 340ms cubic-bezier(.22,1.18,.36,1)",
          transform: panelTransform,
          opacity: closing ? 0 : 1,
          transition: panelTransition,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
      >
        {/* Header (zona de arrastre) */}
        <div
          className="relative flex shrink-0 cursor-grab touch-none items-center justify-between border-b border-zinc-800/60 px-5 pb-4 pt-5 active:cursor-grabbing sm:pt-4"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-700/70 sm:hidden" aria-hidden />
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-base font-semibold tracking-tight text-zinc-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton Icon={X} aria-label="Cerrar" onClick={requestClose} className="ml-3 shrink-0" />
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {dense ? <div className="fa-dense">{children}</div> : children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-zinc-800/60 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
