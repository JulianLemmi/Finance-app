import { describe, it, expect, vi, beforeEach } from "vitest";
import { tryReloadForStaleChunk, CHUNK_RELOAD_COOLDOWN_MS } from "./chunkReload.js";

beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

describe("tryReloadForStaleChunk", () => {
  it("la primera vez recarga", () => {
    const reload = vi.fn();
    expect(tryReloadForStaleChunk(1_000_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("no recarga de nuevo dentro de la ventana: así se evita el bucle", () => {
    const reload = vi.fn();
    tryReloadForStaleChunk(1_000_000, reload);
    expect(tryReloadForStaleChunk(1_000_000 + CHUNK_RELOAD_COOLDOWN_MS - 1, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("pasada la ventana vuelve a poder recargar", () => {
    const reload = vi.fn();
    tryReloadForStaleChunk(1_000_000, reload);
    expect(tryReloadForStaleChunk(1_000_000 + CHUNK_RELOAD_COOLDOWN_MS, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("un valor guardado corrupto no bloquea para siempre", () => {
    sessionStorage.setItem("finance:chunk-reload-at", "no-es-un-numero");
    const reload = vi.fn();
    expect(tryReloadForStaleChunk(5_000_000, reload)).toBe(true);
  });

  it("si no puede leer sessionStorage, NO recarga (preferible a arriesgar un bucle)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const reload = vi.fn();
    expect(tryReloadForStaleChunk(1_000_000, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("si no puede escribir sessionStorage, tampoco recarga", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("lleno"); });
    const reload = vi.fn();
    expect(tryReloadForStaleChunk(1_000_000, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
