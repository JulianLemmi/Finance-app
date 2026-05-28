import { useEffect, useRef } from "react";
import { storage } from "./storage.js";

// Debounced sync of a slice of state to persistent storage.
// Centralizes what used to be 7 near-identical useEffect blocks in FinanceApp.
// El primer run con enabled=true se skipea para no re-escribir los datos
// que acaban de cargarse via HYDRATE.
export function useStorageSync(key, value, enabled, delayMs = 300) {
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
