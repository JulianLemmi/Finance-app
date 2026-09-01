// Paridad entre el cálculo del frontend y el del edge function que manda las
// notificaciones (`supabase/functions/_shared/loanMath.ts`).
//
// Las edge functions no pueden importar desde src/ (Deno sólo bundlea dentro de la carpeta
// de la function), así que loanMath.ts es una copia a mano de las fórmulas. Cada vez que
// una cambia de un lado y no del otro, el push avisa una fecha de vencimiento distinta a
// la que el usuario ve en pantalla. Estos tests comparan las dos implementaciones sobre la
// misma cartera y fallan ante cualquier desvío.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as edge from "../../supabase/functions/_shared/loanMath.ts";
import { buildDigest, fmtDate } from "../../supabase/functions/_shared/digest.ts";
import {
  getLoanCycleDays, loanPeriodDate, loanElapsedPeriods, getNextRenewalDate,
  addCalendarMonths, addDays, daysBetween,
} from "./utils.js";
import { remainingDebt, resolveStatus, expectedProfit, expectedReturn, paidAmount } from "./calcs.js";
import type { Loan } from "../types";

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

/** Cartera amplia: distintos plazos, estados, pagos y bordes de calendario. */
const cartera: Record<string, Loan> = {
  activo: mk({ startDate: addDays(HOY, -10), dueDate: addDays(HOY, 12) }),
  venceHoy: mk({ startDate: addCalendarMonths(HOY, -1), dueDate: HOY }),
  venceManana: mk({ startDate: addCalendarMonths(HOY, -1), dueDate: addDays(HOY, 1) }),
  vencido1: mk({ startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) }),
  vencido3: mk({ startDate: addCalendarMonths(HOY, -4), dueDate: addCalendarMonths(HOY, -3) }),
  vencido13: mk({ startDate: addCalendarMonths(HOY, -14), dueDate: addCalendarMonths(HOY, -13) }),
  quincenal: mk({ paymentType: "15", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -25) }),
  custom45: mk({ paymentType: "custom", customDays: 45, startDate: addDays(HOY, -100), dueDate: addDays(HOY, -55) }),
  custom7: mk({ paymentType: "custom", customDays: 7, startDate: addDays(HOY, -30), dueDate: addDays(HOY, -23) }),
  fijo: mk({ interestMode: "fixed", fixedInterest: 8000, interestRate: 0,
             startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) }),
  conPagos: mk({ startDate: addCalendarMonths(HOY, -3), dueDate: addCalendarMonths(HOY, -2),
                 payments: [{ id: "p", amount: 30000, date: addCalendarMonths(HOY, -1) }] }),
  pagado: mk({ status: "paid", startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10),
               payments: [{ id: "p", amount: 110000, date: addDays(HOY, -10) }] }),
  finDeMes: mk({ startDate: "2026-01-31", dueDate: "2026-02-28" }),
  finDeMes31: mk({ startDate: "2025-12-31", dueDate: "2026-01-31" }),
  bisiesto: mk({ startDate: "2028-01-31", dueDate: "2028-02-29" }),
  tasaCero: mk({ interestRate: 0, startDate: addDays(HOY, -40), dueDate: addDays(HOY, -10) }),
  compartido: mk({ sharedWith: "Papá", myPercent: 50, dueDate: addCalendarMonths(HOY, -1) }),
  sinVencimiento: mk({ noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -3) }),
  sinVencFijo: mk({ noDueDate: true, dueDate: "", interestMode: "fixed", fixedInterest: 5000,
                    interestRate: 0, startDate: addCalendarMonths(HOY, -4) }),
  // El caso que rompía las notificaciones: el cliente paga los intereses al día, así que
  // para la app vuelve a estar "activo" aunque su vencimiento ya haya pasado.
  interesesAlDia: mk({ startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
                       payments: [{ id: "p", amount: 20000, date: addCalendarMonths(HOY, -1) }] }),
};

const casos = Object.entries(cartera);

describe("paridad de fechas frontend ↔ notificaciones", () => {
  it.each(casos)("mismo largo de ciclo [%s]", (_n, l) => {
    expect(edge.getLoanCycleDays(l)).toBe(getLoanCycleDays(l));
  });

  it.each(casos)("misma fecha de próximo vencimiento [%s]", (_n, l) => {
    // Es la fecha exacta que sale en el push. Si difiere, el aviso llega otro día.
    const edgeDate = edge.getNextRenewalDate(l, HOY);
    const frontDate = getNextRenewalDate(l);
    // Un préstamo sin vencimiento no tiene renovación: el edge devuelve null y el frontend
    // "". Ambos son falsy y los dos call sites los tratan igual, así que sólo importa que
    // coincidan en "no hay fecha".
    if (!edgeDate || !frontDate) {
      expect(Boolean(edgeDate)).toBe(Boolean(frontDate));
      return;
    }
    expect(edgeDate).toBe(frontDate);
  });

  it.each(casos)("mismas fechas de período, ciclo por ciclo [%s]", (_n, l) => {
    if (!l.dueDate) return;
    for (let n = 0; n <= 18; n++) {
      expect(edge.loanPeriodDate(l, l.dueDate, n)).toBe(loanPeriodDate(l, l.dueDate, n));
    }
  });

  it.each(casos)("mismos períodos transcurridos [%s]", (_n, l) => {
    if (!l.dueDate) return;
    expect(edge.loanElapsedPeriods(l, l.dueDate, HOY)).toBe(loanElapsedPeriods(l, l.dueDate, HOY));
  });
});

describe("paridad de montos frontend ↔ notificaciones", () => {
  it.each(casos)("misma deuda restante [%s]", (_n, l) => {
    expect(edge.remainingDebt(l, HOY)).toBeCloseTo(remainingDebt(l), 2);
  });

  it.each(casos)("mismo estado [%s]", (_n, l) => {
    expect(edge.resolveStatus(l, HOY)).toBe(resolveStatus(l));
  });

  it.each(casos)("mismo interés y retorno esperado [%s]", (_n, l) => {
    expect(edge.expectedProfit(l)).toBeCloseTo(expectedProfit(l), 2);
    expect(edge.expectedReturn(l)).toBeCloseTo(expectedReturn(l), 2);
    expect(edge.paidAmount(l)).toBeCloseTo(paidAmount(l), 2);
  });
});

describe("paridad de los helpers de fecha", () => {
  const fechas = ["2026-01-31", "2026-02-28", "2026-08-25", "2025-12-31", "2028-02-29", "2026-03-01"];

  it.each(fechas)("addCalendarMonths coincide [%s]", (f) => {
    for (let m = -14; m <= 14; m++) {
      expect(edge.addCalendarMonths(f, m)).toBe(addCalendarMonths(f, m));
    }
  });

  it.each(fechas)("addDays coincide [%s]", (f) => {
    for (const d of [-400, -31, -1, 0, 1, 15, 30, 45, 366]) {
      expect(edge.addDays(f, d)).toBe(addDays(f, d));
    }
  });

  it("daysBetween coincide a lo largo de un año", () => {
    let d = "2026-01-01";
    for (let i = 0; i < 365; i++) {
      const siguiente = addDays(d, 1);
      expect(edge.daysBetween(d, siguiente)).toBe(daysBetween(d, siguiente));
      d = siguiente;
    }
  });
});

describe("el resumen que sale por push", () => {
  const digestDe = (loans: Loan[], dias = 7) => buildDigest(loans, HOY, dias);

  // Archivar saca al prestamo de la agenda de la app; el push tiene que acompanar, o
  // seguis recibiendo recordatorios de algo que justamente sacaste de la vista.
  it("no anuncia un préstamo archivado", () => {
    const activo = mk({ id: "a", clientName: "Ana", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 3) });
    expect(digestDe([activo])).not.toBeNull();
    expect(digestDe([{ ...activo, archived: true }])).toBeNull();
  });

  it("archivar uno no silencia a los demás", () => {
    const ana = mk({ id: "a", clientName: "Ana", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 3) });
    const beto = mk({ id: "b", clientName: "Beto", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 4), archived: true });
    const d = digestDe([ana, beto])!;
    expect(d.count).toBe(1);
    expect(d.body).toContain("Ana");
    expect(d.body).not.toContain("Beto");
  });

  it("anuncia el vencimiento propio de un préstamo activo", () => {
    const l = mk({ id: "a", clientName: "Ana", startDate: addDays(HOY, -10), dueDate: addDays(HOY, 3) });
    const d = digestDe([l])!;
    expect(d.items[0].date).toBe(addDays(HOY, 3));
    expect(d.items[0].renewal).toBe(false);
    expect(d.body).toContain("Ana");
  });

  it("un préstamo que vence hoy se anuncia hoy, no el mes que viene", () => {
    // Pasa a "overdue" el mismo día del vencimiento, pero ese día todavía es el día de
    // cobro: saltar al re-vencimiento avisaría una fecha equivocada.
    const l = mk({ id: "h", clientName: "Hoy", startDate: addCalendarMonths(HOY, -1), dueDate: HOY });
    const d = digestDe([l])!;
    expect(d.items[0].date).toBe(HOY);
    expect(d.body).toContain("hoy");
  });

  it("un atrasado se anuncia en su próximo re-vencimiento, marcado con ↻", () => {
    const l = mk({ id: "v", clientName: "Vencido",
                   startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1) });
    const d = digestDe([l], 40)!;
    expect(d.items[0].date).toBe(getNextRenewalDate(l));
    expect(d.items[0].renewal).toBe(true);
    expect(d.body).toContain("↻");
  });

  it("el que paga los intereses al día no se anuncia como atrasado", () => {
    // Este es el bug que motivó estos tests. El cliente pagó lo suficiente como para
    // cubrir el interés acumulado, así que para la app el préstamo volvió a estar
    // "activo" — pero el digest lo seguía viendo atrasado y le anunciaba al usuario la
    // fecha del re-vencimiento, que no es la que muestra la pantalla.
    const l = mk({ id: "i", clientName: "AlDia",
                   startDate: addCalendarMonths(HOY, -2), dueDate: addCalendarMonths(HOY, -1),
                   payments: [{ id: "p", amount: 20000, date: addCalendarMonths(HOY, -1) }] });
    expect(resolveStatus(l)).toBe("active");
    expect(edge.resolveStatus(l, HOY)).toBe("active");
    // Con ventana amplia, para que el re-vencimiento entre si el bug volviera.
    expect(buildDigest([l], HOY, 400)).toBeNull();
  });

  it("la fecha anunciada es siempre la misma que muestra la app", () => {
    // Recorre toda la cartera: para cada préstamo que entre al digest, la fecha del push
    // tiene que ser la que la app usa como próximo vencimiento.
    for (const [nombre, l] of casos) {
      const d = buildDigest([l], HOY, 400);
      if (!d) continue;
      const esperada = resolveStatus(l) === "overdue" && l.dueDate !== HOY
        ? getNextRenewalDate(l)
        : l.dueDate;
      expect(`${nombre}: ${d.items[0].date}`).toBe(`${nombre}: ${esperada}`);
    }
  });

  it("no avisa de préstamos cerrados ni sin vencimiento", () => {
    const pagado = mk({ id: "p", status: "paid", dueDate: addDays(HOY, 2),
                        payments: [{ id: "x", amount: 110000, date: HOY }] });
    const refinanciado = mk({ id: "r", status: "refinanced", dueDate: addDays(HOY, 2) });
    const sinVenc = mk({ id: "s", noDueDate: true, dueDate: "", startDate: addCalendarMonths(HOY, -2) });
    expect(digestDe([pagado, refinanciado, sinVenc])).toBeNull();
  });

  it("respeta la ventana: ni pasado ni más allá del horizonte", () => {
    const dentro = mk({ id: "d", clientName: "Dentro", startDate: addDays(HOY, -5), dueDate: addDays(HOY, 5) });
    const lejos = mk({ id: "l", clientName: "Lejos", startDate: HOY, dueDate: addDays(HOY, 60) });
    const d = digestDe([dentro, lejos])!;
    expect(d.count).toBe(1);
    expect(d.body).toContain("Dentro");
    expect(d.body).not.toContain("Lejos");
  });

  it("ordena por fecha y respeta la ventana configurada", () => {
    const loans = [5, 1, 3].map((n) =>
      mk({ id: `x${n}`, clientName: `C${n}`, startDate: addDays(HOY, -5), dueDate: addDays(HOY, n) }));
    expect(digestDe(loans)!.items.map((i) => i.name)).toEqual(["C1", "C3", "C5"]);
    expect(digestDe(loans, 2)!.items.map((i) => i.name)).toEqual(["C1"]);
  });

  it("dice hoy y mañana en vez de la fecha", () => {
    const hoy = mk({ id: "h", clientName: "Hoy", startDate: addCalendarMonths(HOY, -1), dueDate: HOY });
    const manana = mk({ id: "m", clientName: "Mañana", startDate: addDays(HOY, -5), dueDate: addDays(HOY, 1) });
    const body = digestDe([hoy, manana])!.body;
    expect(body).toContain("Hoy — hoy");
    expect(body).toContain("Mañana — mañana");
  });

  it("recorta a 10 y avisa cuántos quedaron afuera", () => {
    const loans = Array.from({ length: 13 }, (_, i) =>
      mk({ id: `n${i}`, clientName: `C${i}`, startDate: addDays(HOY, -5), dueDate: addDays(HOY, 1) }));
    const d = digestDe([...loans])!;
    expect(d.count).toBe(13);
    expect(d.body.split("\n").filter((l) => l.startsWith("•"))).toHaveLength(10);
    expect(d.body).toContain("+3 más");
  });

  it("sin vencimientos en la ventana no manda nada", () => {
    expect(digestDe([])).toBeNull();
    expect(digestDe([mk({ id: "f", startDate: HOY, dueDate: addDays(HOY, 90) })])).toBeNull();
  });

  it("formatea la fecha como día/mes", () => {
    expect(fmtDate("2026-09-07")).toBe("07/09");
  });
});

describe("la fecha de hoy del edge function", () => {
  it("usa el día de Argentina, no el de UTC", () => {
    // El cron corre a las 9 AM ART, pero si alguna vez se dispara de noche el día UTC
    // ya cambió y el digest miraría la ventana equivocada.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 26, 1, 30))); // 22:30 del 25 en Argentina
    expect(edge.todayISOInTz(-3)).toBe("2026-08-25");
    vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
  });

  it("no se adelanta al mediodía", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 25, 15, 0)));  // 12:00 del 25 en Argentina
    expect(edge.todayISOInTz(-3)).toBe("2026-08-25");
    vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
  });
});
