import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "./storage.js";

// Debounced sync of a single state slice to persistent storage.
// Skips the first run after enabled becomes true to avoid re-writing data
// that was just loaded via HYDRATE.
export function useStorageSync(key: string, value: unknown, enabled: boolean, delayMs = 300): void {
  const hasSyncedOnce = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (!hasSyncedOnce.current) {
      hasSyncedOnce.current = true;
      return;
    }
    const t = setTimeout(() => storage.set(key, value), delayMs);
    return () => clearTimeout(t);
  }, [key, value, enabled, delayMs]);
}

interface PointerPos { clientX: number; clientY: number }

export interface LongPressHandlers {
  onPointerDown: (e: PointerPos) => void;
  onPointerMove: (e: PointerPos) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: { preventDefault: () => void }) => void;
  onClick: () => void;
}

export interface LongPressOptions {
  /** Cuánto hay que sostener para disparar la acción. */
  delayMs?: number;
  /** Recién a partir de acá se muestra el feedback visual (`pressing`). Un toque corto
   *  o el arranque de un scroll terminan antes, así que nunca lo llegan a ver. */
  feedbackAfterMs?: number;
  /** Si el puntero se desplaza más que esto, se asume scroll y se cancela el gesto. */
  moveTolerancePx?: number;
}

// Gesto de "mantener apretado" vía Pointer Events, que unifica mouse y touch (funciona
// igual en mobile y en PC sin código separado por plataforma). Si el puntero se suelta
// antes de `delayMs`, dispara `onClick` normal en su lugar.
//
// Dos defensas contra el scroll en mobile, donde el dedo inevitablemente pasa por encima
// de las cards: se cancela apenas el puntero se desplaza (`moveTolerancePx`) y el feedback
// visual no aparece hasta `feedbackAfterMs`. Sin ambas, deslizar para scrollear hacía
// parpadear "Archivando..." en cada card que el dedo tocaba al pasar.
export function useLongPress(
  onLongPress: () => void,
  onClick?: () => void,
  options: LongPressOptions = {}
): { pressing: boolean; progressMs: number; handlers: LongPressHandlers } {
  const { delayMs = 2000, feedbackAfterMs = 350, moveTolerancePx = 12 } = options;
  const [pressing, setPressing] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
    if (feedbackRef.current) { clearTimeout(feedbackRef.current); feedbackRef.current = null; }
    originRef.current = null;
    setPressing(false);
  }, []);

  // Los timers no deben sobrevivir al desmontaje (ej. archivar saca la card de la lista).
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback((e: PointerPos) => {
    firedRef.current = false;
    clear();
    originRef.current = { x: e.clientX, y: e.clientY };
    feedbackRef.current = setTimeout(() => setPressing(true), feedbackAfterMs);
    holdRef.current = setTimeout(() => {
      firedRef.current = true;
      clear();
      onLongPress();
    }, delayMs);
  }, [clear, onLongPress, delayMs, feedbackAfterMs]);

  const onPointerMove = useCallback((e: PointerPos) => {
    const origin = originRef.current;
    if (!origin) return;
    if (Math.abs(e.clientX - origin.x) > moveTolerancePx
      || Math.abs(e.clientY - origin.y) > moveTolerancePx) clear();
  }, [clear, moveTolerancePx]);

  const handleClick = useCallback(() => {
    if (firedRef.current) { firedRef.current = false; return; }
    onClick?.();
  }, [onClick]);

  return {
    pressing,
    // Lo que dura la barra de progreso: desde que aparece el feedback hasta que dispara.
    progressMs: Math.max(0, delayMs - feedbackAfterMs),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      // Sin esto, mantener apretado abre el menú contextual del navegador (mobile y PC).
      onContextMenu: (e) => e.preventDefault(),
      onClick: handleClick,
    },
  };
}
