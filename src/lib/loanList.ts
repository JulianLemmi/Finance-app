// El listado de Préstamos: cómo se ordena, la descripción corta de cada card y sus
// últimos movimientos. Vive fuera de la pantalla para poder testearlo.
import { formatMoney, formatShortDate, getLoanCycleDays, todayISO } from "./utils.js";
import { loanLedger, nextCollectionDate, type LedgerRow } from "./calcs.js";
import type { Loan, LoanStatus, LoansSort, ResolvedLoan } from "../types";

export const LOANS_SORTS: { v: LoansSort; l: string }[] = [
  { v: "priority", l: "Prioridad" },
  { v: "due", l: "Vence antes" },
  { v: "amountDesc", l: "Mayor monto" },
  { v: "amountAsc", l: "Menor monto" },
];

export const esOrdenValido = (v: unknown): v is LoansSort =>
  LOANS_SORTS.some((s) => s.v === v);

const enCurso = (l: ResolvedLoan) => l._status === "active" || l._status === "overdue";

/**
 * Ordena una COPIA (el array suele ser un memo que leen otras pantallas; ver ClientsScreen).
 *
 * - `priority`: atrasados primero, después activos, y dentro de cada uno el que vence antes.
 *   Es el orden de siempre.
 * - `due`: por la próxima fecha de cobro (`nextCollectionDate`, la misma que muestra la
 *   card en "Próx. cobro" y el detalle). Un atrasado no va primero por estar atrasado: va
 *   cuando le toca su próximo re-vencimiento, que es lo que "vence antes" pregunta.
 * - `amountDesc` / `amountAsc`: por lo que debe (el número grande de la card).
 *
 * En los tres órdenes nuevos los cerrados (pagados, refinanciados) van al final: no vencen
 * y deben cero, así que "menor monto" los pondría siempre arriba y taparían a los vivos.
 */
export function sortLoans(loans: ResolvedLoan[], sort: LoansSort, asOf: string = todayISO()): ResolvedLoan[] {
  const arr = [...loans];
  const porNombre = (a: ResolvedLoan, b: ResolvedLoan) => a.clientName.localeCompare(b.clientName, "es");

  if (sort === "priority") {
    const order: Record<LoanStatus, number> = { overdue: 0, active: 1, refinanced: 2, paid: 3 };
    return arr.sort((a, b) => {
      const oa = order[a._status] ?? 9, ob = order[b._status] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a._daysUntilDue ?? 9999) - (b._daysUntilDue ?? 9999);
    });
  }

  const vivosPrimero = (a: ResolvedLoan, b: ResolvedLoan) => Number(enCurso(b)) - Number(enCurso(a));

  if (sort === "due") {
    // Sin fecha (sin vencimiento, o cerrado) va después de todos los que tienen una.
    const fecha = (l: ResolvedLoan) => (enCurso(l) ? nextCollectionDate(l, asOf) : "") || "9999-12-31";
    return arr.sort((a, b) =>
      vivosPrimero(a, b)
      || fecha(a).localeCompare(fecha(b))
      || b._remaining - a._remaining
      || porNombre(a, b));
  }

  const signo = sort === "amountDesc" ? -1 : 1;
  return arr.sort((a, b) =>
    vivosPrimero(a, b)
    || signo * (a._remaining - b._remaining)
    || porNombre(a, b));
}

const CICLO: Record<string, string> = { "30": "ciclo mensual", "15": "ciclo quincenal" };

/**
 * Una línea que dice qué préstamo es: cuánto se prestó, cada cuánto cobra y la garantía
 * concreta. No repite lo que la card ya muestra (la deuda, la tasa, las fechas, el tipo de
 * garantía): agrega lo que hasta ahora sólo estaba adentro del detalle.
 */
export function loanDescription(loan: ResolvedLoan, currency: string, hide = false): string {
  const partes: string[] = [];
  const capital = formatMoney(loan._principal, hide, currency);
  partes.push(loan.refinancedFromId ? `Refinanciación por ${capital}` : `${capital} prestados`);
  if ((loan.extras || []).length > 0) {
    const n = loan.extras!.length;
    partes.push(`${n} adicional${n === 1 ? "" : "es"}`);
  }
  partes.push(loan.noDueDate ? "sin vencimiento" : CICLO[loan.paymentType] ?? `ciclo de ${getLoanCycleDays(loan)} días`);
  const garantia = loan.guarantyType === "vehicle" && loan.vehicle?.model
    ? [loan.vehicle.model, loan.vehicle.plate].filter(Boolean).join(" ")
    : loan.guarantyDetail?.trim();
  if (garantia) partes.push(garantia);
  return partes.join(" · ");
}

/**
 * Los últimos `n` movimientos del préstamo, el más reciente primero: las filas de la
 * planilla (`loanLedger`) sin la del ciclo en curso, que no es algo que haya pasado.
 * Salen de la planilla y no de un recorrido propio para que la card y "Ver planilla" no
 * puedan contar dos historias distintas del mismo préstamo.
 */
export function recentMovements(loan: Loan, n = 2): LedgerRow[] {
  return loanLedger(loan).filter((r) => !r.enCurso).slice(-n).reverse();
}

/** "Pago recibido · 05-nov". */
export const movementLabel = (r: LedgerRow) => `${r.detalle} · ${formatShortDate(r.date)}`;

/**
 * El pago más reciente (por fecha real), o `null` si nunca pagó. La card lo muestra cuando
 * ninguno de los dos últimos movimientos es un pago: en un atrasado lo último que pasó son
 * re-vencimientos, y lo que uno quiere saber de un vistazo es cuándo trajo plata por última vez.
 */
export function lastPayment(loan: Loan): { date: string; amount: number } | null {
  let ultimo: { date: string; amount: number } | null = null;
  for (const p of loan.payments || []) {
    const amount = Number(p.amount || 0);
    if (!p.date || !(amount > 0)) continue;
    if (!ultimo || p.date > ultimo.date) ultimo = { date: p.date, amount };
  }
  return ultimo;
}
