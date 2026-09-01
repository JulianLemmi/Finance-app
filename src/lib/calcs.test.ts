// Tests de las fórmulas financieras. Todo lo que acá se afirma es plata que el usuario
// ve en pantalla, así que ante una falla la sospecha default es la fórmula, no el test.
//
// El reloj está congelado (ver `beforeAll`): muchas fórmulas dependen de "hoy" y sin
// fijarlo los tests pasarían o fallarían según el día en que se corran.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  remainingDebt, remainingDebtAt, loanCapitalAt, interestAccruals, upcomingInterest,
  nextPeriodInterest, compoundReturn, expectedReturn, expectedProfit, resolveStatus,
  paidAmount, calcProjection, projectHorizon, DAYS_PER_MONTH, isOverdue, daysUntilDue, validateLoan, loanIntegrityErrors,
} from "./calcs.js";
import {
  loanPeriodDate, loanElapsedPeriods, addCalendarMonths, addDays, getNextRenewalDate,
  getLoanCycleDays, todayISO, todayDate, myShare, daysBetween, loanDeployedFrom,
} from "./utils.js";
import type { Loan } from "../types";

const HOY = "2026-08-25";

beforeAll(() => {
  vi.useFakeTimers();
  // Mediodía local, para que ninguna conversión de zona horaria cambie el día.
  vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

/** Préstamo base: $100.000 al 10%, ciclo de 30 días. Sobreescribir lo que haga falta. */
const mk = (o: Partial<Loan> = {}): Loan => ({
  id: "x", clientId: "c", clientName: "Cliente", amount: 100000, interestRate: 10,
  startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
  paymentType: "30", payments: [], contacts: [], guarantyType: "cash",
  guarantyDetail: "", status: "active", compoundInterest: false, noDueDate: false,
  notes: "", createdAt: 0, ...o,
});

const sumAccruals = (l: Loan) => interestAccruals(l).reduce((s, e) => s + e.amount, 0);

// ─────────────────────────────────────────────────────────────────────────────
describe("fecha del día", () => {
  it("todayISO y todayDate coinciden en el día", () => {
    // Si divergen, unas fórmulas creen que es hoy y otras que es mañana: el mismo
    // préstamo se ve vencido o no según qué función lo mire.
    expect(todayISO()).toBe(todayDate().toISOString().slice(0, 10));
  });

  it("todayISO usa la fecha local, no UTC", () => {
    // 22:00 en Argentina (UTC-3) ya es el día siguiente en UTC. La fecha del usuario
    // sigue siendo el 25.
    vi.setSystemTime(new Date(2026, 7, 25, 22, 0, 0));
    expect(todayISO()).toBe("2026-08-25");
    vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("fechas de ciclo", () => {
  it("un préstamo de 30 días vence siempre el mismo día del mes", () => {
    const l = mk({ paymentType: "30" });
    const fechas = [0, 1, 2, 3].map((n) => loanPeriodDate(l, "2026-06-20", n));
    expect(fechas).toEqual(["2026-06-20", "2026-07-20", "2026-08-20", "2026-09-20"]);
  });

  it("si el mes destino es más corto, cae en su último día", () => {
    const l = mk({ paymentType: "30" });
    expect(loanPeriodDate(l, "2026-01-31", 1)).toBe("2026-02-28");
    expect(loanPeriodDate(l, "2026-01-31", 2)).toBe("2026-03-31");
    expect(loanPeriodDate(l, "2026-01-31", 3)).toBe("2026-04-30");
  });

  it("no arrastra el recorte de fin de mes al mes siguiente", () => {
    // 31 ene → 28 feb → 31 mar (no 28 mar): el ancla sigue siendo el 31.
    expect(addCalendarMonths("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("quincenal y personalizado suman días fijos", () => {
    expect(loanPeriodDate(mk({ paymentType: "15" }), "2026-06-20", 1)).toBe("2026-07-05");
    expect(loanPeriodDate(mk({ paymentType: "custom", customDays: 45 }), "2026-06-20", 2))
      .toBe(addDays("2026-06-20", 90));
  });

  it("getLoanCycleDays prioriza el tipo de pago sobre la distancia entre fechas", () => {
    // Un préstamo "30 días" que cae en un mes de 31 sigue siendo un ciclo de 30.
    expect(getLoanCycleDays(mk({ paymentType: "30", startDate: "2026-07-01", dueDate: "2026-08-01" }))).toBe(30);
  });

  it.each(["30", "15", "custom"] as const)("loanElapsedPeriods es inverso de loanPeriodDate [%s]", (pt) => {
    const l = mk({ paymentType: pt, customDays: 45 });
    for (let n = 0; n <= 24; n++) {
      expect(loanElapsedPeriods(l, "2026-01-31", loanPeriodDate(l, "2026-01-31", n))).toBe(n);
    }
  });

  it("getNextRenewalDate siempre devuelve una fecha futura", () => {
    for (const l of [
      mk({ dueDate: addCalendarMonths(HOY, -1) }),
      mk({ dueDate: addCalendarMonths(HOY, -3) }),
      mk({ paymentType: "15", dueDate: addDays(HOY, -45) }),
      mk({ dueDate: HOY }),
    ]) {
      expect(getNextRenewalDate(l) > HOY).toBe(true);
    }
  });

  it("addDays y daysBetween no se desincronizan al cruzar cambios de hora", () => {
    let d = "2026-01-01";
    for (let i = 0; i < 400; i++) {
      const siguiente = addDays(d, 1);
      expect(daysBetween(d, siguiente)).toBe(1);
      d = siguiente;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("estado del préstamo", () => {
  it("un préstamo vence el mismo día, no al día siguiente", () => {
    expect(isOverdue(mk({ dueDate: HOY }))).toBe(true);
    expect(isOverdue(mk({ dueDate: addDays(HOY, 1) }))).toBe(false);
  });

  it("el día del vencimiento la deuda todavía no suma mora", () => {
    const l = mk({ dueDate: HOY, startDate: addCalendarMonths(HOY, -1) });
    expect(remainingDebt(l)).toBeCloseTo(expectedReturn(l), 2);
  });

  it("un préstamo pagado no vuelve a marcarse vencido", () => {
    const l = mk({ status: "paid", payments: [{ id: "p", amount: 110000, date: addDays(HOY, -10) }] });
    expect(resolveStatus(l)).toBe("paid");
    expect(isOverdue(l)).toBe(false);
  });

  it("vuelve a activo si los pagos cubren el interés acumulado", () => {
    const l = mk({ dueDate: addCalendarMonths(HOY, -1), payments: [{ id: "p", amount: 21000, date: HOY }] });
    expect(remainingDebt(l)).toBeLessThanOrEqual(Number(l.amount));
    expect(resolveStatus(l)).toBe("active");
  });

  it("daysUntilDue es 0 el día del vencimiento", () => {
    expect(daysUntilDue(mk({ dueDate: HOY }))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("deuda y mora", () => {
  const casos = {
    "vencido 1 ciclo": mk({ startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) }),
    "vencido 3 ciclos": mk({ startDate: addCalendarMonths(HOY, -4), dueDate: addCalendarMonths(HOY, -3) }),
    quincenal: mk({ paymentType: "15", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -25) }),
    "custom 45d": mk({ paymentType: "custom", customDays: 45, startDate: addDays(HOY, -100), dueDate: addDays(HOY, -55) }),
    "interés fijo": mk({ interestMode: "fixed", fixedInterest: 8000, interestRate: 0,
                         startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) }),
  };

  it.each(Object.entries(casos))("la deuda es capital + devengado [%s]", (_n, l) => {
    expect(remainingDebt(l)).toBeCloseTo(Number(l.amount) + sumAccruals(l), 2);
  });

  it.each(Object.entries(casos))("compoundReturn coincide con la deuda si no hubo pagos [%s]", (_n, l) => {
    expect(compoundReturn(l)).toBeCloseTo(remainingDebt(l), 2);
  });

  it("el interés fijo suma un monto constante por ciclo, no compone", () => {
    const l = casos["interés fijo"];
    const moras = loanElapsedPeriods(l, l.dueDate, HOY);
    expect(remainingDebt(l)).toBeCloseTo(100000 + 8000 * (1 + moras), 2);
  });

  it("un pago parcial baja la deuda peso por peso", () => {
    const sinPago = mk({ startDate: addDays(HOY, -20), dueDate: addDays(HOY, 10) });
    const conPago = mk({ startDate: addDays(HOY, -20), dueDate: addDays(HOY, 10),
                         payments: [{ id: "p", amount: 25000, date: addDays(HOY, -5) }] });
    expect(remainingDebt(sinPago) - remainingDebt(conPago)).toBeCloseTo(25000, 2);
  });

  it("la deuda nunca es negativa aunque se pague de más", () => {
    const l = mk({ payments: [{ id: "p", amount: 999999, date: HOY }] });
    expect(remainingDebt(l)).toBe(0);
  });

  it("una tasa de 0% no genera NaN ni interés", () => {
    const l = mk({ interestRate: 0, startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10) });
    for (const v of [remainingDebt(l), nextPeriodInterest(l), compoundReturn(l), upcomingInterest(l, addDays(HOY, 60))]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(remainingDebt(l)).toBeCloseTo(100000, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("remainingDebtAt (deuda a una fecha)", () => {
  const todos = {
    activo: mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) }),
    venceHoy: mk({ startDate: addCalendarMonths(HOY, -1), dueDate: HOY }),
    vencido: mk({ startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) }),
    conPagos: mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
                   payments: [{ id: "p", amount: 30000, date: addCalendarMonths(HOY, -1) }] }),
    sinVencimiento: mk({ noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -3) }),
    quincenal: mk({ paymentType: "15", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -25) }),
  };

  it.each(Object.entries(todos))("con asOf = hoy coincide con remainingDebt [%s]", (_n, l) => {
    expect(remainingDebtAt(l, HOY)).toBeCloseTo(remainingDebt(l), 2);
  });

  it("sin pagos, la deuda nunca decrece con el tiempo", () => {
    const l = todos.vencido;
    const serie = [-90, -60, -30, 0].map((d) => remainingDebtAt(l, addDays(HOY, d)));
    for (let i = 1; i < serie.length; i++) expect(serie[i]).toBeGreaterThanOrEqual(serie[i - 1]);
  });

  it("antes de la fecha de inicio no hay deuda", () => {
    expect(remainingDebtAt(mk({ startDate: addDays(HOY, -5) }), addDays(HOY, -10))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("interés devengado", () => {
  it("un préstamo que todavía no venció no devengó nada", () => {
    expect(interestAccruals(mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) }))).toEqual([]);
  });

  it("el día del vencimiento el interés ya está devengado", () => {
    const l = mk({ dueDate: HOY, startDate: addCalendarMonths(HOY, -1) });
    expect(sumAccruals(l)).toBeCloseTo(expectedProfit(l), 2);
  });

  it("un préstamo cancelado antes del vencimiento devenga igual", () => {
    // Si el cliente paga capital + interés antes de tiempo, la ganancia existió: no
    // puede desaparecer del ROI histórico.
    const l = mk({ status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10),
                   payments: [{ id: "p", amount: 110000, date: addDays(HOY, -20) }] });
    const eventos = interestAccruals(l);
    expect(sumAccruals(l)).toBeCloseTo(paidAmount(l) - Number(l.amount), 2);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].date).toBe(addDays(HOY, -20)); // en la fecha de cobro, no la del vencimiento
  });

  it("un préstamo cerrado no devenga después de su cierre", () => {
    const l = mk({ status: "refinanced", startDate: addCalendarMonths(HOY, -3),
                   dueDate: addCalendarMonths(HOY, -2),
                   payments: [{ id: "p", amount: 50000, date: addCalendarMonths(HOY, -2) }] });
    expect(interestAccruals(l).every((e) => e.date <= HOY)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("próxima ganancia (nextPeriodInterest)", () => {
  it("en un activo sin pagos es el interés contratado", () => {
    const l = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) });
    expect(nextPeriodInterest(l)).toBeCloseTo(expectedProfit(l), 2);
  });

  it("en un activo con pagos se calcula sobre el capital que queda", () => {
    // Pagó $30.000: cubre el interés ($10.000) y amortiza $20.000 → capital $80.000.
    const l = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20),
                   payments: [{ id: "p", amount: 30000, date: HOY }] });
    expect(nextPeriodInterest(l)).toBeCloseTo(8000, 2);
  });

  it("en un vencido se calcula sobre la deuda ya capitalizada", () => {
    const l = mk({ dueDate: addCalendarMonths(HOY, -1) });
    expect(nextPeriodInterest(l)).toBeCloseTo(remainingDebt(l) * 0.1, 2);
  });

  it("en interés fijo es el monto fijo", () => {
    const l = mk({ interestMode: "fixed", fixedInterest: 8000, interestRate: 0 });
    expect(nextPeriodInterest(l)).toBeCloseTo(8000, 2);
  });

  it("en pagados y refinanciados es cero", () => {
    expect(nextPeriodInterest(mk({ status: "paid", payments: [{ id: "p", amount: 110000, date: HOY }] }))).toBe(0);
    expect(nextPeriodInterest(mk({ status: "refinanced" }))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("interés a futuro (upcomingInterest)", () => {
  const activo = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) });

  it("no proyecta nada hasta hoy", () => {
    expect(upcomingInterest(activo, HOY)).toBe(0);
  });

  it("una ventana más larga nunca da menos", () => {
    expect(upcomingInterest(activo, addDays(HOY, 60)))
      .toBeGreaterThanOrEqual(upcomingInterest(activo, addDays(HOY, 30)));
  });

  it("a 30 días de un activo es el interés contratado de un ciclo", () => {
    expect(upcomingInterest(activo, addDays(HOY, 30))).toBeCloseTo(expectedProfit(activo), 2);
  });

  it("no proyecta sobre préstamos cerrados", () => {
    expect(upcomingInterest(mk({ status: "paid" }), addDays(HOY, 60))).toBe(0);
    expect(upcomingInterest(mk({ status: "refinanced" }), addDays(HOY, 60))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("préstamos sin vencimiento", () => {
  const l = mk({ noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -3) });

  it("la deuda capitaliza por cada ciclo transcurrido", () => {
    const ciclos = loanElapsedPeriods(l, l.startDate, HOY) + 1;
    expect(remainingDebt(l)).toBeCloseTo(100000 * Math.pow(1.1, ciclos), 2);
  });

  it("remainingDebt y compoundReturn no se contradicen", () => {
    // Este era el bug: remainingDebt devolvía capital + 1 solo período.
    expect(remainingDebt(l)).toBeCloseTo(compoundReturn(l), 2);
  });

  it("la próxima ganancia se calcula sobre la deuda, no sobre el capital original", () => {
    expect(nextPeriodInterest(l)).toBeCloseTo(remainingDebt(l) * 0.1, 2);
    expect(nextPeriodInterest(l)).toBeGreaterThan(10000);
  });

  it("nunca se marca como vencido", () => {
    expect(isOverdue(l)).toBe(false);
    expect(resolveStatus(l)).toBe("active");
  });

  it("un pago descuenta peso por peso", () => {
    const conPago = mk({ ...l, payments: [{ id: "p", amount: 20000, date: addDays(HOY, -5) }] });
    expect(remainingDebt(l) - remainingDebt(conPago)).toBeCloseTo(20000, 2);
  });

  it("la deuda va un ciclo adelante del devengado (el interés se cobra por adelantado)", () => {
    // Diferencia intencional: la deuda incluye el ciclo en curso, el devengado sólo
    // reconoce los ciclos ya cerrados.
    expect(remainingDebt(l)).toBeCloseTo((100000 + sumAccruals(l)) * 1.1, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("préstamos compartidos", () => {
  const compartido = mk({ sharedWith: "Papá", myPercent: 50, dueDate: addCalendarMonths(HOY, -1) });
  const individual = mk({ dueDate: addCalendarMonths(HOY, -1) });

  it("myShare interpreta el porcentaje", () => {
    expect(myShare(compartido)).toBe(0.5);
    expect(myShare(mk())).toBe(1);
    expect(myShare(mk({ myPercent: 100 }))).toBe(1);
    expect(myShare(mk({ myPercent: 0 }))).toBe(1); // sin dato usable → todo mío
  });

  it("los campos crudos del préstamo NO llevan el prorrateo", () => {
    // _remaining es lo que el cliente debe; el prorrateo se aplica al mostrar mi ganancia
    // y en los agregados globales.
    expect(remainingDebt(compartido)).toBeCloseTo(remainingDebt(individual), 2);
  });

  it("la proyección sí se calcula sobre mi parte", () => {
    const resueltos = [{ ...compartido, _remaining: remainingDebt(compartido) }] as never[];
    const p = calcProjection({ activeLoans: resueltos });
    expect(p.base).toBeCloseTo(remainingDebt(compartido) * 0.5, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("capital desplegado (loanCapitalAt)", () => {
  it("un refinanciado no aporta capital", () => {
    expect(loanCapitalAt(mk({ status: "refinanced" }), HOY)).toBe(0);
  });

  // Ojo: un startDate futuro NO significa "todavía no presté". El campo también marca
  // "pagado hasta", así que un cliente con los intereses al día re-inicia el préstamo
  // adelante sin devolver el capital: esa plata sigue en la calle y tiene que contar.
  it("un préstamo con inicio a futuro sigue aportando su capital", () => {
    const l = mk({ startDate: addDays(HOY, 5), dueDate: addDays(HOY, 35) });
    expect(loanCapitalAt(l, HOY)).toBeCloseTo(100000, 2);
  });

  it("pero no aporta en fechas anteriores a que la plata saliera", () => {
    const alta = new Date(2026, 6, 1).getTime(); // 1 de julio
    const l = mk({ startDate: addDays(HOY, 5), dueDate: addDays(HOY, 35), createdAt: alta });
    expect(loanCapitalAt(l, "2026-06-15")).toBe(0);
    expect(loanCapitalAt(l, "2026-07-15")).toBeCloseTo(100000, 2);
  });

  it("un pagado no aporta capital", () => {
    expect(loanCapitalAt(mk({ status: "paid", payments: [{ id: "p", amount: 110000, date: HOY }] }), HOY)).toBe(0);
  });

  it("la suma coincide con el capital invertido del header", () => {
    // Invariante que mantiene alineada la curva "Evolución del capital" con la card.
    const cartera = [
      mk({ id: "1", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) }),
      mk({ id: "2", dueDate: addCalendarMonths(HOY, -1) }),
      mk({ id: "3", sharedWith: "Papá", myPercent: 50, dueDate: addDays(HOY, 20) }),
      mk({ id: "4", noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -3) }),
    ];
    const header = cartera
      .map((l) => ({ l, st: resolveStatus(l), rem: remainingDebt(l) }))
      .filter(({ st }) => st === "active" || st === "overdue")
      .reduce((a, { l, st, rem }) => a + myShare(l) * (st === "overdue" ? rem : Math.min(rem, Number(l.amount))), 0);
    const curva = cartera.reduce((a, l) => a + myShare(l) * loanCapitalAt(l, HOY), 0);
    expect(curva).toBeCloseTo(header, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("proyección (calcProjection)", () => {
  const resueltos = [
    { ...mk({ dueDate: addCalendarMonths(HOY, -1) }), _remaining: 121000 },
    { ...mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) }), _remaining: 110000 },
  ] as never[];

  it("no produce NaN en ninguna salida", () => {
    const p = calcProjection({ activeLoans: resueltos, workingCapital: 500000, avgRate: 10 });
    for (const v of [p.rate, p.tea, p.base, p.gainPerCycle, p.cyclesPerYear]) expect(Number.isFinite(v)).toBe(true);
    expect(p.cyclePoints.every((c) => Number.isFinite(c.total) && Number.isFinite(c.profit))).toBe(true);
    expect(p.profitSeries.every((s) => Number.isFinite(s.ganancia) && Number.isFinite(s.total))).toBe(true);
  });

  it("la ganancia del mes 0 es lo ya devengado", () => {
    expect(calcProjection({ activeLoans: resueltos, accumulatedProfit: 1234 }).profitSeries[0].ganancia).toBe(1234);
  });

  it("la curva de capital proyectado no decrece", () => {
    const s = calcProjection({ activeLoans: resueltos }).profitSeries;
    for (let i = 1; i < s.length; i++) expect(s[i].total).toBeGreaterThanOrEqual(s[i - 1].total);
  });

  it("el ciclo por defecto es de 30 días", () => {
    expect(calcProjection({ activeLoans: resueltos }).days).toBe(30);
  });

  it("una cartera quincenal compone el doble de veces por año", () => {
    const q = calcProjection({ activeLoans: resueltos, cycleDays: 15 });
    const m = calcProjection({ activeLoans: resueltos, cycleDays: 30 });
    expect(q.cyclesPerYear).toBeCloseTo(m.cyclesPerYear * 2, 5);
    expect(q.tea).toBeGreaterThan(m.tea);
    expect(q.doublingYears!).toBeLessThan(m.doublingYears!);
  });

  it("sin préstamos cae al capital de trabajo", () => {
    expect(calcProjection({ workingCapital: 500000, avgRate: 10 }).base).toBe(500000);
  });

  it("con tasa 0 no calcula duplicación", () => {
    expect(calcProjection({ workingCapital: 500000, avgRate: 0 }).doublingYears).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("proyección a N meses (projectHorizon)", () => {
  it("un mes de una cartera mensual es un solo ciclo", () => {
    const p = projectHorizon(100000, 0.1, 30, 1);
    expect(p.cycles).toBeCloseTo(DAYS_PER_MONTH / 30, 3); // ~1,01
    expect(p.total).toBeCloseTo(100000 * Math.pow(1.1, p.cycles), 2);
  });

  it("una cartera quincenal mete el doble de ciclos en el mismo plazo", () => {
    expect(projectHorizon(100000, 0.1, 15, 6).cycles)
      .toBeCloseTo(projectHorizon(100000, 0.1, 30, 6).cycles * 2, 5);
  });

  it("a 12 meses coincide con los ciclos por año de calcProjection", () => {
    // Si no cerraran, el cuadro de "12 meses" y la tasa efectiva anual contarían
    // distinta cantidad de ciclos para la misma ventana.
    const p = calcProjection({ workingCapital: 100000, avgRate: 10, cycleDays: 30 });
    expect(projectHorizon(p.base, p.rate, p.days, 12).cycles).toBeCloseTo(p.cyclesPerYear, 5);
  });

  it("a 12 meses la ganancia es la tasa efectiva anual", () => {
    const p = calcProjection({ workingCapital: 100000, avgRate: 10, cycleDays: 30 });
    expect(projectHorizon(p.base, p.rate, p.days, 12).pct / 100).toBeCloseTo(p.tea, 5);
  });

  it("la ganancia es el total menos el capital de partida", () => {
    const p = projectHorizon(554510, 0.1, 30, 6);
    expect(p.profit).toBeCloseTo(p.total - 554510, 2);
    expect(p.pct).toBeCloseTo((p.total / 554510 - 1) * 100, 5);
  });

  it("crece de forma monótona mes a mes", () => {
    let previo = 0;
    for (let m = 1; m <= 12; m++) {
      const p = projectHorizon(100000, 0.1, 30, m);
      expect(p.total).toBeGreaterThan(previo);
      previo = p.total;
    }
  });

  it("con tasa 0 el capital no se mueve", () => {
    const p = projectHorizon(100000, 0, 30, 12);
    expect(p.total).toBeCloseTo(100000, 2);
    expect(p.profit).toBeCloseTo(0, 2);
  });

  it("sin capital desplegado no inventa ganancia", () => {
    expect(projectHorizon(0, 0.1, 30, 12).total).toBe(0);
    expect(projectHorizon(0, 0.1, 30, 12).profit).toBe(0);
  });

  it("no produce NaN con un ciclo inválido", () => {
    for (const dias of [0, -5, NaN]) {
      expect(Number.isFinite(projectHorizon(100000, 0.1, dias, 6).total)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("validación e integridad", () => {
  it("rechaza montos y tasas inválidos", () => {
    expect(validateLoan({ clientName: "", amount: 0 }).clientName).toBeTruthy();
    expect(validateLoan({ clientName: "A", amount: -5 }).amount).toBeTruthy();
    expect(validateLoan({ clientName: "A", amount: 100, interestRate: 500 }).interestRate).toBeTruthy();
  });

  it("exige que el vencimiento sea posterior al inicio", () => {
    expect(validateLoan({ clientName: "A", amount: 100, interestRate: 10,
                          startDate: "2026-08-10", dueDate: "2026-08-01" }).dueDate).toBeTruthy();
  });

  it("acepta un préstamo bien formado", () => {
    expect(validateLoan({ clientName: "A", amount: 100000, interestRate: 10,
                          startDate: "2026-08-01", dueDate: "2026-09-01" })).toEqual({});
    expect(loanIntegrityErrors(mk())).toEqual([]);
  });

  it("detecta un préstamo con datos corruptos", () => {
    expect(loanIntegrityErrors(mk({ amount: 0, clientName: "" }))).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Barrido del contrato "remainingDebtAt(l, hoy) === remainingDebt(l)". Los dos caminos
// alimentan cosas distintas de la pantalla: `remainingDebt` las cards del header y
// `remainingDebtAt` la curva de los gráficos. Si se separan, la card y el gráfico de al
// lado muestran números distintos para la misma plata. Se barre una matriz en vez de un
// caso suelto porque las divergencias aparecen sólo en ciertas combinaciones (un vencido
// con un adelanto a futuro, por ejemplo, y no su equivalente activo).
describe("la deuda de hoy coincide por los dos caminos", () => {
  const variantes: { nombre: string; loan: Loan }[] = [];
  for (const [venc, dueDate] of [
    ["activo", addCalendarMonths(HOY, 1)],
    ["venceHoy", HOY],
    ["vencido1", addCalendarMonths(HOY, -1)],
    ["vencido3", addCalendarMonths(HOY, -3)],
  ] as const) {
    for (const tipo of ["30", "15", "custom"] as const) {
      for (const [adel, advancedAt] of [
        ["sinAdelanto", undefined],
        ["adelantoPasado", [addDays(HOY, -3)]],
        ["adelantoHoy", [HOY]],
        ["adelantoFuturo", [addDays(HOY, 5)]],
        ["dosAdelantos", [addDays(HOY, -3), addDays(HOY, 5)]],
      ] as const) {
        for (const [pag, payments] of [
          ["sinPagos", []],
          ["pagoParcial", [{ id: "p", amount: 40000, date: addDays(HOY, -6) }]],
        ] as const) {
          variantes.push({
            nombre: `${venc}/${tipo}/${adel}/${pag}`,
            loan: mk({
              startDate: addCalendarMonths(HOY, -4), dueDate, paymentType: tipo,
              customDays: tipo === "custom" ? 20 : undefined,
              advancedAt: advancedAt ? [...advancedAt] : undefined,
              payments: [...payments],
            }),
          });
        }
      }
    }
  }

  it.each(variantes)("$nombre", ({ loan }) => {
    expect(remainingDebtAt(loan, todayISO())).toBeCloseTo(remainingDebt(loan), 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `loanCapitalAt` es la única fuente del "capital invertido": la usan tanto la card del
// header como la curva del gráfico. Antes el header repetía la fórmula por su cuenta y se
// separaron — sumaba el monto entero de un préstamo con fecha de inicio futura, que
// todavía no desplegó un peso, y la curva no lo contaba.
describe("capital desplegado por prestamo", () => {
  // startDate cumple dos papeles: "cuando preste" y "pagado hasta". Cuando el cliente
  // paga los intereses por adelantado el prestamo se re-inicia en una fecha futura, pero
  // el capital NO volvio: sigue prestado y tiene que contar. Tomar startDate a secas
  // borraba esa plata del capital desplegado y del grafico.
  it("un prestamo con inicio a futuro sigue contando: la plata ya esta prestada", () => {
    const manana = mk({ startDate: addDays(HOY, 1), dueDate: addCalendarMonths(HOY, 2) });
    expect(loanCapitalAt(manana, todayISO())).toBeCloseTo(Number(manana.amount), 2);
    const enUnMes = mk({ startDate: addCalendarMonths(HOY, 1), dueDate: addCalendarMonths(HOY, 2) });
    expect(loanCapitalAt(enUnMes, todayISO())).toBeCloseTo(Number(enUnMes.amount), 2);
  });

  it("con inicio a futuro y alta conocida, cuenta desde el alta", () => {
    const alta = new Date(2026, 4, 10).getTime(); // 10 de mayo
    const l = mk({ startDate: addCalendarMonths(HOY, 1), dueDate: addCalendarMonths(HOY, 2), createdAt: alta });
    expect(loanDeployedFrom(l)).toBe("2026-05-10");
    expect(loanCapitalAt(l, "2026-06-30")).toBeCloseTo(Number(l.amount), 2);
    // Antes del alta no habia plata en la calle.
    expect(loanCapitalAt(l, "2026-04-30")).toBe(0);
  });

  it("sin alta conocida, un inicio a futuro cuenta desde hoy y no antes", () => {
    const l = mk({ startDate: addDays(HOY, 10), dueDate: addCalendarMonths(HOY, 2), createdAt: 0 });
    expect(loanDeployedFrom(l)).toBe(todayISO());
    expect(loanCapitalAt(l, todayISO())).toBeCloseTo(Number(l.amount), 2);
    expect(loanCapitalAt(l, addDays(HOY, -1))).toBe(0);
  });

  it("uno que arranca hoy ya aporta su principal", () => {
    const l = mk({ startDate: HOY, dueDate: addCalendarMonths(HOY, 1) });
    expect(loanCapitalAt(l, todayISO())).toBeCloseTo(Number(l.amount), 2);
  });

  it("un activo aporta el principal, acotado a lo que se debe", () => {
    const l = mk({ dueDate: addCalendarMonths(HOY, 1) });
    expect(loanCapitalAt(l, todayISO())).toBeCloseTo(Number(l.amount), 2);
  });

  it("un vencido aporta la deuda entera, con el interes ya capitalizado", () => {
    const l = mk({ dueDate: addCalendarMonths(HOY, -1) });
    expect(loanCapitalAt(l, todayISO())).toBeCloseTo(remainingDebt(l), 2);
    expect(loanCapitalAt(l, todayISO())).toBeGreaterThan(Number(l.amount));
  });

  it("los cerrados y los saldados no aportan", () => {
    const pagado = mk({ dueDate: addDays(HOY, -10), payments: [{ id: "p", amount: 110000, date: addDays(HOY, -9) }] });
    expect(loanCapitalAt(pagado, todayISO())).toBe(0);
    expect(loanCapitalAt(mk({ status: "refinanced", dueDate: addCalendarMonths(HOY, -1) }), todayISO())).toBe(0);
    expect(loanCapitalAt(mk({ status: "paid", dueDate: addCalendarMonths(HOY, -1) }), todayISO())).toBe(0);
  });
});
