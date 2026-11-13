// El mapa de vencimientos tiene que ubicar a cada préstamo en la MISMA fecha que dicen la
// card, el detalle y el push (`nextCollectionDate`). Cuando tenía su propia regla, un
// préstamo que volvió a "activo" con el vencimiento ya pasado no aparecía.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fechasDeCobro } from "./agenda.js";
import { nextCollectionDate, resolveStatus, remainingDebt, daysUntilDue } from "./calcs.js";
import { addCalendarMonths, addDays } from "./utils.js";
import type { Loan, ResolvedLoan } from "../types";

const HOY = "2026-11-12";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 12, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

const mk = (o: Partial<Loan> = {}): Loan => ({
  id: "x", clientId: "c", clientName: "Cliente", amount: 10000, interestRate: 10,
  startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
  paymentType: "30", payments: [], contacts: [], guarantyType: "cash",
  guarantyDetail: "", status: "active", noDueDate: false, notes: "", createdAt: 0, ...o,
});
const res = (l: Loan) => ({
  ...l, _status: resolveStatus(l), _remaining: remainingDebt(l), _daysUntilDue: daysUntilDue(l),
}) as ResolvedLoan;
const enVentana = (d: string) => d >= HOY && d <= addDays(HOY, 29);

describe("fechasDeCobro", () => {
  it("activo que todavía no venció: su vencimiento", () => {
    const l = res(mk({ dueDate: addDays(HOY, 10) }));
    expect(fechasDeCobro(l, HOY)).toEqual([{ date: addDays(HOY, 10), renewal: false }]);
  });

  it("REGRESIÓN: activo con el vencimiento ya pasado (pagó casi todo) cae en su próximo cobro", () => {
    // Venció hace 20 días y pagó lo suficiente para volver a "active". El mapa lo ubicaba
    // en `dueDate` (pasado) y el préstamo no aparecía en ningún día de la ventana.
    const l = res(mk({
      startDate: addDays(HOY, -50), dueDate: addDays(HOY, -20),
      payments: [{ id: "p", amount: 10500, date: addDays(HOY, -5) }],
    }));
    expect(l._status).toBe("active"); // precondición: es el caso que fallaba
    const f = fechasDeCobro(l, HOY);
    expect(f).toHaveLength(1);
    expect(f[0].date).toBe(nextCollectionDate(l, HOY));
    expect(enVentana(f[0].date)).toBe(true);
    expect(f[0].renewal).toBe(true);
  });

  it("atrasado: su próximo re-vencimiento", () => {
    const l = res(mk({ startDate: addDays(HOY, -70), dueDate: addDays(HOY, -40) }));
    expect(l._status).toBe("overdue");
    expect(fechasDeCobro(l, HOY)).toEqual([{ date: nextCollectionDate(l, HOY), renewal: true }]);
  });

  it("atrasado que vence HOY (día 0): aparece hoy y también en su re-vencimiento", () => {
    const l = res(mk({ startDate: addDays(HOY, -30), dueDate: HOY }));
    expect(l._status).toBe("overdue");
    const f = fechasDeCobro(l, HOY);
    expect(f[0]).toEqual({ date: HOY, renewal: false });
    expect(f[1].renewal).toBe(true);
  });

  it("cerrado: no aparece", () => {
    expect(fechasDeCobro(res(mk({ status: "paid", payments: [{ id: "p", amount: 99999, date: HOY }] })), HOY)).toEqual([]);
  });

  it("con un adelanto, el mapa y la card dicen la misma fecha (puede quedar fuera de los 30 días)", () => {
    const l = res(mk({ startDate: addDays(HOY, -50), dueDate: addDays(HOY, -20), advancedAt: [HOY] }));
    const f = fechasDeCobro(l, HOY);
    expect(f.map((x) => x.date)).toContain(nextCollectionDate(l, HOY));
  });

  it("barrido: para toda forma de préstamo, la fecha del mapa es la de la card", () => {
    const variantes: Partial<Loan>[] = [];
    for (const paymentType of ["30", "15"] as const) {
      for (const dueOffset of [10, 1, 0, -5, -20, -40, -75]) {
        for (const pago of [false, true]) {
          for (const adv of [false, true]) {
            variantes.push({
              paymentType, startDate: addDays(HOY, dueOffset - 30), dueDate: addDays(HOY, dueOffset),
              payments: pago ? [{ id: "p", amount: 9000, date: addDays(HOY, -3) }] : [],
              advancedAt: adv ? [HOY] : undefined,
            });
          }
        }
      }
    }
    for (const v of variantes) {
      const l = res(mk(v));
      if (l._status !== "active" && l._status !== "overdue") continue;
      const fechas = fechasDeCobro(l, HOY).map((f) => f.date);
      expect(fechas, JSON.stringify(v)).toContain(nextCollectionDate(l, HOY));
    }
  });
});

// ── Qué pasa con la fecha de cobro cuando hay un adelanto ─────────────────────────────────
// El sheet "Adelantar vencimiento" promete que el cobro se corre UN ciclo. Con el vencimiento
// todavía por delante la app lo corría DOS (vence el 22-nov, adelantás el 12: decía 22-ene en
// vez de 22-dic), y el préstamo se caía del mapa, de la card y del push.
describe("un adelanto corre el cobro un ciclo", () => {
  const unCiclo = (l: Loan, d: string) =>
    l.paymentType === "30" ? addCalendarMonths(d, 1) : addDays(d, 15);

  const casos: [string, Partial<Loan>][] = [
    ["30d · vence en 10d (todavía no venció)", { dueDate: addDays(HOY, 10) }],
    ["30d · vence mañana", { dueDate: addDays(HOY, 1) }],
    ["30d · vence HOY", { dueDate: HOY }],
    ["30d · venció hace 5d", { dueDate: addDays(HOY, -5) }],
    ["30d · venció hace 40d (1 ciclo corrido)", { dueDate: addDays(HOY, -40) }],
    ["30d · venció hace 75d (2 ciclos corridos)", { dueDate: addDays(HOY, -75) }],
    ["15d · vence en 6d", { paymentType: "15", dueDate: addDays(HOY, 6) }],
    ["15d · venció hace 20d", { paymentType: "15", dueDate: addDays(HOY, -20) }],
  ];

  it.each(casos)("%s", (_n, o) => {
    const antes = mk(o);
    const despues = mk({ ...o, advancedAt: [HOY] });
    expect(nextCollectionDate(despues, HOY)).toBe(unCiclo(antes, nextCollectionDate(antes, HOY)));
  });

  it("EL CASO: vence el 22-nov, adelanta el 12-nov → el cobro pasa al 22-dic (no al 22-ene)", () => {
    const l = mk({ dueDate: "2026-11-22", advancedAt: ["2026-11-12"] });
    expect(nextCollectionDate(l, "2026-11-12")).toBe("2026-12-22");
  });

  it("y entra al mapa cuando se acerca (a 20 días del 22-dic ya está en la ventana)", () => {
    const l = res(mk({ dueDate: "2026-11-22", advancedAt: ["2026-11-12"] }));
    // El 05-dic faltan 17 días para el 22-dic.
    vi.setSystemTime(new Date(2026, 11, 5, 12, 0, 0));
    expect(fechasDeCobro(res(mk({ dueDate: "2026-11-22", advancedAt: ["2026-11-12"] })), "2026-12-05").map((f) => f.date)).toContain("2026-12-22");
    vi.setSystemTime(new Date(2026, 10, 12, 12, 0, 0));
    expect(l).toBeTruthy();
  });

  it("no da un salto el día después de pasar el vencimiento (el adelanto ya lo había pagado)", () => {
    const l = mk({ dueDate: "2026-11-22", advancedAt: ["2026-11-12"] });
    for (const dia of ["2026-11-21", "2026-11-22", "2026-11-23", "2026-12-01", "2026-12-21"]) {
      expect(nextCollectionDate(l, dia), dia).toBe("2026-12-22");
    }
  });

  it("un adelanto viejo no corre el cobro para siempre: una vez que pasó el vencimiento que pagó, sigue el calendario", () => {
    // Venció el 07-nov; adelantó el 12-nov (pagó el 07-dic). El 08-dic el cobro es el 07-ene.
    const l = mk({ dueDate: "2026-11-07", advancedAt: ["2026-11-12"] });
    expect(nextCollectionDate(l, "2026-11-13")).toBe("2027-01-07");
    expect(nextCollectionDate(l, "2026-12-08")).toBe("2027-01-07");
  });

  it("dos adelantos antes de vencer pagan dos vencimientos", () => {
    const l = mk({ dueDate: "2026-11-22", advancedAt: ["2026-11-10", "2026-11-12"] });
    expect(nextCollectionDate(l, "2026-11-12")).toBe("2027-01-22");
  });

  it("un adelanto fechado a futuro todavía no cuenta", () => {
    const l = mk({ dueDate: addDays(HOY, 10), advancedAt: [addDays(HOY, 3)] });
    expect(nextCollectionDate(l, HOY)).toBe(addDays(HOY, 10));
  });
});
