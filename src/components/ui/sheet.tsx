// Bottom sheet con entrada con resorte, animación de salida y gesto de
// arrastre vertical para cerrar (drag-to-dismiss) desde el header/handle.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
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
const DISMISS_THRESHOLD = 110;

export function Sheet({ open, onClose, title, subtitle, footer, children, size = "md" }: SheetProps) {
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const closingRef = useRef(false);
  const dragStart = useRef<number | null>(null);

  // Algunos sheets quedan montados con open=false: resetear al reabrir.
  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setClosing(false);
      setDragY(0);
      setDragging(false);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onClose?.(), CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, requestClose]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
        onClick={requestClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{
          animation: closing ? undefined : "fa-fade 200ms ease-out",
          opacity: closing ? 0 : 1,
          transition: `opacity ${CLOSE_MS}ms ease-in`,
        }}
      />
      <div
        className={`relative flex h-[92vh] w-full flex-col rounded-t-3xl border border-zinc-800/80 bg-zinc-950 shadow-[0_-12px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-auto sm:max-h-[88vh] sm:rounded-3xl ${widths[size]}`}
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
          {children}
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
