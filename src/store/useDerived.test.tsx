// Tests de los agregados que alimentan los gráficos y las cards. `useDerived` es un hook,
// así que se ejercita renderizándolo con una cartera sembrada.
//
// La regla que más cuida esta suite: lo que muestra un gráfico y lo que muestra la card
// de al lado tienen que ser el mismo número. Varios bugs históricos fueron exactamente eso.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDerived, initialState } from "./index.js";
import { addCalendarMonths, addDays, myShare, getNextRenewalDate, monthKey } from "../lib/utils.js";
import type { AppState, Loan, Derived } from "../types";

const HOY = "2026-08-25";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

const mk = (o: Partial<Loan> = {}): Loan => ({
  id: "x", clientId: "c", clientName: "Cliente", amount: 100000, interestRate: 10,
  startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
  paymentType: "30", payments: [], contacts: [], guarantyType: "cash",
  guarantyDetail: "", status: "active", compoundInterest: false, noDueDate: false,
  notes: "", createdAt: 0, ...o,
});

/** Cartera de referencia: cubre activo dentro y fuera de la ventana, atrasado, vence hoy,
 *  compartido, pagado anticipadamente y sin vencimiento. */
const cartera: Loan[] = [
  mk({ id: "activoEnVentana", clientName: "Ana", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 12) }),
  mk({ id: "activoFuera", clientName: "Beto", startDate: addDays(HOY, -5), dueDate: addDays(HOY, 200) }),
  mk({ id: "vencido", clientName: "Carla", startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2) }),
  mk({ id: "vencidoQuincenal", clientName: "Dario", paymentType: "15", startDate: addDays(HOY, -60), dueDate: addDays(HOY, -45) }),
  mk({ id: "venceHoy", clientName: "Eva", startDate: addCalendarMonths(HOY, -1), dueDate: HOY }),
  mk({ id: "compartido", clientName: "Fabi", sharedWith: "Papá", myPercent: 50,
       startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) }),
  mk({ id: "pagado", clientName: "Gus", status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10),
       payments: [{ id: "pp", amount: 110000, date: addDays(HOY, -15) }] }),
  mk({ id: "sinVencimiento", clientName: "Hugo", noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -3) }),
];

const estado: AppState = {
  ...initialState,
  loaded: true,
  loans: cartera,
  assets: [{ id: "as1", name: "Auto", category: "vehicle", description: "", value: 50000 }],
  liabilities: [{ id: "li1", name: "Papá", amount: 80600, startDate: addDays(HOY, -30),
                  payments: [{ id: "lp", amount: 600, date: addDays(HOY, -5) }], createdAt: 0 }],
  income: [{ id: "i1", type: "income", amount: 5000, category: "otros", description: "", date: addDays(HOY, -3), createdAt: 0 }],
  expenses: [{ id: "e1", type: "expense", amount: 2000, category: "comida", description: "", date: addDays(HOY, -3), createdAt: 0 }],
  settings: { ...initialState.settings, cashOnHand: 200000, fixedIncomeAmount: 0 },
};

const derive = (s: AppState = estado): Derived => renderHook(() => useDerived(s)).result.current;

// ─────────────────────────────────────────────────────────────────────────────
describe("identidades del capital", () => {
  let d: Derived;
  beforeAll(() => { d = derive(); });

  it("capital total = efectivo + invertido + activos − pasivos", () => {
    expect(d.totalCapital).toBeCloseTo(d.available + d.capitalInvested + d.totalAssets - d.totalLiabilities, 2);
  });

  it("capital de trabajo = efectivo + invertido", () => {
    expect(d.workingCapital).toBeCloseTo(d.available + d.capitalInvested, 2);
  });

  it("los pasivos descuentan los pagos hechos", () => {
    expect(d.totalLiabilities).toBeCloseTo(80000, 2); // 80.600 − 600
  });

  it("un pasivo sobrepagado no genera capital de la nada", () => {
    const s = { ...estado, liabilities: [{ ...estado.liabilities[0], payments: [{ id: "x", amount: 999999, date: HOY }] }] };
    expect(derive(s).totalLiabilities).toBe(0);
  });

  it("los pasivos pueden dejar el capital total en negativo", () => {
    const s = { ...estado, liabilities: [{ id: "l", name: "X", amount: 9_000_000, startDate: HOY, payments: [], createdAt: 0 }] };
    expect(derive(s).totalCapital).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la curva del gráfico cierra con las cards", () => {
  let d: Derived;
  beforeAll(() => { d = derive(); });
  const ultimo = () => d.months[d.months.length - 1];

  it('el último punto de "Capital invertido" es el capital invertido actual', () => {
    expect(ultimo().capitalInvested).toBeCloseTo(d.capitalInvested, 2);
  });

  it('el último punto de "Evolución del capital" es el capital total actual', () => {
    expect(ultimo().capital).toBeCloseTo(d.totalCapital, 2);
  });

  it("ningún mes produce NaN", () => {
    for (const m of d.months) {
      for (const v of [m.income, m.expense, m.capital, m.capitalInvested, m.accrued, m.salary, m.monthGain, m.roi]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("el devengado y el ROI nunca son negativos", () => {
    for (const m of d.months) {
      expect(m.accrued).toBeGreaterThanOrEqual(0);
      expect(m.roi).toBeGreaterThanOrEqual(0);
    }
  });

  it('la ganancia del mes es interés devengado + sueldo', () => {
    for (const m of d.months) expect(m.monthGain).toBeCloseTo(m.accrued + m.salary, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("estados de la cartera", () => {
  let d: Derived;
  beforeAll(() => { d = derive(); });

  it("los grupos particionan la cartera sin solaparse ni perder préstamos", () => {
    const suma = d.activeLoans.length + d.overdueLoans.length + d.paidLoans.length + d.refinancedLoans.length;
    expect(suma).toBe(d.loansResolved.length);
  });

  it("el que vence hoy ya cuenta como atrasado", () => {
    expect(d.overdueLoans.map((l) => l.id)).toContain("venceHoy");
  });

  it("el que vence hoy aparece en la agenda del día", () => {
    expect(d.dueTodayTomorrow.map((l) => l.id)).toContain("venceHoy");
  });

  it("próximos vencimientos viene ordenado y sólo con préstamos abiertos", () => {
    for (let i = 1; i < d.upcomingDue.length; i++) {
      expect(d.upcomingDue[i]._daysUntilDue!).toBeGreaterThanOrEqual(d.upcomingDue[i - 1]._daysUntilDue!);
    }
    expect(d.upcomingDue.every((l) => l._status === "active" || l._status === "overdue")).toBe(true);
  });

  it("la cobrabilidad es una proporción válida", () => {
    expect(d.collectabilityRate === null || (d.collectabilityRate >= 0 && d.collectabilityRate <= 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("flujo de caja a 30 días", () => {
  let d: Derived;
  beforeAll(() => { d = derive(); });
  const enVentana = (fecha: string) => fecha >= HOY && fecha <= addDays(HOY, 29);

  it("incluye los re-vencimientos de los atrasados", () => {
    // El bug original: sólo miraba el dueDate original, que siempre está en el pasado,
    // así que ningún atrasado aparecía y el gráfico contradecía al mapa de vencimientos.
    const conRenovacionEnVentana = d.overdueLoans.filter((l) => enVentana(getNextRenewalDate(l)));
    expect(conRenovacionEnVentana.length).toBeGreaterThan(0);
    for (const l of conRenovacionEnVentana) {
      const dia = d.cashFlow30d.find((c) => c.date === getNextRenewalDate(l));
      expect(dia?.expected).toBeGreaterThan(0);
    }
  });

  it("cuenta cada préstamo una sola vez", () => {
    // Sumar la misma deuda en dos días distintos inflaría el total del gráfico.
    const esperados = [...d.activeLoans, ...d.overdueLoans].filter((l) => {
      const objetivo = d.overdueLoans.includes(l)
        ? (l.dueDate === HOY ? l.dueDate : getNextRenewalDate(l))
        : l.dueDate;
      return enVentana(objetivo);
    });
    expect(d.cashFlow30d.reduce((a, c) => a + c.count, 0)).toBe(esperados.length);
    expect(d.cashFlow30d.reduce((a, c) => a + c.expected, 0))
      .toBeCloseTo(esperados.reduce((a, l) => a + myShare(l) * l._remaining, 0), 2);
  });

  it("el compartido aporta sólo mi mitad", () => {
    const l = d.loansResolved.find((x) => x.id === "compartido")!;
    const dia = d.cashFlow30d.find((c) => c.date === l.dueDate);
    expect(dia!.expected).toBeCloseTo(l._remaining * 0.5, 2);
  });

  it("cubre exactamente 30 días desde hoy", () => {
    expect(d.cashFlow30d).toHaveLength(30);
    expect(d.cashFlow30d[0].date).toBe(HOY);
    expect(d.cashFlow30d[29].date).toBe(addDays(HOY, 29));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("préstamos compartidos en los agregados", () => {
  let d: Derived;
  beforeAll(() => { d = derive(); });

  it("la card muestra la deuda bruta del cliente", () => {
    const compartido = d.loansResolved.find((l) => l.id === "compartido")!;
    const equivalente = d.loansResolved.find((l) => l.id === "activoEnVentana")!;
    expect(compartido._remaining).toBeCloseTo(equivalente._remaining, 2);
  });

  it("el total prestado prorratea mi parte y excluye refinanciados", () => {
    const esperado = estado.loans
      .filter((l) => !l.refinancedFromId)
      .reduce((a, l) => a + myShare(l) * Number(l.amount), 0);
    expect(d.totalDisbursed).toBeCloseTo(esperado, 2);
    expect(d.totalDisbursed).toBeLessThan(estado.loans.reduce((a, l) => a + Number(l.amount), 0));
  });

  it("un préstamo creado por refinanciación no se cuenta dos veces", () => {
    const s = {
      ...estado,
      loans: [
        mk({ id: "original", status: "refinanced" }),
        mk({ id: "nuevo", refinancedFromId: "original" }),
      ],
    };
    expect(derive(s).totalDisbursed).toBeCloseTo(100000, 2); // no 200.000
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ingresos, gastos y devengado", () => {
  let d: Derived;
  beforeAll(() => { d = derive(); });

  it("suma las transacciones cargadas", () => {
    expect(d.totalIncome).toBeCloseTo(5000, 2);
    expect(d.totalExpense).toBeCloseTo(2000, 2);
  });

  it("el préstamo cobrado antes de vencer devenga en el mes en que se cobró", () => {
    const i = d.months.findIndex((m) => m.key === monthKey(addDays(HOY, -15)));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(d.months[i].accrued).toBeGreaterThan(0);
  });

  it("el sueldo fijo se suma al ingreso del mes sin crear una transacción", () => {
    const s = { ...estado, settings: { ...estado.settings, fixedIncomeAmount: 300000, fixedIncomeDay: 1 } };
    const conSueldo = derive(s);
    const ultimo = conSueldo.months[conSueldo.months.length - 1];
    expect(ultimo.salary).toBe(300000);
    expect(ultimo.income).toBeCloseTo(5000 + 300000, 2);
    expect(conSueldo.totalIncome).toBeGreaterThan(d.totalIncome);
    expect(s.income).toHaveLength(1); // no se creó ninguna transacción
  });

  it("el sueldo fijo no contamina las métricas de interés de préstamos", () => {
    const s = { ...estado, settings: { ...estado.settings, fixedIncomeAmount: 300000, fixedIncomeDay: 1 } };
    expect(derive(s).nextProfitTotal).toBeCloseTo(d.nextProfitTotal, 2);
    expect(derive(s).capitalInvested).toBeCloseTo(d.capitalInvested, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("plazo de la cartera", () => {
  it("usa el ciclo del préstamo, no la distancia entre fechas", () => {
    // Un préstamo "30 días" que arranca el 1 de julio vence el 1 de agosto: 31 días de
    // distancia, pero el ciclo sigue siendo de 30.
    const s = { ...estado, loans: [mk({ id: "a", startDate: "2026-08-01", dueDate: "2026-09-01" })] };
    expect(derive(s).medianDays).toBe(30);
  });

  it("una cartera quincenal reporta 15 días", () => {
    const s = {
      ...estado,
      loans: [
        mk({ id: "q1", paymentType: "15", startDate: addDays(HOY, -5), dueDate: addDays(HOY, 10) }),
        mk({ id: "q2", paymentType: "15", startDate: addDays(HOY, -8), dueDate: addDays(HOY, 7) }),
      ],
    };
    expect(derive(s).medianDays).toBe(15);
  });

  it("sin préstamos activos cae al plazo por defecto", () => {
    expect(derive({ ...estado, loans: [] }).medianDays).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cartera vacía", () => {
  const d = derive({ ...initialState, loaded: true });

  it("no rompe ni produce NaN", () => {
    for (const v of [d.capitalInvested, d.totalCapital, d.workingCapital, d.totalIncome,
                     d.totalExpense, d.nextProfitTotal, d.totalLiabilities, d.avgRate]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(d.collectabilityRate).toBeNull();
    expect(d.cashFlow30d.every((c) => c.expected === 0)).toBe(true);
    expect(d.months.every((m) => m.roi === 0)).toBe(true);
  });
});
