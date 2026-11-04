// El listado de Préstamos: el orden que elige el usuario, la descripción de cada card y
// sus últimos movimientos. Lo que más cuida: que "Vence antes" ordene por la MISMA fecha
// que la card muestra, y que los movimientos sean los de la planilla (no otra historia).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sortLoans, loanDescription, recentMovements, esOrdenValido, lastPayment } from "./loanList.js";
import { resolveStatus, remainingDebt, daysUntilDue, loanLedger, nextCollectionDate } from "./calcs.js";
import { addCalendarMonths, addDays, loanPrincipalAt } from "./utils.js";
import type { Loan, ResolvedLoan } from "../types";

const HOY = "2026-08-25";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

const mk = (o: Partial<Loan> = {}): Loan => ({
  id: "x", clientId: "c", clientName: "Cliente", amount: 1000, interestRate: 10,
  startDate: addCalendarMonths(HOY, -1), dueDate: addDays(HOY, 10),
  paymentType: "30", payments: [], contacts: [], guarantyType: "cash",
  guarantyDetail: "", status: "active", noDueDate: false, notes: "", createdAt: 0, ...o,
});

/** Resuelve los campos que leen el orden y la descripción. Se calcula adentro de cada
 *  `it`: el reloj congelado recién vale después del `beforeAll`. */
const res = (l: Loan) => ({
  ...l,
  _status: resolveStatus(l),
  _remaining: remainingDebt(l),
  _daysUntilDue: daysUntilDue(l),
  _principal: loanPrincipalAt(l),
}) as ResolvedLoan;

const cartera = () => [
  // vence en 10 días, debe 1.100
  mk({ id: "pronto", clientName: "Ana" }),
  // vence en 40 días, debe 5.500
  mk({ id: "lejos", clientName: "Beto", amount: 5000, dueDate: addDays(HOY, 40) }),
  // venció hace 2 meses: su próximo cobro es el re-vencimiento, no el vencimiento original
  mk({ id: "atrasado", clientName: "Carla", amount: 3000,
       startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2).replace(/-\d\d$/, "-28") }),
  // cobrado: no vence y debe cero
  mk({ id: "pagado", clientName: "Dario", status: "paid", amount: 200,
       payments: [{ id: "p", amount: 220, date: addDays(HOY, -1) }] }),
].map(res);

const ids = (ls: ResolvedLoan[]) => ls.map((l) => l.id);

describe("sortLoans", () => {
  it("Vence antes: por la próxima fecha de cobro que muestra la card, con los cerrados al final", () => {
    const ls = cartera();
    const fechas = Object.fromEntries(ls.map((l) => [l.id, nextCollectionDate(l)]));
    // Precondición: el atrasado vuelve a cobrar el 28 de este mes, antes que "pronto".
    expect(fechas.atrasado < fechas.pronto).toBe(true);
    expect(ids(sortLoans(ls, "due"))).toEqual(["atrasado", "pronto", "lejos", "pagado"]);
  });

  it("Mayor y menor monto: por lo que debe, y los cerrados al final en los dos", () => {
    const ls = cartera();
    expect(ids(sortLoans(ls, "amountDesc"))).toEqual(["lejos", "atrasado", "pronto", "pagado"]);
    // Sin la regla, el pagado (debe 0) quedaba primero en "menor monto" y tapaba a los vivos.
    expect(ids(sortLoans(ls, "amountAsc"))).toEqual(["pronto", "atrasado", "lejos", "pagado"]);
  });

  it("Prioridad (el de siempre): atrasados primero, después el que vence antes", () => {
    expect(ids(sortLoans(cartera(), "priority"))).toEqual(["atrasado", "pronto", "lejos", "pagado"]);
  });

  it("un préstamo sin vencimiento va después de los que tienen fecha", () => {
    const ls = [...cartera(), res(mk({ id: "sinFecha", noDueDate: true, dueDate: "" }))];
    const orden = ids(sortLoans(ls, "due"));
    expect(orden.indexOf("sinFecha")).toBe(3);
  });

  it("ordena una copia: no muta el array que recibe (suele ser un memo)", () => {
    const ls = cartera();
    const antes = ids(ls);
    sortLoans(ls, "amountDesc");
    expect(ids(ls)).toEqual(antes);
  });

  it("esOrdenValido descarta lo que no es un orden conocido", () => {
    expect(esOrdenValido("due")).toBe(true);
    expect(esOrdenValido("otro")).toBe(false);
    expect(esOrdenValido(undefined)).toBe(false);
  });
});

describe("loanDescription", () => {
  it("dice cuánto se prestó, el ciclo y la garantía concreta", () => {
    const l = res(mk({ amount: 7000, guarantyType: "vehicle",
                       vehicle: { model: "Toyota Corolla", plate: "AB123CD" } }));
    expect(loanDescription(l, "US$")).toBe("US$7.000 prestados · ciclo mensual · Toyota Corolla AB123CD");
  });

  it("el capital incluye los adicionales entregados, y lo avisa", () => {
    const l = res(mk({ amount: 1000, extras: [{ id: "e", amount: 500, date: addDays(HOY, -3) }] }));
    expect(loanDescription(l, "$")).toBe("$1.500 prestados · 1 adicional · ciclo mensual");
  });

  it("quincenal, sin vencimiento, refinanciación y detalle de garantía", () => {
    expect(loanDescription(res(mk({ paymentType: "15", guarantyDetail: " Reloj " })), "$"))
      .toBe("$1.000 prestados · ciclo quincenal · Reloj");
    expect(loanDescription(res(mk({ noDueDate: true, dueDate: "" })), "$"))
      .toBe("$1.000 prestados · sin vencimiento");
    expect(loanDescription(res(mk({ refinancedFromId: "viejo" })), "$"))
      .toBe("Refinanciación por $1.000 · ciclo mensual");
  });

  it("con los saldos ocultos no muestra el monto", () => {
    expect(loanDescription(res(mk()), "$", true)).not.toMatch(/1\.000/);
  });
});

describe("recentMovements", () => {
  it("son las últimas filas de la planilla, la más reciente primero", () => {
    const l = mk({
      startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [
        { id: "a", amount: 100, date: addCalendarMonths(HOY, -2) },
        { id: "b", amount: 300, date: addDays(HOY, -2) },
      ],
    });
    const movs = recentMovements(l, 2);
    const reales = loanLedger(l).filter((r) => !r.enCurso);
    expect(movs).toEqual(reales.slice(-2).reverse());
    // Re-vence hoy, así que lo último que pasó es ese cargo; antes, el pago de hace 2 días.
    expect(movs[0]).toMatchObject({ kind: "interes", date: HOY, detalle: "Interés por mora" });
    expect(movs[1]).toMatchObject({ kind: "pago", haber: 300, date: addDays(HOY, -2) });
  });

  it("no cuenta el interés del ciclo en curso: no es algo que haya pasado", () => {
    // Préstamo nuevo, todavía no vencido: la planilla trae capital + ciclo en curso.
    const l = mk({ startDate: addDays(HOY, -5), dueDate: addDays(HOY, 25) });
    expect(loanLedger(l).some((r) => r.enCurso)).toBe(true);
    const movs = recentMovements(l, 2);
    expect(movs).toHaveLength(1);
    expect(movs[0].kind).toBe("capital");
  });

  it("un préstamo sin capital no tiene movimientos", () => {
    expect(recentMovements(mk({ amount: 0 }))).toEqual([]);
  });
});

describe("lastPayment", () => {
  it("el más reciente por fecha, aunque no sea el último cargado", () => {
    const l = mk({ payments: [
      { id: "b", amount: 300, date: addDays(HOY, -2) },
      { id: "a", amount: 100, date: addDays(HOY, -40) },
    ] });
    expect(lastPayment(l)).toEqual({ date: addDays(HOY, -2), amount: 300 });
  });

  it("sin pagos (o sólo pagos rotos) es null", () => {
    expect(lastPayment(mk())).toBeNull();
    expect(lastPayment(mk({ payments: [{ id: "x", amount: 0, date: HOY }] }))).toBeNull();
  });
});
