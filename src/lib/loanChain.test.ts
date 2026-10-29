import { describe, it, expect } from "vitest";
import { refinanceChain } from "./loanChain.js";

const L = (id: string, refinancedFromId?: string) => ({ id, refinancedFromId });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("refinanceChain", () => {
  it("un préstamo suelto es una cadena de uno", () => {
    const a = L("a");
    expect(ids(refinanceChain([a, L("z")], a))).toEqual(["a"]);
  });

  it("devuelve la cadena completa sea cual sea el eslabón desde el que se pregunta", () => {
    const todos = [L("c", "b"), L("a"), L("b", "a"), L("x")];
    for (const id of ["a", "b", "c"]) {
      const eslabon = todos.find((l) => l.id === id)!;
      expect(ids(refinanceChain(todos, eslabon))).toEqual(["a", "b", "c"]);
    }
  });

  it("un padre borrado corta la cadena ahí en vez de fallar", () => {
    const b = L("b", "borrado");
    expect(ids(refinanceChain([b, L("c", "b")], b))).toEqual(["b", "c"]);
  });

  it("no se cuelga con un ciclo de dos (A refinancia a B y B a A)", () => {
    const a = L("a", "b"), b = L("b", "a");
    const cadena = refinanceChain([a, b], a);
    expect(cadena.length).toBeLessThanOrEqual(2);
    expect(new Set(ids(cadena)).size).toBe(cadena.length);
  });

  it("no se cuelga con un préstamo que se refinancia a sí mismo", () => {
    const a = L("a", "a");
    expect(ids(refinanceChain([a], a))).toEqual(["a"]);
  });

  it("no se cuelga con un ciclo largo", () => {
    const todos = [L("a", "c"), L("b", "a"), L("c", "b")];
    const cadena = refinanceChain(todos, todos[0]);
    expect(cadena.length).toBe(3);
    expect(new Set(ids(cadena)).size).toBe(3);
  });

  it("con dos hijos manda el primero, como el find que había antes", () => {
    const todos = [L("a"), L("b1", "a"), L("b2", "a")];
    expect(ids(refinanceChain(todos, todos[0]))).toEqual(["a", "b1"]);
  });
});
