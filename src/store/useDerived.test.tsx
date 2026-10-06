// Tests de los agregados que alimentan los gráficos y las cards. `useDerived` es un hook,
// así que se ejercita renderizándolo con una cartera sembrada.
//
// La regla que más cuida esta suite: lo que muestra un gráfico y lo que muestra la card
// de al lado tienen que ser el mismo número. Varios bugs históricos fueron exactamente eso.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDerived, initialState, reducer } from "./index.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// Adelantos de ciclo (`advancedAt`). La card de capital y el último punto de la curva
// se calculan por caminos distintos (`remainingDebt` vs `remainingDebtAt`), así que un
// adelanto tiene que contar igual en los dos o la pantalla se contradice sola.
describe("adelantos de ciclo", () => {
  const conAdelanto = (fecha: string): AppState => ({
    ...estado,
    loans: [...cartera, mk({
      id: "adelantado", clientName: "Iris",
      startDate: addCalendarMonths(HOY, -1), dueDate: addCalendarMonths(HOY, 1),
      advancedAt: [fecha],
    })],
  });

  it("un adelanto con fecha pasada cuadra card y curva", () => {
    const d = derive(conAdelanto(addDays(HOY, -3)));
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
    expect(ultimo.capital).toBeCloseTo(d.totalCapital, 2);
  });

  it("un adelanto con fecha futura cuadra card y curva", () => {
    const d = derive(conAdelanto(addDays(HOY, 5)));
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
    expect(ultimo.capital).toBeCloseTo(d.totalCapital, 2);
  });

  // En un prestamo activo las dos ramas acotan el capital a `min(deuda, monto)`, asi que
  // una diferencia en la deuda queda tapada. En un vencido se usa la deuda entera: ahi es
  // donde una divergencia entre los dos caminos se vuelve visible en pantalla.
  const vencidoConAdelanto = (fecha: string): AppState => ({
    ...estado,
    loans: [...cartera, mk({
      id: "vencidoAdelantado", clientName: "Juan",
      startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
      advancedAt: [fecha],
    })],
  });

  it("un vencido con adelanto pasado cuadra card y curva", () => {
    const d = derive(vencidoConAdelanto(addDays(HOY, -3)));
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
  });

  // Un prestamo con fecha de inicio futura: el cliente pago los intereses por adelantado,
  // asi que se re-inicio adelante, pero el capital sigue prestado. Tiene que contar — y
  // contar IGUAL en la card y en la curva.
  it("un prestamo con inicio a futuro cuenta, y cuadra card con curva", () => {
    const d = derive({
      ...estado,
      loans: [...cartera, mk({
        id: "futuro", clientName: "Kevin",
        startDate: addDays(HOY, 20), dueDate: addCalendarMonths(HOY, 2),
      })],
    });
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
    expect(ultimo.capital).toBeCloseTo(d.totalCapital, 2);
    // Y suma su principal: no desaparece del capital desplegado.
    expect(d.capitalInvested).toBeCloseTo(derive().capitalInvested + 100000, 2);
  });

  it("un vencido con adelanto futuro cuadra card y curva", () => {
    const d = derive(vencidoConAdelanto(addDays(HOY, 5)));
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Archivar es sólo un filtro de la pantalla de Préstamos: la plata sigue siendo plata y
// tiene que contar en todas las métricas. Si alguna vez se cuela un `.filter(l =>
// !l.archived)` en `useDerived`, este test lo caza.
describe("archivados", () => {
  it("un prestamo archivado alimenta las metricas igual que uno visible", () => {
    const base = derive();
    const conArchivados = derive({
      ...estado,
      loans: cartera.map((l) => ({ ...l, archived: true })),
    });
    expect(conArchivados.capitalInvested).toBeCloseTo(base.capitalInvested, 2);
    expect(conArchivados.totalCapital).toBeCloseTo(base.totalCapital, 2);
    expect(conArchivados.nextProfitTotal).toBeCloseTo(base.nextProfitTotal, 2);
    expect(conArchivados.totalDisbursed).toBeCloseTo(base.totalDisbursed, 2);
    expect(conArchivados.accumulatedProfit).toBeCloseTo(base.accumulatedProfit, 2);
    conArchivados.months.forEach((m, i) => {
      expect(m.capital).toBeCloseTo(base.months[i].capital, 2);
      expect(m.accrued).toBeCloseTo(base.months[i].accrued, 2);
    });
  });

  // Pero SI sale de la agenda: archivar es sacarlo de la vista, y eso incluye los avisos.
  // La linea divisoria es metricas (sigue) vs. cosas que te dicen "anda a cobrar" (no).
  it("pero sale de la agenda de cobro", () => {
    const base = derive();
    expect(base.upcomingDue.length).toBeGreaterThan(0);
    const conArchivados = derive({
      ...estado,
      loans: cartera.map((l) => ({ ...l, archived: true })),
    });
    expect(conArchivados.upcomingDue).toHaveLength(0);
    expect(conArchivados.dueTodayTomorrow).toHaveLength(0);
    expect(conArchivados.cashFlow30d.reduce((s, d) => s + d.count, 0)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refinanciar encadena préstamos: el viejo queda "refinanced" y el nuevo arranca con la
// deuda del viejo como capital. La misma plata pasa por varios registros, así que lo que
// se vigila acá es que no se cuente dos veces — ni que se pierda por el camino.
describe("cadenas de refinanciacion", () => {
  const A = mk({ id: "A", status: "refinanced", startDate: "2026-06-01", dueDate: "2026-07-01" });
  const B = mk({ id: "B", refinancedFromId: "A", amount: 110000, status: "refinanced",
                 startDate: "2026-07-01", dueDate: "2026-08-01" });
  const C = mk({ id: "C", refinancedFromId: "B", amount: 121000, status: "active",
                 startDate: "2026-08-01", dueDate: "2026-09-01" });
  const soloCadena = (loans: Loan[]): AppState => ({
    ...initialState, loaded: true, loans,
    settings: { ...initialState.settings, cashOnHand: 0, fixedIncomeAmount: 0 },
  });

  it("el capital no se duplica: solo cuenta el eslabon vigente", () => {
    const d = derive(soloCadena([A, B, C]));
    expect(d.capitalInvested).toBeCloseTo(121000, 2);
  });

  it("lo prestado cuenta una sola vez, no una por refinanciacion", () => {
    const d = derive(soloCadena([A, B, C]));
    expect(d.totalDisbursed).toBeCloseTo(100000, 2);
  });

  it("card y curva siguen cuadrando con una cadena en el medio", () => {
    const d = derive(soloCadena([A, B, C]));
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
    expect(ultimo.capital).toBeCloseTo(d.totalCapital, 2);
  });

  it("la ganancia de una cadena cobrada incluye los eslabones refinanciados", () => {
    // $100k prestados, cobrados $121k al final: la ganancia real de la cadena es $21k.
    // Sumando sólo los pagados daban $11k, porque el interés de D se había capitalizado
    // dentro del capital de E y ahí dejaba de contarse como ganancia.
    const D = mk({ id: "D", status: "refinanced", startDate: "2026-06-01", dueDate: "2026-07-01" });
    const E = mk({ id: "E", refinancedFromId: "D", amount: 110000, status: "paid",
                   startDate: "2026-07-01", dueDate: "2026-08-01",
                   payments: [{ id: "p", amount: 121000, date: "2026-08-01" }] });
    const d = derive(soloCadena([D, E]));
    expect(d.accumulatedProfit).toBeCloseTo(21000, 2);
    expect(d.capitalInvested).toBeCloseTo(0, 2);
  });

  it("refinanciar antes del vencimiento devenga en el cierre, no en el futuro", () => {
    // F vence el 1/9 pero se refinancia hoy: su interés se capitalizó en G ahora, así que
    // tiene que aparecer en el devengado de este mes. Antes se fechaba en el vencimiento
    // —una fecha futura— y la ganancia se caía del gráfico hasta que llegara.
    const F = mk({ id: "F", status: "refinanced", startDate: "2026-08-01", dueDate: "2026-09-01" });
    const G = mk({ id: "G", refinancedFromId: "F", amount: 110000, status: "active",
                   startDate: HOY, dueDate: "2026-09-25" });
    const d = derive(soloCadena([F, G]));
    const devengadoTotal = d.months.reduce((s, m) => s + m.accrued, 0);
    expect(devengadoTotal).toBeCloseTo(10000, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sumar capital a un préstamo en curso (sin refinanciar). Lo que se vigila: que la plata
// nueva aparezca en TODAS las métricas donde ya estaba la vieja, que la card y la curva
// sigan dando el mismo número, y que un adicional fechado a futuro no se cuele.
describe("adicionales de capital", () => {
  const soloUno = (loans: Loan[]): AppState => ({
    ...initialState, loaded: true, loans,
    settings: { ...initialState.settings, cashOnHand: 0, fixedIncomeAmount: 0 },
  });
  const activo = mk({ id: "A", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20) });
  const conExtra = { ...activo, extras: [{ id: "e1", amount: 50000, date: HOY }] };

  it("el capital invertido sube con el adicional", () => {
    expect(derive(soloUno([activo])).capitalInvested).toBeCloseTo(100000, 2);
    expect(derive(soloUno([conExtra])).capitalInvested).toBeCloseTo(150000, 2);
  });

  it("card y curva siguen cuadrando", () => {
    const d = derive(soloUno([conExtra]));
    const ultimo = d.months[d.months.length - 1];
    expect(ultimo.capitalInvested).toBeCloseTo(d.capitalInvested, 2);
    expect(ultimo.capital).toBeCloseTo(d.totalCapital, 2);
  });

  it("lo prestado incluye los adicionales: es plata que salió", () => {
    expect(derive(soloUno([conExtra])).totalDisbursed).toBeCloseTo(150000, 2);
  });

  it("la ganancia esperada y la próxima se calculan sobre el capital vigente", () => {
    const d = derive(soloUno([conExtra]));
    expect(d.nextProfitTotal).toBeCloseTo(15000, 2);
    expect(d.expectedProfitTotal).toBeCloseTo(15000, 2);
  });

  it("en un compartido el adicional también se prorratea", () => {
    const compartido = { ...conExtra, sharedWith: "Papá", myPercent: 50 };
    expect(derive(soloUno([compartido])).capitalInvested).toBeCloseTo(75000, 2);
    expect(derive(soloUno([compartido])).totalDisbursed).toBeCloseTo(75000, 2);
  });

  it("un adicional fechado a futuro no se cuenta todavía", () => {
    const futuro = { ...activo, extras: [{ id: "e1", amount: 50000, date: addDays(HOY, 5) }] };
    const d = derive(soloUno([futuro]));
    expect(d.capitalInvested).toBeCloseTo(100000, 2);
    expect(d.totalDisbursed).toBeCloseTo(100000, 2);
    expect(d.months[d.months.length - 1].capitalInvested).toBeCloseTo(d.capitalInvested, 2);
  });

  it("la curva de meses anteriores no ve un adicional posterior", () => {
    // El adicional entró este mes: el capital del mes pasado no puede haber cambiado.
    const viejo = { ...mk({ id: "A", startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, 2) }) };
    const base = derive(soloUno([viejo]));
    const d = derive(soloUno([{ ...viejo, extras: [{ id: "e1", amount: 50000, date: HOY }] }]));
    const mesPasado = monthKey(addCalendarMonths(HOY, -1));
    const i = base.months.findIndex((m) => m.key === mesPasado);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(d.months[i].capitalInvested).toBeCloseTo(base.months[i].capitalInvested, 2);
    expect(d.capitalInvested).toBeGreaterThan(base.capitalInvested);
  });

  it("la ganancia de un préstamo cobrado descuenta también el adicional", () => {
    // Prestó 100k, le sumó 50k, cobró 165k: ganó 15k, no 65k.
    const pagado = mk({
      id: "P", status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -5),
      extras: [{ id: "e1", amount: 50000, date: addDays(HOY, -30) }],
      payments: [{ id: "p", amount: 181500, date: addDays(HOY, -1) }],
    });
    const d = derive(soloUno([pagado]));
    expect(d.accumulatedProfit).toBeCloseTo(181500 - 150000, 2);
  });

  it("el devengado del mes incluye el interés del adicional", () => {
    // Vencimiento hoy con un adicional entregado antes: el interés del ciclo se devenga
    // sobre los 150k, no sobre los 100k originales.
    const l = mk({ id: "V", startDate: addCalendarMonths(HOY, -1), dueDate: HOY,
                   extras: [{ id: "e1", amount: 50000, date: addDays(HOY, -10) }] });
    const d = derive(soloUno([l]));
    const esteMes = d.months.find((m) => m.key === monthKey(HOY))!;
    expect(esteMes.accrued).toBeCloseTo(15000, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El reducer de los adicionales. Importa porque es el que valida la entrada (un monto
// en 0 no puede ensuciar la cartera) y el que reabre un préstamo ya cobrado.
describe("reducer de adicionales", () => {
  const base: AppState = { ...initialState, loaded: true, loans: [mk({ id: "A" })] };
  const extra = { id: "e1", amount: 50000, date: HOY };

  it("suma el adicional y lo deja en el historial", () => {
    const s = reducer(base, { type: "ADD_LOAN_EXTRA", payload: { loanId: "A", extra } });
    expect(s.loans[0].extras).toEqual([extra]);
    expect(s.loans[0].amount).toBe(100000); // el capital original no se reescribe
    expect(s.history[0]).toMatchObject({ kind: "loan_extra", ref: "A", amount: 50000, date: HOY });
  });

  it("rechaza montos inválidos y préstamos que no existen", () => {
    for (const payload of [
      { loanId: "A", extra: { ...extra, amount: 0 } },
      { loanId: "A", extra: { ...extra, amount: -100 } },
      { loanId: "A", extra: { ...extra, date: "" } },
      { loanId: "noExiste", extra },
    ]) {
      expect(reducer(base, { type: "ADD_LOAN_EXTRA", payload })).toBe(base);
    }
  });

  it("reabre un préstamo ya cobrado: volvió a haber deuda", () => {
    const pagado: AppState = {
      ...base,
      loans: [mk({ id: "A", status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10),
                   payments: [{ id: "p", amount: 110000, date: addDays(HOY, -10) }] })],
    };
    const s = reducer(pagado, { type: "ADD_LOAN_EXTRA", payload: { loanId: "A", extra } });
    expect(s.loans[0].status).not.toBe("paid");
  });

  it("quitar el adicional deja el préstamo como estaba", () => {
    const conExtra = reducer(base, { type: "ADD_LOAN_EXTRA", payload: { loanId: "A", extra } });
    const s = reducer(conExtra, { type: "DELETE_LOAN_EXTRA", payload: { loanId: "A", extraId: "e1" } });
    expect(s.loans[0].extras).toEqual([]);
    expect(derive(s).capitalInvested).toBeCloseTo(derive(base).capitalInvested, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La tasa de la cartera alimenta el label "X% × N ciclos" y toda la proyección. Un préstamo
// de interés fijo no tiene tasa: hay que convertir su cargo a % sobre el capital.
describe("tasa de la cartera con interés fijo", () => {
  const soloEstos = (loans: Loan[]): AppState => ({
    ...initialState, loaded: true, loans,
    settings: { ...initialState.settings, cashOnHand: 0, fixedIncomeAmount: 0 },
  });
  const pct = mk({ id: "pct", interestRate: 10, startDate: addDays(HOY, -5), dueDate: addDays(HOY, 25) });
  // $20.000 fijos sobre $100.000 son 20% reales, pero `interestRate` quedó en 8 (el
  // formulario guarda el último valor tocado aunque el campo esté oculto).
  const fijo = mk({ id: "fijo", interestMode: "fixed", fixedInterest: 20000, interestRate: 8,
                    startDate: addDays(HOY, -5), dueDate: addDays(HOY, 25) });

  it("el fijo entra con su tasa real, no con el interestRate colgado", () => {
    const d = derive(soloEstos([pct, fijo]));
    expect(d.avgRate).toBeCloseTo(15, 2);   // (10 + 20) / 2, no (10 + 8) / 2
    expect(d.medianRate).toBeCloseTo(15, 2);
  });

  it("la próxima ganancia del fijo no depende del capital", () => {
    const d = derive(soloEstos([fijo]));
    expect(d.nextProfitTotal).toBeCloseTo(20000, 2);
    const conExtra = derive(soloEstos([{ ...fijo, extras: [{ id: "e", amount: 100000, date: HOY }] }]));
    // El capital sube pero el cargo del período es el mismo monto fijo.
    expect(conExtra.capitalInvested).toBeCloseTo(200000, 2);
    expect(conExtra.nextProfitTotal).toBeCloseTo(20000, 2);
    // Y por eso la tasa efectiva de la cartera baja: mismo cargo sobre el doble de capital.
    expect(conExtra.avgRate).toBeCloseTo(10, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El devengado alimenta "Ganancia mensual", el ROI de cada mes y la ganancia acumulada de
// las cadenas refinanciadas. Tiene que ser lo que de verdad se le cargó al cliente.
describe("el devengado de los gráficos es lo que se cobró de verdad", () => {
  const soloUno = (loans: Loan[]): AppState => ({
    ...initialState, loaded: true, loans,
    settings: { ...initialState.settings, cashOnHand: 0, fixedIncomeAmount: 0 },
  });

  it("un cliente que paga los intereses al día no infla la ganancia del gráfico", () => {
    const l = mk({ id: "alDia", startDate: addCalendarMonths(HOY, -5), dueDate: addCalendarMonths(HOY, -4),
                   payments: [1, 2, 3].map((i) => ({ id: `p${i}`, amount: 10000, date: addCalendarMonths(HOY, -4 + i) })) });
    const d = derive(soloUno([l]));
    const r = d.loansResolved[0];
    const cobradoDeVerdad = r._remaining + r._paid - r._principal;
    const devengadoEnLosGraficos = d.months.reduce((s, m) => s + m.accrued, 0);
    expect(devengadoEnLosGraficos).toBeCloseTo(cobradoDeVerdad, 2);
  });

  it("el ROI de cada mes se mantiene en un rango creíble", () => {
    // Con el devengado inflado el ROI de un préstamo al 10% se iba bastante arriba del 10%.
    const l = mk({ id: "alDia", startDate: addCalendarMonths(HOY, -5), dueDate: addCalendarMonths(HOY, -4),
                   payments: [1, 2, 3].map((i) => ({ id: `p${i}`, amount: 10000, date: addCalendarMonths(HOY, -4 + i) })) });
    for (const m of derive(soloUno([l])).months) {
      expect(m.roi).toBeLessThanOrEqual(12);
    }
  });
});
