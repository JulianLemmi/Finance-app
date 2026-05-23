import { useEffect } from "react";
import { storage } from "./storage.js";

// Debounced sync of a slice of state to persistent storage.
// Centralizes what used to be 7 near-identical useEffect blocks in FinanceApp.
export function useStorageSync(key, value, enabled, delayMs = 300) {
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => storage.set(key, value), delayMs);
    return () => clearTimeout(t);
  }, [key, value, enabled, delayMs]);
}
