// La conversión pesos ↔ dólares de la card de ganancia. Lo que cuida: que cada sentido
// use la punta del blue que efectivamente se consigue, y que sin cotización válida no se
// invente un número.
import { describe, it, expect } from "vitest";
import { equivalenteBlue, blueMensual } from "./dolar.js";

const blue = { value_buy: 1400, value_sell: 1450 };

describe("equivalenteBlue", () => {
  it("dólares → pesos al blue COMPRA (lo que te dan al vender los dólares)", () => {
    expect(equivalenteBlue(1000, "US$", blue)).toEqual({ amount: 1_400_000, currency: "$", rate: 1400, side: "compra" });
  });

  it("pesos → dólares al blue VENTA (lo que pagás para comprarlos)", () => {
    const eq = equivalenteBlue(1_450_000, "$", blue);
    expect(eq?.currency).toBe("US$");
    expect(eq?.side).toBe("venta");
    expect(eq?.amount).toBeCloseTo(1000, 6);
  });

  it("una pérdida sigue siendo pérdida en la otra moneda", () => {
    expect(equivalenteBlue(-10, "US$", blue)?.amount).toBe(-14_000);
  });

  it("con euros no hay equivalente", () => {
    expect(equivalenteBlue(100, "€", blue)).toBeNull();
  });

  it("sin cotización, o con una cotización rota, no hay equivalente", () => {
    expect(equivalenteBlue(100, "US$", null)).toBeNull();
    expect(equivalenteBlue(100, "US$", undefined)).toBeNull();
    expect(equivalenteBlue(100, "US$", { value_buy: 0, value_sell: 0 })).toBeNull();
    // Dividir por cero daría Infinity en pantalla.
    expect(equivalenteBlue(100, "$", { value_buy: 1400, value_sell: 0 })).toBeNull();
    expect(equivalenteBlue(Number.NaN, "US$", blue)).toBeNull();
  });
});

describe("blueMensual: el blue promedio de cada mes", () => {
  it("promedia sólo el blue, por mes", () => {
    const dias = [
      { date: "2026-10-01", source: "Blue", value_buy: 1400, value_sell: 1420 },
      { date: "2026-10-31", source: "Blue", value_buy: 1500, value_sell: 1520 },
      { date: "2026-10-15", source: "Oficial", value_buy: 1, value_sell: 1 },
      { date: "2026-11-02", source: "Blue", value_buy: 1550, value_sell: 1570 },
    ];
    expect(blueMensual(dias)).toEqual({
      "2026-10": { value_buy: 1450, value_sell: 1470 },
      "2026-11": { value_buy: 1550, value_sell: 1570 },
    });
  });

  it("descarta lo roto en vez de meter un cero en el promedio", () => {
    const dias = [
      null, "x", { source: "Blue" }, { date: "sin-fecha", source: "Blue", value_buy: 1, value_sell: 1 },
      { date: "2026-10-01", source: "Blue", value_buy: 0, value_sell: 1420 },
      { date: "2026-10-02", source: "Blue", value_buy: 1400, value_sell: 1420 },
    ];
    expect(blueMensual(dias)).toEqual({ "2026-10": { value_buy: 1400, value_sell: 1420 } });
  });

  it("lo que no es una lista no tiene meses", () => {
    expect(blueMensual({})).toEqual({});
    expect(blueMensual(null)).toEqual({});
  });

  it("con el promedio del mes, la misma ganancia en dólares da distintos pesos según el mes", () => {
    const meses = blueMensual([
      { date: "2026-09-10", source: "Blue", value_buy: 1300, value_sell: 1320 },
      { date: "2026-10-10", source: "Blue", value_buy: 1450, value_sell: 1470 },
    ]);
    expect(equivalenteBlue(1000, "US$", meses["2026-09"])?.amount).toBe(1_300_000);
    expect(equivalenteBlue(1000, "US$", meses["2026-10"])?.amount).toBe(1_450_000);
  });
});
