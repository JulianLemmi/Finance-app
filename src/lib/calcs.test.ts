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
  closedLoanOutcome, overduePeriodsAt, resolvePaymentPos, paymentAnchorDate,
  nextCycleFraction, halfCycleCharged, loanLedger, unaccruedInterest, cycleSequence,
  reorderAdvance,
} from "./calcs.js";
import {
  loanPeriodDate, loanElapsedPeriods, addCalendarMonths, addDays, getNextRenewalDate,
  getLoanCycleDays, todayISO, todayDate, myShare, daysBetween, loanDeployedFrom,
  loanPrincipalAt, loanEffectiveRate, packAdvances,
} from "./utils.js";
import type { Loan, ResolvedLoan } from "../types";

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

  // El cliente que paga los intereses al día es el caso más común de la cartera, y era el
  // que más se distorsionaba: el devengado componía sobre un saldo sin pagos, así que
  // cobraba interés sobre plata que el cliente ya había devuelto.
  it("un cliente que paga los intereses al día devenga lo que pagó, no más", () => {
    const l = mk({
      startDate: addCalendarMonths(HOY, -7), dueDate: addCalendarMonths(HOY, -6),
      payments: [1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, amount: 10000, date: addCalendarMonths(HOY, -6 + i) })),
    });
    const cobradoDeVerdad = remainingDebt(l) + paidAmount(l) - Number(l.amount);
    expect(cobradoDeVerdad).toBeCloseTo(77715.61, 1);
    expect(sumAccruals(l)).toBeCloseTo(cobradoDeVerdad, 2);
  });

  it("un pago antes del re-vencimiento baja el interés de ese ciclo", () => {
    // Deuda 110.000, el cliente paga 40.000 y después cae el re-vencimiento: el 10% se
    // cobra sobre 70.000 (7.000), no sobre 110.000.
    const l = mk({ payments: [{ id: "p", amount: 40000, date: addDays(HOY, -40) }] });
    expect(sumAccruals(l)).toBeCloseTo(17000, 2); // 10.000 contratado + 7.000 de mora
    expect(remainingDebt(l)).toBeCloseTo(77000, 2);
  });

  // Adelantar un ciclo le capitaliza interés a la deuda en el momento. Si el préstamo
  // todavía no venció, ese interés no aparecía en ningún lado: el devengado se cortaba
  // antes de mirar los adelantos y la ganancia quedaba invisible hasta el vencimiento.
  it("un ciclo adelantado devenga en su fecha, aunque el préstamo no haya vencido", () => {
    const l = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20), advancedAt: [addDays(HOY, -2)] });
    const eventos = interestAccruals(l);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].date).toBe(addDays(HOY, -2));
    expect(eventos[0].amount).toBeCloseTo(11000, 2);
    // El ciclo contratado sigue sin devengarse: su vencimiento no llegó.
    expect(remainingDebt(l) - Number(l.amount) - sumAccruals(l)).toBeCloseTo(10000, 2);
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
    { ...mk({ dueDate: addCalendarMonths(HOY, -1) }), _remaining: 121000, _nextProfit: 12100 },
    { ...mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) }), _remaining: 110000, _nextProfit: 10000 },
  ] as never[];

  // El cuadro "1 ciclo" y la card "Ganancia por ciclo" están uno al lado del otro en
  // Finanzas y tienen que decir lo mismo. Salían de cuentas distintas: la card sumaba lo
  // que va a cobrar cada préstamo y el cuadro multiplicaba la deuda total por el promedio
  // SIMPLE de las tasas. Con la plata grande prestada a tasa baja y préstamos chicos a tasa
  // alta, ese promedio se dispara y la proyección promete lo que la cartera no da.
  it("la ganancia del primer ciclo es la suma real de lo que cobra cada préstamo", () => {
    const p = calcProjection({ activeLoans: resueltos });
    const gananciaReal = 12100 + 10000;
    expect(p.gainPerCycle).toBeCloseTo(gananciaReal, 2);
    expect(p.cyclePoints[0].profit).toBeCloseTo(gananciaReal, 2);
    expect(p.cyclePoints[0].n).toBe(1);
  });

  it("la tasa de la proyección es el rendimiento real, no el promedio de los contratos", () => {
    // Plata grande al 5% y varios préstamos chicos al 30%: el promedio simple dice 21,7%
    // pero la cartera rinde 6,2%. La proyección tiene que usar el segundo.
    const cartera = [
      { ...mk({ amount: 100000, interestRate: 5 }), _remaining: 105000, _nextProfit: 5000 },
      { ...mk({ amount: 1000, interestRate: 30 }), _remaining: 1300, _nextProfit: 300 },
      { ...mk({ amount: 1000, interestRate: 30 }), _remaining: 1300, _nextProfit: 300 },
    ] as never[];
    const p = calcProjection({ activeLoans: cartera });
    expect(p.contractRate * 100).toBeCloseTo(21.67, 1);
    expect(p.rate).toBeCloseTo(5600 / 107600, 6);
    expect(p.rate).toBeLessThan(p.contractRate);
    // Y la TEA sale de la tasa real, no de la de los contratos.
    expect(p.tea).toBeCloseTo(Math.pow(1 + p.rate, p.cyclesPerYear) - 1, 6);
  });

  it("un préstamo a tasa 0 no inventa rendimiento", () => {
    const cartera = [{ ...mk({ interestRate: 0 }), _remaining: 100000, _nextProfit: 0 }] as never[];
    const p = calcProjection({ activeLoans: cartera });
    expect(p.rate).toBe(0);
    expect(p.gainPerCycle).toBe(0);
    expect(p.doublingYears).toBeNull();
  });

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
// Sumar capital a un préstamo en curso, sin refinanciar: el cliente pide más plata y el
// préstamo crece conservando su tasa, su ciclo y su vencimiento. La regla es la misma que
// al dar de alta un préstamo: el interés del ciclo se cobra por adelantado, así que
// entregar $50.000 al 10% son $55.000 de deuda en el momento.
describe("adicionales de capital (sin refinanciar)", () => {
  const ACTIVO = { startDate: addDays(HOY, -10), dueDate: addCalendarMonths(HOY, 1) };
  const extra = (amount: number, date: string, id = "e1") => ({ id, amount, date });

  it("el capital vigente suma los adicionales ya entregados", () => {
    const l = mk({ ...ACTIVO, extras: [extra(50000, HOY)] });
    expect(loanPrincipalAt(l)).toBe(150000);
    // `amount` no se reescribe: sigue siendo el capital original.
    expect(Number(l.amount)).toBe(100000);
  });

  it("entra a la deuda con el interés de su ciclo, igual que el capital original", () => {
    const l = mk({ ...ACTIVO, extras: [extra(50000, HOY)] });
    expect(remainingDebt(l)).toBeCloseTo(165000, 2); // (100k + 50k) × 1,10
    expect(expectedReturn(l)).toBeCloseTo(165000, 2);
    expect(expectedProfit(l)).toBeCloseTo(15000, 2);
  });

  it("un adicional fechado a futuro todavía no está en la calle", () => {
    const l = mk({ ...ACTIVO, extras: [extra(50000, addDays(HOY, 5))] });
    expect(loanPrincipalAt(l)).toBe(100000);
    expect(remainingDebt(l)).toBeCloseTo(110000, 2);
    expect(loanCapitalAt(l, todayISO())).toBeCloseTo(100000, 2);
  });

  it("la deuda a una fecha anterior al adicional no lo ve", () => {
    const l = mk({ ...ACTIVO, extras: [extra(50000, addDays(HOY, -3))] });
    expect(remainingDebtAt(l, addDays(HOY, -5))).toBeCloseTo(110000, 2);
    expect(remainingDebtAt(l, addDays(HOY, -3))).toBeCloseTo(165000, 2);
    expect(remainingDebtAt(l, todayISO())).toBeCloseTo(remainingDebt(l), 2);
  });

  it("en un vencido no paga dos veces el ciclo en que se entregó", () => {
    // Préstamo base: vence hace un mes, así que ya capitalizó un ciclo (100k → 121k).
    // El adicional de hoy entra con SU ciclo por adelantado (55k) y nada más: el
    // re-vencimiento de hoy ya quedó cubierto por ese adelanto.
    const l = mk({ extras: [extra(50000, HOY)] });
    expect(remainingDebt(mk())).toBeCloseTo(121000, 2);
    expect(remainingDebt(l)).toBeCloseTo(176000, 2);
  });

  it("la deuda cierra con capital vigente + devengado", () => {
    // La identidad que sostiene el ROI y el gráfico de ganancia: lo que el cliente debe
    // es el capital que recibió más todo el interés reconocido. Si el adicional devengara
    // de más o de menos, acá se rompe.
    for (const l of [
      mk({ extras: [extra(50000, HOY)] }),
      mk({ extras: [extra(50000, addDays(HOY, -40))] }),
      mk({ dueDate: addCalendarMonths(HOY, -3), extras: [extra(30000, addDays(HOY, -20))] }),
    ]) {
      expect(remainingDebt(l)).toBeCloseTo(loanPrincipalAt(l) + sumAccruals(l), 2);
    }
  });

  it("un adicional previo al vencimiento devenga desde el primer ciclo", () => {
    const l = mk({ extras: [extra(50000, addDays(HOY, -45))] }); // entre inicio y vencimiento
    const eventos = interestAccruals(l);
    expect(eventos[0].date).toBe(l.dueDate);
    expect(eventos[0].amount).toBeCloseTo(15000, 2); // 10% de 150k, no de 100k
    expect(remainingDebt(l)).toBeCloseTo(181500, 2); // 150k × 1,10²
  });

  it("en interés fijo suma capital pero no otro cargo", () => {
    const l = mk({ ...ACTIVO, interestMode: "fixed", fixedInterest: 20000, extras: [extra(50000, HOY)] });
    expect(expectedProfit(l)).toBeCloseTo(20000, 2);
    expect(remainingDebt(l)).toBeCloseTo(170000, 2); // 150k + 20k, no 150k + 40k
  });

  it("sin vencimiento compone sólo los ciclos posteriores a la entrega", () => {
    const sinExtra = mk({ noDueDate: true, startDate: addCalendarMonths(HOY, -2) });
    expect(remainingDebt(sinExtra)).toBeCloseTo(133100, 2); // 100k × 1,10³
    const l = mk({
      noDueDate: true, startDate: addCalendarMonths(HOY, -2),
      extras: [extra(50000, addCalendarMonths(HOY, -1))],
    });
    expect(remainingDebt(l)).toBeCloseTo(199650, 2); // 133.100 + 50k × 1,10³
    expect(remainingDebtAt(l, todayISO())).toBeCloseTo(remainingDebt(l), 2);
  });

  it("la próxima ganancia se cobra sobre el capital vigente", () => {
    const l = mk({ ...ACTIVO, extras: [extra(50000, HOY)] });
    expect(nextPeriodInterest(l)).toBeCloseTo(15000, 2);
    expect(upcomingInterest(l, addDays(l.dueDate, 1))).toBeCloseTo(15000, 2);
  });

  it("el capital desplegado de un activo se topea en el capital vigente", () => {
    const l = mk({ ...ACTIVO, extras: [extra(50000, HOY)] });
    expect(loanCapitalAt(l, todayISO())).toBeCloseTo(150000, 2);
    // Ayer el adicional no existía: la curva del gráfico no puede verlo antes.
    expect(loanCapitalAt(l, addDays(HOY, -1))).toBeCloseTo(100000, 2);
  });

  it("un vencido con la deuda por debajo del capital vigente vuelve a activo", () => {
    // Deuda 116k: arriba del monto original (100k) pero abajo del capital vigente (150k).
    // Con el umbral viejo —`loan.amount` a secas— quedaba marcado atrasado para siempre.
    const l = mk({
      extras: [extra(50000, HOY)],
      payments: [{ id: "p", amount: 60000, date: HOY }],
    });
    expect(remainingDebt(l)).toBeCloseTo(116000, 2);
    expect(loanPrincipalAt(l)).toBe(150000);
    expect(resolveStatus(l)).toBe("active");
  });

  it("un adicional con monto o fecha inválida se marca como error de integridad", () => {
    expect(loanIntegrityErrors(mk({ extras: [extra(0, HOY)] }))).toContain("Adicional con monto inválido");
    expect(loanIntegrityErrors(mk({ extras: [extra(1000, "")] }))).toContain("Adicional sin fecha");
    expect(loanIntegrityErrors(mk({ extras: [extra(1000, HOY)] }))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
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
          // Los adicionales entran en el mismo barrido: es la red que atrapa que la deuda
          // de la card y la de la curva del gráfico se separen al sumar capital.
          for (const [ext, extras] of [
            ["sinExtra", undefined],
            ["extraHoy", [{ id: "e", amount: 30000, date: HOY }]],
            ["extraViejo", [{ id: "e", amount: 30000, date: addDays(HOY, -40) }]],
            ["extraFuturo", [{ id: "e", amount: 30000, date: addDays(HOY, 7) }]],
          ] as const) {
            variantes.push({
              nombre: `${venc}/${tipo}/${adel}/${pag}/${ext}`,
              loan: mk({
                startDate: addCalendarMonths(HOY, -4), dueDate, paymentType: tipo,
                customDays: tipo === "custom" ? 20 : undefined,
                advancedAt: advancedAt ? [...advancedAt] : undefined,
                payments: [...payments],
                extras: extras ? extras.map((e) => ({ ...e })) : undefined,
              }),
            });
          }
        }
      }
    }
  }

  it.each(variantes)("$nombre", ({ loan }) => {
    expect(remainingDebtAt(loan, todayISO())).toBeCloseTo(remainingDebt(loan), 2);
  });

  // El devengado no puede inventar ganancia: el interés realmente cobrado a un cliente es
  // `deuda + pagado − capital`, y lo devengado nunca puede pasarse de ahí. Lo que falte es
  // el ciclo en curso, que se cobra por adelantado y se reconoce al cerrarse.
  //
  // Esta es la red que faltaba: el devengado componía sobre un saldo que ignoraba los
  // pagos, así que un cliente que paga los intereses al día aparecía generando bastante
  // más de lo que pagó.
  it.each(variantes)("el devengado no supera lo cobrado de verdad — $nombre", ({ loan }) => {
    const cobradoDeVerdad = remainingDebt(loan) + paidAmount(loan) - loanPrincipalAt(loan);
    expect(sumAccruals(loan)).toBeLessThanOrEqual(cobradoDeVerdad + 0.01);
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

// ─────────────────────────────────────────────────────────────────────────────
// La tasa del préstamo no es `interestRate` cuando el interés es un monto fijo: ese campo
// queda con el último valor que tocó el formulario y no significa nada. La tasa comparable
// es el cargo fijo sobre el capital vigente.
describe("tasa efectiva (loanEffectiveRate)", () => {
  it("en modo porcentaje es la tasa del préstamo", () => {
    expect(loanEffectiveRate(mk({ interestRate: 10 }))).toBeCloseTo(0.1, 6);
    expect(loanEffectiveRate(mk({ interestRate: 0 }))).toBe(0);
  });

  it("en modo fijo es el cargo sobre el capital, no el `interestRate` que quedó colgado", () => {
    const fijo = mk({ interestMode: "fixed", fixedInterest: 20000, interestRate: 8 });
    expect(loanEffectiveRate(fijo)).toBeCloseTo(0.2, 6); // 20% real, no 8%
  });

  it("en modo fijo el capital adicional baja la tasa efectiva (mismo cargo, más capital)", () => {
    const fijo = mk({ interestMode: "fixed", fixedInterest: 20000, interestRate: 8,
                      extras: [{ id: "e", amount: 100000, date: HOY }] });
    expect(loanPrincipalAt(fijo)).toBe(200000);
    expect(loanEffectiveRate(fijo)).toBeCloseTo(0.1, 6); // 20k sobre 200k
  });

  it("un capital en cero no produce Infinity", () => {
    const roto = mk({ interestMode: "fixed", fixedInterest: 20000, amount: 0 });
    expect(loanEffectiveRate(roto)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("closedLoanOutcome: qué dejó un préstamo cerrado", () => {
  /** Resuelve sólo los campos que la función lee. */
  const res = (l: Loan) => ({
    ...l,
    _status: resolveStatus(l),
    _paid: paidAmount(l),
    _principal: loanPrincipalAt(l),
  }) as ResolvedLoan;

  it("un préstamo cobrado generó lo pagado menos el capital", () => {
    const l = mk({
      status: "paid", amount: 100000, interestRate: 10,
      startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
      payments: [{ id: "p", amount: 110000, date: addDays(HOY, -20) }],
    });
    expect(closedLoanOutcome(res(l)).generado).toBeCloseTo(10000, 2);
  });

  it("un cobrado cierra en la fecha de su último pago", () => {
    const l = mk({
      status: "paid", startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
      payments: [
        { id: "p1", amount: 50000, date: addDays(HOY, -30) },
        { id: "p2", amount: 60000, date: addDays(HOY, -20) },
      ],
    });
    expect(closedLoanOutcome(res(l)).cierre).toBe(addDays(HOY, -20));
  });

  // La regresión que motivó el helper: la deuda de un eslabón refinanciado rueda al
  // préstamo siguiente, así que casi nunca cobra nada. Midiendo `_paid - _principal` el
  // historial decía "generó -$100.000" y el resumen de arriba se hundía en negativo.
  it("un eslabón refinanciado sin pagos NO reporta una pérdida del tamaño del capital", () => {
    const l = mk({
      status: "refinanced", amount: 100000, interestRate: 10,
      startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
      payments: [],
    });
    const { generado } = closedLoanOutcome(res(l));
    expect(generado).toBeGreaterThan(0);
    expect(generado).toBeCloseTo(sumAccruals(l), 2);
    expect(generado).toBeCloseTo(10000, 2);
  });

  it("un eslabón refinanciado sin pagos cierra en su devengado, no hoy", () => {
    const l = mk({
      status: "refinanced", startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
      payments: [],
    });
    const { cierre } = closedLoanOutcome(res(l));
    expect(cierre).toBe(addCalendarMonths(HOY, -1));
    expect(cierre).not.toBe(HOY);
  });

  it("prorratea por mi parte en un préstamo compartido", () => {
    const base = {
      status: "paid" as const, amount: 100000, interestRate: 10,
      startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
      payments: [{ id: "p", amount: 110000, date: addDays(HOY, -20) }],
    };
    const solo = closedLoanOutcome(res(mk(base)));
    const mitad = closedLoanOutcome(res(mk({ ...base, sharedWith: "Papá", myPercent: 50 })));
    expect(mitad.generado).toBeCloseTo(solo.generado / 2, 2);
    expect(mitad.prestado).toBeCloseTo(solo.prestado / 2, 2);
  });

  it("el capital informado incluye los adicionales entregados", () => {
    const l = mk({
      status: "paid", amount: 100000,
      startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
      extras: [{ id: "e", amount: 50000, date: addDays(HOY, -25) }],
      payments: [{ id: "p", amount: 180000, date: addDays(HOY, -5) }],
    });
    expect(closedLoanOutcome(res(l)).prestado).toBeCloseTo(150000, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cuántos ciclos ya se cobraron. Es el número del que cuelga la línea de tiempo del
// detalle: una fila de mora por ciclo. Tiene que salir del calendario y de la deuda,
// nunca del estado que muestra la card.
describe("overduePeriodsAt: los ciclos que la pantalla tiene que mostrar", () => {
  it("un préstamo que todavía no venció no tiene ciclos", () => {
    const l = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) });
    expect(overduePeriodsAt(l, HOY)).toBe(0);
  });

  it("el día del vencimiento todavía no corrió ningún ciclo", () => {
    // Pasa a "overdue" ese mismo día (isOverdue compara con <=), pero el re-vencimiento
    // recién cae un ciclo después: cobrar mora acá sería cobrar dos veces el mismo ciclo.
    const l = mk({ startDate: addCalendarMonths(HOY, -1), dueDate: HOY });
    expect(resolveStatus(l)).toBe("overdue");
    expect(overduePeriodsAt(l, HOY)).toBe(0);
  });

  it("cuenta un ciclo por cada re-vencimiento transcurrido", () => {
    const l = mk({ startDate: addCalendarMonths(HOY, -4), dueDate: addCalendarMonths(HOY, -3) });
    expect(overduePeriodsAt(l, HOY)).toBe(3);
  });

  it("suma los adelantos manuales ya hechos, no los fechados a futuro", () => {
    const l = mk({
      startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20),
      advancedAt: [addDays(HOY, -2), addDays(HOY, 5)],
    });
    expect(overduePeriodsAt(l, HOY)).toBe(1);
  });

  it("sin fecha de vencimiento no hay ciclos que contar", () => {
    expect(overduePeriodsAt(mk({ noDueDate: true, dueDate: "" }), HOY)).toBe(0);
  });

  it("un vencido al que no le llegó el re-vencimiento ya no apunta a su dueDate", () => {
    // Venció hace 13 días pero el ciclo cierra a los 30: no corrió ningún ciclo todavía y
    // sin embargo su dueDate ya es pasado. El detalle anunciaba esa fecha como "próximo
    // vencimiento" cuando lo que viene es el re-vencimiento.
    const l = mk({ startDate: addDays(HOY, -43), dueDate: addDays(HOY, -13) });
    expect(overduePeriodsAt(l, HOY)).toBe(0);
    expect(l.dueDate < HOY).toBe(true);
    expect(getNextRenewalDate(l) > HOY).toBe(true);
  });

  // LA REGRESIÓN. Un préstamo vencido al que le pagaron lo suficiente vuelve a "active"
  // (resolveStatus: la deuda quedó por debajo del capital), pero el re-vencimiento se le
  // cobra igual. La línea de tiempo contaba los ciclos mirando `_status` y se quedaba en
  // cero: el header mostraba una deuda con el ciclo adentro y abajo no había fila que lo
  // explicara. Pasa sobre todo en los refinanciados, donde el capital nuevo ya trae el
  // interés del eslabón anterior capitalizado y el umbral de "volver a activo" es alto.
  describe("un vencido que volvió a 'active' por pagar el interés", () => {
    // El Clemensiau real: $7.186 refinanciados, $600 fijos por ciclo, un pago de $3.450
    // imputado al primer ciclo de mora.
    const reabierto = mk({
      amount: 7186, interestMode: "fixed", fixedInterest: 600, interestRate: 7,
      refinancedFromId: "anterior", sharedWith: "Papá", myPercent: 34.4,
      startDate: "2026-06-10", dueDate: "2026-07-10",
      payments: [{ id: "p", amount: 3450, date: "2026-08-02", timelinePos: 1 }],
    });

    it("el estado vuelve a activo aunque el vencimiento ya pasó", () => {
      expect(resolveStatus(reabierto)).toBe("active");
      expect(isOverdue(reabierto)).toBe(true);
    });

    it("sigue contando el ciclo que se le cobró", () => {
      expect(overduePeriodsAt(reabierto, HOY)).toBe(1);
    });

    it("la deuda tiene ese ciclo adentro", () => {
      // 7186 + 600 (contratado) + 600 (re-vencimiento) − 3450 = 4936.
      // Sin el re-vencimiento daría 4336: esa diferencia es la fila que faltaba.
      expect(remainingDebt(reabierto)).toBeCloseTo(4936, 2);
      expect(remainingDebt(reabierto)).not.toBeCloseTo(4336, 2);
    });

    it("el próximo vencimiento es futuro, no la fecha vencida", () => {
      expect(getNextRenewalDate(reabierto)).toBe("2026-09-10");
      expect(getNextRenewalDate(reabierto) > HOY).toBe(true);
    });
  });

  // La identidad que mantiene honesta a la pantalla: una fila de mora por cada cargo que
  // el motor metió en la deuda después del vencimiento.
  it.each([
    ["vencido simple", mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2) })],
    ["vencido con pago parcial", mk({
      startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [{ id: "p", amount: 5000, date: addDays(HOY, -20) }],
    })],
    ["interés fijo reabierto", mk({
      amount: 7186, interestMode: "fixed", fixedInterest: 600,
      startDate: "2026-06-10", dueDate: "2026-07-10",
      payments: [{ id: "p", amount: 3450, date: "2026-08-02", timelinePos: 1 }],
    })],
    ["quincenal atrasado", mk({
      paymentType: "15", startDate: addDays(HOY, -75), dueDate: addDays(HOY, -60),
    })],
    ["con adicional de capital", mk({
      startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      extras: [{ id: "e", amount: 30000, date: addDays(HOY, -15) }],
    })],
  ])("los ciclos contados son los cargos que la deuda cobró: %s", (_caso, l) => {
    // interestAccruals fecha el interés contratado EN el vencimiento; todo lo que venga
    // después es un re-vencimiento, o sea una fila de mora.
    const posteriores = interestAccruals(l).filter((ev) => ev.date > l.dueDate).length;
    expect(overduePeriodsAt(l, HOY)).toBe(posteriores);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reordenar un pago = decir de qué lado de una capitalización entró la plata. No es
// cosmético: el interés del ciclo se cobra sobre el saldo del momento, así que mover un
// pago de slot cambia la deuda. La línea de tiempo tiene que dibujarlo donde `debtWalk`
// lo aplica, o el control miente.
describe("reordenado de pagos (timelinePos)", () => {
  // El Clemensiau real: vence 10/07, re-vence 10/08, pago fechado ANTES del vencimiento.
  const conCiclo = (pos?: number) => mk({
    amount: 7186, interestMode: "fixed", fixedInterest: 600,
    startDate: "2026-06-10", dueDate: "2026-07-10",
    payments: [{ id: "p", amount: 3450, date: "2026-07-02", ...(pos === undefined ? {} : { timelinePos: pos }) }],
  });
  const pagoDe = (l: Loan) => (l.payments || [])[0];

  describe("para qué existe: el slot cambia la plata", () => {
    it("en porcentaje, pagar antes del re-vencimiento deja menos deuda", () => {
      const antes = mk({
        amount: 7186, interestRate: 8,
        startDate: "2026-06-10", dueDate: "2026-07-10",
        payments: [{ id: "p", amount: 3450, date: "2026-07-02", timelinePos: 0 }],
      });
      const despues = { ...antes, payments: [{ id: "p", amount: 3450, date: "2026-07-02", timelinePos: 1 }] };
      expect(remainingDebt(antes)).toBeLessThan(remainingDebt(despues));
      // El interés del ciclo se cobra sobre el saldo con el pago ya aplicado.
      expect(remainingDebt(despues) - remainingDebt(antes)).toBeCloseTo(3450 * 0.08, 2);
    });

    it("en interés fijo el slot no mueve la deuda, porque el cargo no depende del saldo", () => {
      expect(remainingDebt(conCiclo(0))).toBeCloseTo(remainingDebt(conCiclo(1)), 2);
    });
  });

  describe("dónde se dibuja el pago", () => {
    it("el slot 0 se ancla al vencimiento, no a la fecha del pago", () => {
      const l = conCiclo(0);
      // El pago es del 02/07 y el vencimiento del 10/07: por fecha quedaba ARRIBA del
      // vencimiento, al tope de la línea, y no había manera de ponerlo entre los dos
      // vencimientos. Ese era el bug.
      expect(paymentAnchorDate(l, pagoDe(l), 1)).toBe("2026-07-10");
      expect(paymentAnchorDate(l, pagoDe(l), 1)).not.toBe("2026-07-02");
    });

    it("el slot 1 se ancla a su re-vencimiento", () => {
      const l = conCiclo(1);
      expect(paymentAnchorDate(l, pagoDe(l), 1)).toBe("2026-08-10");
    });

    // La propiedad que el usuario pedía: que exista un lugar EN EL MEDIO.
    it("hay una posición entre el vencimiento y el primer re-vencimiento", () => {
      const enMedio = paymentAnchorDate(conCiclo(0), pagoDe(conCiclo(0)), 1);
      const alFinal = paymentAnchorDate(conCiclo(1), pagoDe(conCiclo(1)), 1);
      const vencimiento = "2026-07-10", reVencimiento = "2026-08-10";
      expect(enMedio >= vencimiento).toBe(true);
      expect(enMedio < reVencimiento).toBe(true);
      expect(alFinal > enMedio).toBe(true);
    });

    it("sin ciclos corridos manda la fecha del pago y la lista se lee cronológica", () => {
      // Acá el vencimiento todavía no llegó: anclar ahí pondría un pago pasado debajo de
      // una fila futura.
      const activo = mk({
        startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20),
        payments: [{ id: "p", amount: 1000, date: addDays(HOY, -3) }],
      });
      expect(paymentAnchorDate(activo, pagoDe(activo), 0)).toBe(addDays(HOY, -3));
    });

    it("un préstamo sin vencimiento ordena por fecha", () => {
      const l = mk({ noDueDate: true, dueDate: "", startDate: addDays(HOY, -40),
        payments: [{ id: "p", amount: 1000, date: addDays(HOY, -3) }] });
      expect(paymentAnchorDate(l, pagoDe(l), 2)).toBe(addDays(HOY, -3));
    });
  });

  describe("un pago sin posición guardada", () => {
    // La timeline lo dibujaba en el slot 0 (`p.timelinePos ?? 0`) mientras la deuda lo
    // aplicaba en el que le da la fecha: la fila y el saldo de al lado discrepaban.
    it("cae en el ciclo que le da su fecha, no en el cero", () => {
      const l = mk({
        startDate: "2026-06-10", dueDate: "2026-07-10",
        payments: [{ id: "p", amount: 3450, date: "2026-08-15" }],
      });
      expect(pagoDe(l).timelinePos).toBeUndefined();
      expect(resolvePaymentPos(pagoDe(l), 2, l)).toBe(1);
      expect(paymentAnchorDate(l, pagoDe(l), 2)).toBe("2026-08-10");
    });

    it("anterior al primer re-vencimiento cae en el slot 0", () => {
      const l = conCiclo(undefined);
      expect(resolvePaymentPos(pagoDe(l), 1, l)).toBe(0);
    });

    it("una posición guardada le gana a la fecha: es la decisión del usuario", () => {
      const l = mk({
        startDate: "2026-06-10", dueDate: "2026-07-10",
        payments: [{ id: "p", amount: 3450, date: "2026-08-15", timelinePos: 0 }],
      });
      expect(resolvePaymentPos(pagoDe(l), 2, l)).toBe(0);
      expect(paymentAnchorDate(l, pagoDe(l), 2)).toBe("2026-07-10");
    });
  });

  // El ancla tiene que caer SIEMPRE dentro del tramo de su slot: después de la
  // capitalización que lo precede y antes de la siguiente. Si esto se rompe, el pago se
  // dibuja en el tramo equivocado y el reordenado deja de tener sentido.
  it.each([0, 1, 2, 3])("el ancla del slot %i cae dentro de su tramo", (pos) => {
    const l = mk({
      startDate: "2026-04-10", dueDate: "2026-05-10", interestRate: 8,
      payments: [{ id: "p", amount: 1000, date: "2026-05-01", timelinePos: pos }],
    });
    const ciclos = 3;
    const ancla = paymentAnchorDate(l, pagoDe(l), ciclos);
    const desde = pos === 0 ? l.dueDate : loanPeriodDate(l, l.dueDate, pos);
    expect(ancla).toBe(desde);
    if (pos < ciclos) expect(ancla < loanPeriodDate(l, l.dueDate, pos + 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Medio ciclo: el cliente vino unos días después del vencimiento y se le cobra la mitad
// del interés del período en vez del mes entero. El calendario NO se mueve — vuelve a
// vencer en su fecha de siempre y ahí se cobra la mitad que quedaba. Media y media hacen
// el mes: no es un descuento, es cobrar partido.
describe("medio ciclo (halfAdvancedAt)", () => {
  // Vence 10/08, re-vence 10/09. Hoy es 25/08: el cliente vino el 20/08, 10 días tarde.
  const VENCE = "2026-08-10", VINO = "2026-08-20";
  const BOUNDARY_1 = "2026-09-10", BOUNDARY_2 = "2026-10-10";
  const conMedio = (o: Partial<Loan> = {}) => mk({
    startDate: "2026-07-10", dueDate: VENCE, halfAdvancedAt: [VINO], ...o,
  });
  const sinMedio = (o: Partial<Loan> = {}) => mk({ startDate: "2026-07-10", dueDate: VENCE, ...o });

  it("cobra la mitad del interés del ciclo en la fecha elegida", () => {
    // 100.000 + 10.000 contratado = 110.000, más medio ciclo = 5% de 110.000 = 5.500.
    expect(remainingDebt(sinMedio())).toBeCloseTo(110000, 2);
    expect(remainingDebt(conMedio())).toBeCloseTo(115500, 2);
  });

  it("en interés fijo cobra la mitad del monto fijo", () => {
    const base = { interestMode: "fixed" as const, fixedInterest: 10000 };
    expect(remainingDebt(conMedio(base)) - remainingDebt(sinMedio(base))).toBeCloseTo(5000, 2);
  });

  it("no mueve el próximo vencimiento", () => {
    // Esto es lo que lo separa de "Adelantar": el calendario mensual no se toca.
    expect(getNextRenewalDate(conMedio())).toBe(getNextRenewalDate(sinMedio()));
    expect(getNextRenewalDate(conMedio())).toBe(BOUNDARY_1);
  });

  it("no abre un slot de pago nuevo", () => {
    expect(overduePeriodsAt(conMedio(), HOY)).toBe(overduePeriodsAt(sinMedio(), HOY));
    expect(overduePeriodsAt(conMedio(), HOY)).toBe(0);
  });

  it("el re-vencimiento siguiente cobra la mitad que quedaba", () => {
    const eventos = interestAccruals(conMedio());
    expect(eventos.map((e) => e.date)).toEqual([VENCE, VINO]);
    expect(eventos[1].amount).toBeCloseTo(5500, 2);
    expect(nextCycleFraction(conMedio())).toBe(0.5);
    expect(nextCycleFraction(sinMedio())).toBe(1);
  });

  // LA PROPIEDAD CENTRAL, en interés fijo donde el cargo no compone: al cerrar el ciclo la
  // deuda es exactamente la misma que si nunca se hubiera cobrado medio. Media y media
  // hacen el mes.
  it("media y media hacen el mes: al cerrar el ciclo la deuda es la misma", () => {
    const base = { interestMode: "fixed" as const, fixedInterest: 10000 };
    expect(remainingDebtAt(conMedio(base), BOUNDARY_1))
      .toBeCloseTo(remainingDebtAt(sinMedio(base), BOUNDARY_1), 2);
    expect(remainingDebtAt(conMedio(base), BOUNDARY_1)).toBeCloseTo(120000, 2);
  });

  it("después del ciclo partido vuelve a los meses completos", () => {
    const base = { interestMode: "fixed" as const, fixedInterest: 10000 };
    const l = conMedio(base);
    expect(remainingDebtAt(l, BOUNDARY_2) - remainingDebtAt(l, BOUNDARY_1)).toBeCloseTo(10000, 2);
    // Y ya no queda nada adelantado para el siguiente.
    expect(nextCycleFraction(l, BOUNDARY_1)).toBe(1);
  });

  it("en porcentual la segunda mitad compone sobre el saldo ya aumentado", () => {
    // 0,5 × 10% de 115.500 = 5.775 contra los 5.500 de la primera mitad. Los $275 de más
    // son el interés de haber cobrado antes: la misma regla que compone todo lo demás.
    const l = conMedio();
    expect(remainingDebtAt(l, BOUNDARY_1)).toBeCloseTo(121275, 2);
    expect(remainingDebtAt(sinMedio(), BOUNDARY_1)).toBeCloseTo(121000, 2);
  });

  it("anuncia la mitad que falta, no el mes entero", () => {
    // El sheet de adelanto, la card y el mapa de vencimientos leen de acá. En interés fijo
    // la mitad es exacta, porque el cargo del período no depende del saldo.
    const base = { interestMode: "fixed" as const, fixedInterest: 10000 };
    expect(nextPeriodInterest(conMedio(base))).toBeCloseTo(5000, 2);
    expect(nextPeriodInterest(sinMedio(base))).toBeCloseTo(10000, 2);
    expect(upcomingInterest(conMedio(base), "2026-09-30")).toBeCloseTo(5000, 2);
  });

  it("en porcentual la mitad que falta se cobra sobre el saldo de hoy", () => {
    // 0,5 × 10% de los 115.500 que ya tiene adentro el medio ciclo = 5.775. Un poco más
    // que la mitad de los 11.000 del ciclo entero: ese es el interés de haber cobrado
    // antes, la misma regla que compone todo lo demás.
    expect(nextPeriodInterest(conMedio())).toBeCloseTo(0.5 * 0.1 * remainingDebt(conMedio()), 2);
    expect(nextPeriodInterest(conMedio())).toBeCloseTo(5775, 2);
    expect(upcomingInterest(conMedio(), "2026-09-30")).toBeCloseTo(5775, 2);
  });

  it("un medio ciclo fechado a futuro todavía no cobra nada", () => {
    // Mismo criterio que los adelantos y los adicionales: es un hecho con fecha.
    const futuro = conMedio({ halfAdvancedAt: [addDays(HOY, 5)] });
    expect(remainingDebt(futuro)).toBeCloseTo(remainingDebt(sinMedio()), 2);
  });

  it("sin medio ciclo nada cambia", () => {
    for (const vacio of [undefined, []]) {
      expect(remainingDebt(sinMedio({ halfAdvancedAt: vacio }))).toBeCloseTo(remainingDebt(sinMedio()), 2);
      expect(nextCycleFraction(sinMedio({ halfAdvancedAt: vacio }))).toBe(1);
    }
  });

  describe("tope de uno por período", () => {
    it("marca el período que ya tiene su medio cobrado", () => {
      const l = conMedio();
      expect(halfCycleCharged(l, "2026-08-25")).toBe(true);
      expect(halfCycleCharged(l, VINO)).toBe(true);
    });

    it("el período siguiente queda libre", () => {
      expect(halfCycleCharged(conMedio(), "2026-09-20")).toBe(false);
    });

    it("un préstamo sin medios ciclos nunca está topeado", () => {
      expect(halfCycleCharged(sinMedio(), VINO)).toBe(false);
    });
  });

  // La identidad que cuida toda la suite: lo que la pantalla muestra como devengado tiene
  // que ser lo que de verdad entró a la deuda.
  it.each([
    ["porcentual", {}],
    ["interés fijo", { interestMode: "fixed" as const, fixedInterest: 10000 }],
    ["con pago", { payments: [{ id: "p", amount: 30000, date: "2026-08-22" }] }],
    ["con adicional", { extras: [{ id: "e", amount: 20000, date: "2026-08-05" }] }],
  ])("la deuda sigue cerrando con capital + devengado − pagado: %s", (_caso, extra) => {
    const l = conMedio(extra);
    const devengado = interestAccruals(l).reduce((s, e) => s + e.amount, 0);
    expect(remainingDebt(l)).toBeCloseTo(loanPrincipalAt(l) + devengado - paidAmount(l), 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reordenar adelantos: fijarles a mano la posición en la secuencia de ciclos. Hace falta
// porque un adelanto se queda con su fecha mientras el tiempo sigue corriendo, y por
// default el recorrido lo pone último: a los dos meses su cargo quedaba dibujado al final,
// con el saldo más alto de todos, aunque hubiera pasado antes que dos re-vencimientos.
describe("reordenar adelantos", () => {
  // Vence 25/07 y re-vence 25/08, que es hoy. El cliente adelantó un ciclo el 28/07: pasó
  // ANTES del re-vencimiento natural, pero sin reordenar el recorrido lo deja último.
  const ADEL = "2026-07-28", ADEL2 = "2026-08-05", NATURAL = "2026-08-25";
  const conAdel = (advancedAt: Loan["advancedAt"]) => mk({ advancedAt });
  const fechas = (l: Loan) => cycleSequence(l, HOY, overduePeriodsAt(l, HOY)).map((s) => s.date);
  /** Cuánto se devengó en cada fecha: es lo que decide a qué mes va la ganancia. */
  const porFecha = (l: Loan) =>
    Object.fromEntries(interestAccruals(l).map((e) => [e.date, Number(e.amount.toFixed(2))]));

  describe("ciclos enteros (advancedAt)", () => {
    it("por default el adelanto va al final de la secuencia", () => {
      const seq = cycleSequence(conAdel([ADEL]), HOY, 2);
      expect(seq.map((s) => s.date)).toEqual([NATURAL, ADEL]);
      expect(seq[0].advanceIndex).toBeUndefined();
      expect(seq[1].advanceIndex).toBe(0);
      expect(seq[1].pinned).toBeUndefined();
    });

    it("con `pos` queda fijado en su slot y el natural se corre para dejarle el lugar", () => {
      const seq = cycleSequence(conAdel([{ date: ADEL, pos: 1 }]), HOY, 2);
      expect(seq.map((s) => s.date)).toEqual([ADEL, NATURAL]);
      expect(seq[0].advanceIndex).toBe(0);
      expect(seq[0].pinned).toBe(true);
      // El re-vencimiento natural sigue siendo el primero del calendario aunque haya caído
      // en el slot 2: su fecha sale de su orden entre los naturales, no del slot.
      expect(seq[1].date).toBe(loanPeriodDate(conAdel([]), "2026-07-25", 1));
    });

    it("mover un adelanto no cambia la deuda", () => {
      // Todos los slots capitalizan con la misma fórmula, así que permutarlos da el mismo
      // saldo. Lo que cambia es la FECHA con la que se devenga cada ciclo.
      const quieto = conAdel([ADEL]), movido = conAdel([{ date: ADEL, pos: 1 }]);
      expect(remainingDebt(movido)).toBeCloseTo(remainingDebt(quieto), 2);
      expect(compoundReturn(movido)).toBeCloseTo(compoundReturn(quieto), 2);
      expect(sumAccruals(movido)).toBeCloseTo(sumAccruals(quieto), 2);
    });

    it("mueve a qué fecha se devenga cada ciclo", () => {
      // Sin reordenar, el ciclo chico cae en el re-vencimiento de agosto y el grande (que
      // compone sobre él) el 28/07, cuando el cliente vino: la ganancia de agosto se iba a
      // julio y la lista se leía al revés.
      expect(porFecha(conAdel([ADEL]))).toEqual({ "2026-07-25": 10000, [NATURAL]: 11000, [ADEL]: 12100 });
      // Reordenado: primero el adelanto, después el re-vencimiento.
      expect(porFecha(conAdel([{ date: ADEL, pos: 1 }]))).toEqual({ "2026-07-25": 10000, [ADEL]: 11000, [NATURAL]: 12100 });
    });

    it("dos adelantos se intercambian sin perder ninguno", () => {
      expect(fechas(conAdel([ADEL, ADEL2]))).toEqual([NATURAL, ADEL, ADEL2]);
      expect(fechas(conAdel([{ date: ADEL, pos: 2 }, { date: ADEL2, pos: 1 }])))
        .toEqual([ADEL2, ADEL, NATURAL]);
    });

    it("dos adelantos fijados al mismo slot: el segundo vuelve al final", () => {
      // No se puede perder uno por una posición repetida (datos viejos, un backup editado
      // a mano): el que no entra cae con los que no tienen posición.
      expect(fechas(conAdel([{ date: ADEL, pos: 1 }, { date: ADEL2, pos: 1 }])))
        .toEqual([ADEL, NATURAL, ADEL2]);
    });

    it("una posición fuera de rango se topea adentro de la secuencia", () => {
      expect(fechas(conAdel([{ date: ADEL, pos: 0 }]))).toEqual([ADEL, NATURAL]);
      expect(fechas(conAdel([{ date: ADEL, pos: 99 }]))).toEqual([NATURAL, ADEL]);
    });

    it("convive con el formato viejo (la fecha suelta) en el mismo array", () => {
      // Los datos guardados antes de esto son todos strings y no hay migración: un array
      // mixto tiene que leerse igual.
      expect(fechas(conAdel(["2026-07-28", { date: ADEL2, pos: 1 }]))).toEqual([ADEL2, NATURAL, ADEL]);
      expect(remainingDebt(conAdel([ADEL]))).toBeCloseTo(remainingDebt(conAdel([{ date: ADEL }])), 2);
    });

    it("la posición no mueve el próximo vencimiento ni la cuenta de ciclos", () => {
      // `pos` es el orden dentro de lo que ya pasó; el calendario lo sigue corriendo la
      // cantidad de adelantos, no dónde quedaron.
      const quieto = conAdel([ADEL]), movido = conAdel([{ date: ADEL, pos: 1 }]);
      expect(getNextRenewalDate(movido)).toBe(getNextRenewalDate(quieto));
      expect(overduePeriodsAt(movido, HOY)).toBe(overduePeriodsAt(quieto, HOY));
    });

    it("un adelanto fechado a futuro no entra en la secuencia", () => {
      const futuro = conAdel([{ date: addDays(HOY, 5), pos: 1 }]);
      expect(fechas(futuro)).toEqual([NATURAL]);
      expect(remainingDebt(futuro)).toBeCloseTo(remainingDebt(mk()), 2);
    });

    // Lo que hacen las flechitas de la línea de tiempo.
    describe("reorderAdvance: mover un slot", () => {
      /** Aplica el movimiento y devuelve la secuencia resultante, como hace la UI. */
      const mover = (l: Loan, idx: number, dir: -1 | 1) => {
        const movido = reorderAdvance(l, idx, dir, HOY, overduePeriodsAt(l, HOY));
        expect(movido).not.toBeNull();
        return fechas({ ...l, advancedAt: packAdvances(movido!) });
      };

      it("sube un lugar al adelanto que estaba último", () => {
        expect(mover(conAdel([ADEL]), 0, -1)).toEqual([ADEL, NATURAL]);
      });

      it("va y vuelve al mismo lugar", () => {
        const l = conAdel([ADEL]);
        const subido = reorderAdvance(l, 0, -1, HOY, 2)!;
        expect(mover({ ...l, advancedAt: packAdvances(subido) }, 0, 1)).toEqual([NATURAL, ADEL]);
      });

      it("intercambia con el adelanto que estaba en el destino", () => {
        // Sin el intercambio, el desplazado se iba al final de la secuencia: eso no es
        // "moverse un lugar".
        const l = conAdel([ADEL, ADEL2]);
        expect(fechas(l)).toEqual([NATURAL, ADEL, ADEL2]);
        expect(mover(l, 1, -1)).toEqual([NATURAL, ADEL2, ADEL]);
      });

      it("no hace nada en los bordes ni con un adelanto que no está en la secuencia", () => {
        const l = conAdel([{ date: ADEL, pos: 1 }]);
        expect(reorderAdvance(l, 0, -1, HOY, 2)).toBeNull();
        const ultimo = conAdel([ADEL]);
        expect(reorderAdvance(ultimo, 0, 1, HOY, 2)).toBeNull();
        expect(reorderAdvance(conAdel([{ date: addDays(HOY, 5) }]), 0, -1, HOY, 1)).toBeNull();
        expect(reorderAdvance(mk(), 0, -1, HOY, 1)).toBeNull();
      });

      it("sin ciclos corridos no hay slots entre los cuales elegir", () => {
        const sinCiclos = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 12) });
        expect(reorderAdvance(sinCiclos, 0, -1, HOY, 0)).toBeNull();
      });
    });
  });

  describe("medios ciclos (halfAdvancedAt)", () => {
    // Vence 25/06 y re-vence 25/07 y 25/08 (hoy). El cliente vino el 05/07, unos días
    // después del vencimiento: por fecha, ese medio adelanta el re-vencimiento de julio.
    const VINO = "2026-07-05", JULIO = "2026-07-25", AGOSTO = "2026-08-25";
    const conMedio = (halfAdvancedAt: Loan["halfAdvancedAt"], o: Partial<Loan> = {}) =>
      mk({ startDate: "2026-05-25", dueDate: "2026-06-25", halfAdvancedAt, ...o });

    it("por default adelanta el re-vencimiento del ciclo en que cae su fecha", () => {
      // Julio cobra la mitad que quedaba (5.775) y agosto el ciclo entero.
      expect(porFecha(conMedio([VINO])))
        .toEqual({ "2026-06-25": 10000, [VINO]: 5500, [JULIO]: 5775, [AGOSTO]: 12127.5 });
    });

    it("con `pos` adelanta el re-vencimiento que eligió el usuario", () => {
      // Julio vuelve a cobrar el ciclo entero y la mitad se le descuenta a agosto. El cargo
      // sigue fechado el día que el cliente vino, pero entra al recorrido en el slot que le
      // fijaron: por eso se cobra sobre otro saldo.
      expect(porFecha(conMedio([{ date: VINO, pos: 2 }])))
        .toEqual({ "2026-06-25": 10000, [JULIO]: 11000, [VINO]: 6050, [AGOSTO]: 6352.5 });
    });

    it("sin pagos en el medio la deuda total no cambia", () => {
      expect(remainingDebt(conMedio([{ date: VINO, pos: 2 }])))
        .toBeCloseTo(remainingDebt(conMedio([VINO])), 2);
    });

    it("con un pago en el medio sí cambia la plata", () => {
      // Ahí está la diferencia de mover un medio ciclo: cobrado antes del pago, capitaliza
      // sobre el saldo grande; cobrado después, sobre lo que quedó.
      const pago = { payments: [{ id: "p", amount: 50000, date: "2026-08-01", timelinePos: 1 }] };
      expect(remainingDebt(conMedio([VINO], pago))).toBeCloseTo(78402.5, 2);
      expect(remainingDebt(conMedio([{ date: VINO, pos: 2 }], pago))).toBeCloseTo(80902.5, 2);
    });

    it("movido al ciclo abierto, es el próximo vencimiento el que cobra la mitad", () => {
      // `nextCycleFraction` es lo que la notificación usa para no prometer el mes entero.
      expect(nextCycleFraction(conMedio([VINO]))).toBe(1);
      expect(nextCycleFraction(conMedio([{ date: VINO, pos: 3 }]))).toBe(0.5);
    });

    it("el tope de uno por período sigue el slot efectivo, no la fecha", () => {
      // Movido a agosto, julio queda libre para cobrarle otro medio y agosto topeado,
      // aunque la fecha del medio siga cayendo en julio.
      const movido = conMedio([{ date: VINO, pos: 2 }]);
      expect(halfCycleCharged(movido, VINO)).toBe(false);
      expect(halfCycleCharged(movido, "2026-08-05")).toBe(true);
      // Sin mover, al revés.
      expect(halfCycleCharged(conMedio([VINO]), VINO)).toBe(true);
      expect(halfCycleCharged(conMedio([VINO]), "2026-08-05")).toBe(false);
    });

    it("la planilla sigue cerrando con la deuda", () => {
      // La identidad que cuida toda la suite: el último saldo de la ficha es la deuda.
      for (const l of [conMedio([{ date: VINO, pos: 2 }]), conAdel([{ date: ADEL, pos: 1 }])]) {
        const filas = loanLedger(l);
        expect(filas[filas.length - 1].saldo).toBeCloseTo(remainingDebt(l), 2);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La ficha de cuenta corriente del préstamo. No recorre la deuda de nuevo: compone el
// devengado, los adicionales y los pagos. Por eso el último saldo TIENE que dar
// `remainingDebt` — si deja de cerrar, el que está mal es el recorrido, no la planilla.
describe("loanLedger: la planilla del préstamo", () => {
  const ultimo = (l: Loan) => { const f = loanLedger(l); return f[f.length - 1]; };

  // Once formas distintas. La identidad vale para todas.
  it.each([
    ["activo simple", mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) })],
    ["vencido un ciclo", mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2) })],
    ["vencido tres ciclos", mk({ startDate: addCalendarMonths(HOY, -5), dueDate: addCalendarMonths(HOY, -4) })],
    ["quincenal", mk({ paymentType: "15", startDate: addDays(HOY, -75), dueDate: addDays(HOY, -60) })],
    ["interés fijo", mk({ interestMode: "fixed", fixedInterest: 8000, startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) })],
    ["con pagos", mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [{ id: "p1", amount: 20000, date: addDays(HOY, -40) }, { id: "p2", amount: 15000, date: addDays(HOY, -10) }] })],
    ["con pago reordenado", mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [{ id: "p", amount: 30000, date: addDays(HOY, -40), timelinePos: 1 }] })],
    ["con adicional en ciclo cerrado", mk({ startDate: addCalendarMonths(HOY, -4), dueDate: addCalendarMonths(HOY, -3),
      extras: [{ id: "e", amount: 40000, date: addCalendarMonths(HOY, -2) }] })],
    ["con adicional en el ciclo abierto", mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20),
      extras: [{ id: "e", amount: 50000, date: addDays(HOY, -2) }] })],
    ["con medio ciclo", mk({ startDate: "2026-07-10", dueDate: "2026-08-10", halfAdvancedAt: ["2026-08-20"] })],
    ["con ciclo adelantado", mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20), advancedAt: [addDays(HOY, -2)] })],
    ["vencido con adicional posterior", mk({ startDate: addDays(HOY, -35), dueDate: addDays(HOY, -5),
      extras: [{ id: "e", amount: 50000, date: addDays(HOY, -2) }] })],
    ["pagado", mk({ status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10),
      payments: [{ id: "p", amount: 110000, date: addDays(HOY, -10) }] })],
  ])("el último saldo es la deuda del header: %s", (_caso, l) => {
    expect(ultimo(l)!.saldo).toBeCloseTo(remainingDebt(l), 2);
  });

  it("el saldo de cada fila es el anterior más el debe menos el haber", () => {
    const l = mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [{ id: "p", amount: 25000, date: addDays(HOY, -20) }] });
    let previo = 0;
    for (const f of loanLedger(l)) {
      expect(f.saldo).toBeCloseTo(previo + f.debe - f.haber, 2);
      previo = f.saldo;
    }
  });

  it("arranca por el capital prestado, en la fecha de inicio", () => {
    const l = mk({ amount: 100000, startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) });
    const primera = loanLedger(l)[0];
    expect(primera).toMatchObject({ kind: "capital", debe: 100000, haber: 0, date: l.startDate });
    expect(primera.saldo).toBeCloseTo(100000, 2);
  });

  it("cada cosa cae en su columna: lo que suma en el debe, lo que resta en el haber", () => {
    const l = mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [{ id: "p", amount: 25000, date: addDays(HOY, -20) }],
      extras: [{ id: "e", amount: 30000, date: addDays(HOY, -35) }] });
    for (const f of loanLedger(l)) {
      if (f.kind === "pago") expect([f.debe, f.haber > 0]).toEqual([0, true]);
      else expect([f.haber, f.debe > 0]).toEqual([0, true]);
    }
  });

  it("nombra cada interés por lo que es", () => {
    const l = mk({ startDate: "2026-07-10", dueDate: "2026-08-10", halfAdvancedAt: ["2026-08-20"] });
    const detalles = loanLedger(l).filter((f) => f.kind === "interes").map((f) => f.detalle);
    expect(detalles).toContain("Interés del período");
    expect(detalles).toContain("Medio ciclo");
  });

  it("la nota del pago y la del adicional se muestran tal cual", () => {
    const l = mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      payments: [{ id: "p", amount: 1000, date: addDays(HOY, -20), note: "Pagó en mano" }],
      extras: [{ id: "e", amount: 5000, date: addDays(HOY, -35), note: "Pidió para el auto" }] });
    const detalles = loanLedger(l).map((f) => f.detalle);
    expect(detalles).toContain("Pagó en mano");
    expect(detalles).toContain("Pidió para el auto");
  });

  it("un pago reordenado se ubica en su ciclo pero muestra su fecha real", () => {
    const l = mk({ startDate: "2026-06-10", dueDate: "2026-07-10",
      payments: [{ id: "p", amount: 30000, date: "2026-07-02", timelinePos: 1 }] });
    const filas = loanLedger(l);
    const pago = filas.find((f) => f.kind === "pago")!;
    expect(pago.date).toBe("2026-07-02");
    // Imputado al ciclo 1: va después del interés por mora del 10/08, no antes del
    // vencimiento como diría su fecha.
    expect(filas.indexOf(pago)).toBeGreaterThan(filas.findIndex((f) => f.detalle === "Interés por mora"));
  });

  it("lo fechado a futuro no entra todavía", () => {
    const l = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20),
      extras: [{ id: "e", amount: 50000, date: addDays(HOY, 5) }] });
    expect(loanLedger(l).some((f) => f.kind === "extra")).toBe(false);
  });

  describe("el interés del ciclo en curso", () => {
    it("un préstamo que no venció ya tiene cobrado su interés contratado", () => {
      const l = mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) });
      expect(unaccruedInterest(l)).toBeCloseTo(10000, 2);
      const f = loanLedger(l);
      expect(f[f.length - 1].detalle).toContain("ciclo en curso");
    });

    it("ya vencido no queda nada por fuera: todos los ciclos cerrados están devengados", () => {
      const l = mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2) });
      expect(unaccruedInterest(l)).toBe(0);
      expect(loanLedger(l).some((f) => f.detalle.includes("ciclo en curso"))).toBe(false);
    });

    it("un préstamo cerrado no tiene ciclo en curso", () => {
      const l = mk({ status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10),
        payments: [{ id: "p", amount: 110000, date: addDays(HOY, -10) }] });
      expect(unaccruedInterest(l)).toBe(0);
    });

    it("crece con los adicionales ya entregados", () => {
      const base = { startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) };
      const conExtra = mk({ ...base, extras: [{ id: "e", amount: 50000, date: addDays(HOY, -2) }] });
      expect(unaccruedInterest(conExtra)).toBeCloseTo(15000, 2);
    });
  });

  it("un préstamo sin capital no tiene planilla", () => {
    expect(loanLedger(mk({ amount: 0 }))).toEqual([]);
  });

  it("un préstamo sin vencimiento también cierra", () => {
    const l = mk({ noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -3) });
    expect(ultimo(l)!.saldo).toBeCloseTo(remainingDebt(l), 2);
  });

  it("si pagó todo, el saldo cierra en cero", () => {
    const l = mk({ startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10), status: "paid",
      payments: [{ id: "p", amount: 110000, date: addDays(HOY, -10) }] });
    expect(ultimo(l)!.saldo).toBeCloseTo(0, 2);
    expect(ultimo(l)!.saldo).toBeCloseTo(remainingDebt(l), 2);
  });

  it("las filas van en orden de fecha", () => {
    const l = mk({ startDate: addCalendarMonths(HOY, -4), dueDate: addCalendarMonths(HOY, -3),
      extras: [{ id: "e", amount: 30000, date: addCalendarMonths(HOY, -2) }],
      payments: [{ id: "p", amount: 20000, date: addDays(HOY, -15) }] });
    const filas = loanLedger(l);
    // El capital siempre primero; de ahí en más, nunca hacia atrás salvo un pago reordenado.
    expect(filas[0].kind).toBe("capital");
    const intereses = filas.filter((f) => f.kind === "interes").map((f) => f.date);
    expect([...intereses].sort()).toEqual(intereses);
  });
});
