import { useEffect, useRef } from "react";
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
