// Dónde cae cada préstamo en el mapa de vencimientos (30 días) de Inicio.
//
// El mapa decidía la fecha con su propia regla —`dueDate` para los activos—, distinta de la
// que usan la card del préstamo, el detalle y el push (`nextCollectionDate`). En un préstamo
// que volvió a "active" con el vencimiento ya pasado (pagó lo suficiente), `dueDate` es una
// fecha vieja: quedaba fuera de la ventana y el préstamo NO aparecía en el mapa aunque su
// próximo cobro caía dentro de los 30 días. Es la misma recaída que ya tuvo el digest.
import { getNextRenewalDate } from "./utils.js";
import { nextCollectionDate } from "./calcs.js";
import type { ResolvedLoan } from "../types";

export interface FechaDeCobro {
  date: string;
  /** Es un re-vencimiento (↻) y no el vencimiento original. */
  renewal: boolean;
}

/**
 * Las fechas en las que un préstamo abierto aparece en la agenda.
 * - activo → su próxima fecha de cobro (`nextCollectionDate`);
 * - atrasado → su próximo re-vencimiento y, si vence HOY (día 0 de atraso: pasa a "vencido"
 *   el mismo día, ver `isOverdue`), también hoy, que sigue siendo su propio dueDate.
 */
export function fechasDeCobro(loan: ResolvedLoan, today: string): FechaDeCobro[] {
  if (loan._status === "active") {
    const date = nextCollectionDate(loan, today);
    return date ? [{ date, renewal: date !== loan.dueDate }] : [];
  }
  if (loan._status === "overdue") {
    const out: FechaDeCobro[] = [];
    if (loan.dueDate === today) out.push({ date: loan.dueDate, renewal: false });
    const next = getNextRenewalDate(loan);
    if (next) out.push({ date: next, renewal: true });
    return out;
  }
  return [];
}
