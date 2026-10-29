// useStorageSync: el debounce no puede costar un cambio. Si la página se oculta o se cierra
// dentro de la ventana de espera, lo pendiente se escribe de inmediato.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

vi.mock("./storage.js", () => ({
  storage: { set: vi.fn(async () => {}) },
  STORAGE_SAVE_FAILED_EVENT: "finance:storage-save-failed",
}));
import { storage } from "./storage.js";
import { useStorageSync } from "./hooks.js";

const set = storage.set as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.useFakeTimers(); set.mockClear(); });
// Sin `globals`, testing-library no limpia solo entre tests: los hooks de los tests
// anteriores seguían montados y respondían a los mismos eventos de window.
afterEach(() => { cleanup(); vi.useRealTimers(); });

/** Monta el hook ya hidratado: el primer valor no se escribe (era lo recién cargado). */
const montar = (valorInicial: unknown) => {
  const h = renderHook(({ v }) => useStorageSync("k", v, true), { initialProps: { v: valorInicial } });
  return h;
};

describe("useStorageSync", () => {
  it("no reescribe lo que acaba de hidratarse", () => {
    montar([1]);
    vi.advanceTimersByTime(1000);
    expect(set).not.toHaveBeenCalled();
  });

  it("escribe el cambio pasado el debounce, una sola vez", () => {
    const h = montar([1]);
    h.rerender({ v: [1, 2] });
    vi.advanceTimersByTime(299);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("k", [1, 2]);
  });

  it("varios cambios seguidos escriben sólo el último", () => {
    const h = montar([1]);
    h.rerender({ v: [1, 2] });
    vi.advanceTimersByTime(100);
    h.rerender({ v: [1, 2, 3] });
    vi.advanceTimersByTime(1000);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("k", [1, 2, 3]);
  });

  it("si la página se cierra antes de que venza el debounce, el cambio se escribe igual", () => {
    const h = montar([1]);
    h.rerender({ v: [1, 2] });
    vi.advanceTimersByTime(50);
    window.dispatchEvent(new Event("pagehide"));
    expect(set).toHaveBeenCalledWith("k", [1, 2]);
  });

  it("si la pestaña pasa a segundo plano, también", () => {
    const h = montar([1]);
    h.rerender({ v: [9] });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    expect(set).toHaveBeenCalledWith("k", [9]);
  });

  it("no escribe dos veces: lo que ya se vació al ocultarse no se repite con el timer", () => {
    const h = montar([1]);
    h.rerender({ v: [1, 2] });
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(1000);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("ocultarse sin cambios pendientes no escribe nada", () => {
    montar([1]);
    window.dispatchEvent(new Event("pagehide"));
    expect(set).not.toHaveBeenCalled();
  });
});

describe("useStorageSync: un guardado fallido se reintenta al volver la conexión", () => {
  const fallo = (key: string) =>
    window.dispatchEvent(new CustomEvent("finance:storage-save-failed", { detail: { key } }));

  it("tras un fallo, al reconectar se reenvía el valor más reciente", () => {
    const h = montar([1]);
    h.rerender({ v: [1, 2] });
    vi.advanceTimersByTime(300);
    expect(set).toHaveBeenCalledTimes(1);
    fallo("k");
    set.mockClear();
    window.dispatchEvent(new Event("online"));
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("k", [1, 2]);
  });

  it("reenvía el valor de AHORA, no el que falló", () => {
    const h = montar([1]);
    h.rerender({ v: [1, 2] });
    vi.advanceTimersByTime(300);
    fallo("k");
    // Sigue editando sin conexión: el reintento tiene que llevar lo último.
    h.rerender({ v: [1, 2, 3] });
    set.mockClear();
    window.dispatchEvent(new Event("online"));
    expect(set).toHaveBeenCalledWith("k", [1, 2, 3]);
  });

  it("sin ningún fallo previo, reconectar no escribe nada", () => {
    montar([1]);
    window.dispatchEvent(new Event("online"));
    expect(set).not.toHaveBeenCalled();
  });

  it("el fallo de OTRA clave no dispara el reintento de ésta", () => {
    montar([1]);
    fallo("otra-clave");
    window.dispatchEvent(new Event("online"));
    expect(set).not.toHaveBeenCalled();
  });

  it("después de reintentar, otro 'online' no repite el guardado", () => {
    montar([1]);
    fallo("k");
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("si el reintento vuelve a fallar, queda pendiente para la próxima reconexión", () => {
    montar([1]);
    fallo("k");
    window.dispatchEvent(new Event("online"));
    fallo("k"); // el reintento también falló
    set.mockClear();
    window.dispatchEvent(new Event("online"));
    expect(set).toHaveBeenCalledTimes(1);
  });
});
