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

export interface LongPressHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: { preventDefault: () => void }) => void;
  onClick: () => void;
}

// Gesto de "mantener apretado" vía Pointer Events, que unifica mouse y touch (funciona
// igual en mobile y en PC sin código separado por plataforma). Si el puntero se suelta
// antes de `delayMs`, dispara `onClick` normal en su lugar; `pressing` sirve para mostrar
// feedback visual mientras se mantiene apretado (ver .fa-longpress-fill en GlobalStyles).
export function useLongPress(
  onLongPress: () => void,
  onClick?: () => void,
  delayMs = 550
): { pressing: boolean; handlers: LongPressHandlers } {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressing(false);
  }, []);

  const onPointerDown = useCallback(() => {
    firedRef.current = false;
    clear();
    setPressing(true);
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      setPressing(false);
      onLongPress();
    }, delayMs);
  }, [clear, onLongPress, delayMs]);

  const handleClick = useCallback(() => {
    if (firedRef.current) { firedRef.current = false; return; }
    onClick?.();
  }, [onClick]);

  return {
    pressing,
    handlers: {
      onPointerDown,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      // Sin esto, mantener apretado abre el menú contextual del navegador (mobile y PC).
      onContextMenu: (e) => e.preventDefault(),
      onClick: handleClick,
    },
  };
}
