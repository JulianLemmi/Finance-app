import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { leerLista, leerObjeto } from "./hydrate.js";
import { stripComputed } from "./utils.js";

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
// Sin restaurar, el espía acumula las llamadas de los tests anteriores.
afterEach(() => { vi.restoreAllMocks(); });

describe("leerLista", () => {
  it("devuelve la lista tal cual cuando todo son objetos", () => {
    const l = [{ id: "a" }, { id: "b" }];
    expect(leerLista<{ id: string }>(l)).toEqual(l);
  });

  it("lo que no es un array es una lista vacía", () => {
    for (const v of [undefined, null, "texto", 5, {}, { length: 2 }]) {
      expect(leerLista(v)).toEqual([]);
    }
  });

  it("descarta los elementos que no son objetos", () => {
    const r = leerLista<{ id: string }>([{ id: "a" }, null, undefined, 7, "x", [1, 2], { id: "b" }]);
    expect(r).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("avisa por consola cuando descarta algo, con el nombre de la lista", () => {
    leerLista([null, {}], "préstamos");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"préstamos"'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("1 elemento"));
  });

  it("no avisa si no descartó nada", () => {
    leerLista([{ a: 1 }], "x");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("el caso que colgaba la app: un null en la lista ya no hace fallar stripComputed", () => {
    // Antes: stripComputed(null) -> Object.keys(null) -> TypeError, la hidratación
    // fallaba y la app se quedaba para siempre en el esqueleto de carga.
    expect(() => [{ id: "a", _x: 1 }, null].map(stripComputed as (x: unknown) => unknown)).toThrow();
    const limpia = leerLista<{ id: string }>([{ id: "a", _x: 1 }, null]).map(stripComputed);
    expect(limpia).toEqual([{ id: "a" }]);
  });
});

describe("leerObjeto", () => {
  it("devuelve un objeto", () => {
    expect(leerObjeto({ a: 1 })).toEqual({ a: 1 });
  });

  it("lo que no es un objeto es undefined", () => {
    for (const v of [undefined, null, "x", 3, true, [1], []]) {
      expect(leerObjeto(v)).toBeUndefined();
    }
  });
});
