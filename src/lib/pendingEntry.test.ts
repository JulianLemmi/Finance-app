import { describe, it, expect } from "vitest";
import { pagoPendiente, costoPendiente } from "./pendingEntry.js";

describe("pagoPendiente (pago de una deuda, cuota de un activo)", () => {
  it("sin monto es una fila vacía: ni bloquea ni agrega nada", () => {
    expect(pagoPendiente("", "2026-10-29")).toEqual({ estado: "vacio" });
    expect(pagoPendiente("   ", "2026-10-29")).toEqual({ estado: "vacio" });
    // La fecha sola no cuenta: viene precargada con hoy.
    expect(pagoPendiente("", "")).toEqual({ estado: "vacio" });
  });

  it("monto y fecha válidos: listo para registrarse", () => {
    expect(pagoPendiente("30000", "2026-10-29")).toEqual({ estado: "listo", entrada: { amount: 30000, date: "2026-10-29" } });
    expect(pagoPendiente("1500.5", "2026-10-01")).toEqual({ estado: "listo", entrada: { amount: 1500.5, date: "2026-10-01" } });
  });

  it("un monto que no es un pago queda incompleto: no se tira ni se registra", () => {
    for (const monto of ["0", "-10", "abc", "Infinity"]) {
      expect(pagoPendiente(monto, "2026-10-29")).toEqual({ estado: "incompleto", motivo: "El monto tiene que ser mayor a 0" });
    }
  });

  it("sin fecha queda incompleto", () => {
    expect(pagoPendiente("100", "")).toEqual({ estado: "incompleto", motivo: "Falta la fecha" });
  });
});

describe("costoPendiente (costo de preparación de un auto)", () => {
  it("las dos vacías: fila vacía", () => {
    expect(costoPendiente("", "")).toEqual({ estado: "vacio" });
    expect(costoPendiente("  ", " ")).toEqual({ estado: "vacio" });
  });

  it("completo: listo, con la descripción recortada", () => {
    expect(costoPendiente("  Pintura ", "20000")).toEqual({ estado: "listo", entrada: { description: "Pintura", amount: 20000 } });
  });

  it("a medio cargar dice qué falta", () => {
    expect(costoPendiente("Pintura", "")).toEqual({ estado: "incompleto", motivo: "Falta el monto del costo" });
    expect(costoPendiente("", "20000")).toEqual({ estado: "incompleto", motivo: "Falta la descripción del costo" });
    expect(costoPendiente("Pintura", "0")).toEqual({ estado: "incompleto", motivo: "El monto tiene que ser mayor a 0" });
  });
});
