import { describe, it, expect } from "vitest";
import { assetValueAt, liabilityOwedAt, nextValueHistory, sumAssetsAt } from "./patrimonio.js";
import type { Asset, Liability } from "../types";

const fijo = (extra: Partial<Asset> = {}): Asset => ({ id: "a", category: "other", description: "", value: 1000, ...extra });

describe("activo en cuotas", () => {
  const auto = fijo({
    value: 300,
    installments: [
      { id: "c1", amount: 100, date: "2026-08-10" },
      { id: "c2", amount: 100, date: "2026-09-10" },
      { id: "c3", amount: 100, date: "2026-10-10" },
    ],
  });
  it("cada mes vale lo pagado hasta ese mes: la cuota de hoy no sube los anteriores", () => {
    expect(assetValueAt(auto, "2026-07-31")).toBe(0);
    expect(assetValueAt(auto, "2026-08-31")).toBe(100);
    expect(assetValueAt(auto, "2026-09-30")).toBe(200);
    expect(assetValueAt(auto, "2026-10-31")).toBe(300);
  });
});

describe("activo de valor fijo", () => {
  it("antes de su fecha de compra no cuenta", () => {
    const reloj = fijo({ value: 500, acquiredAt: "2026-11-03", valueHistory: [{ date: "2026-11-03", value: 500 }] });
    expect(assetValueAt(reloj, "2026-10-31")).toBe(0);
    expect(assetValueAt(reloj, "2026-11-03")).toBe(500);
  });
  it("revaluarlo no cambia los meses cerrados", () => {
    const a = fijo({
      value: 1200, acquiredAt: "2026-01-15",
      valueHistory: [{ date: "2026-01-15", value: 1000 }, { date: "2026-10-20", value: 1200 }],
    });
    expect(assetValueAt(a, "2026-09-30")).toBe(1000);
    expect(assetValueAt(a, "2026-10-31")).toBe(1200);
  });
  it("uno viejo sin fecha ni historial cuenta en todos los meses, como antes", () => {
    expect(assetValueAt(fijo(), "2020-01-31")).toBe(1000);
  });
});

describe("deuda propia", () => {
  const d: Liability = {
    id: "d", name: "Hermano", amount: 1000, startDate: "2026-08-01", createdAt: 0,
    payments: [{ id: "p1", amount: 200, date: "2026-09-05" }, { id: "p2", amount: 200, date: "2026-10-05" }],
  };
  it("lo que se debía en cada fecha: el pago de hoy no baja la deuda de los meses pasados", () => {
    expect(liabilityOwedAt(d, "2026-07-31")).toBe(0);
    expect(liabilityOwedAt(d, "2026-08-31")).toBe(1000);
    expect(liabilityOwedAt(d, "2026-09-30")).toBe(800);
    expect(liabilityOwedAt(d, "2026-10-31")).toBe(600);
  });
});

describe("nextValueHistory (lo arma el reducer)", () => {
  const HOY = "2026-11-03";
  it("al darlo de alta, el valor arranca en su fecha de compra", () => {
    expect(nextValueHistory(undefined, fijo({ acquiredAt: "2026-10-01" }), HOY)).toEqual([{ date: "2026-10-01", value: 1000 }]);
  });
  it("un cambio de valor se fecha hoy y conserva el anterior", () => {
    const prev = fijo({ acquiredAt: "2026-01-15", valueHistory: [{ date: "2026-01-15", value: 1000 }] });
    expect(nextValueHistory(prev, { ...prev, value: 1500 }, HOY)).toEqual([
      { date: "2026-01-15", value: 1000 }, { date: HOY, value: 1500 },
    ]);
  });
  it("dos cambios el mismo día no dejan escalones: corrige el de hoy", () => {
    const prev = fijo({ valueHistory: [{ date: "2026-01-15", value: 1000 }, { date: HOY, value: 1500 }] });
    expect(nextValueHistory(prev, { ...prev, value: 1400 }, HOY)).toEqual([
      { date: "2026-01-15", value: 1000 }, { date: HOY, value: 1400 },
    ]);
  });
  it("a un activo viejo le guarda su valor anterior 'desde siempre'", () => {
    const prev = fijo();
    const h = nextValueHistory(prev, { ...prev, value: 2000 }, HOY)!;
    expect(h).toEqual([{ date: "", value: 1000 }, { date: HOY, value: 2000 }]);
    expect(assetValueAt({ ...prev, value: 2000, valueHistory: h }, "2026-09-30")).toBe(1000);
  });
  it("cargarle la fecha de compra a uno viejo lo saca de los meses anteriores", () => {
    const prev = fijo();
    const next = { ...prev, acquiredAt: "2026-10-01" };
    const h = nextValueHistory(prev, next, HOY)!;
    expect(sumAssetsAt([{ ...next, valueHistory: h }], "2026-09-30")).toBe(0);
    expect(sumAssetsAt([{ ...next, valueHistory: h }], "2026-10-31")).toBe(1000);
  });
  it("un activo en cuotas no lleva historial", () => {
    expect(nextValueHistory(undefined, fijo({ installments: [{ id: "c", amount: 1, date: HOY }] }), HOY)).toBeUndefined();
  });
});
