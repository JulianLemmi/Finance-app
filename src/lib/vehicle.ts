// Normalización de los datos del auto que queda en garantía (`Loan.vehicle`).
//
// Vive acá y no dentro del formulario para poder testearla: la regla del monto tiene una
// contradicción fácil de producir —volver la deuda a "al día" dejando el importe viejo—
// que en pantalla se leería como "Deuda 08 al día: Sí · Debe US$48.500".
import type { LoanVehicle } from "../types";

/**
 * Deja sólo lo que el usuario cargó de verdad.
 *
 * - Los textos van sin espacios sobrantes; la patente, en mayúsculas.
 * - Los sí/no sólo se guardan si fueron tocados: "no" y "no lo miré" son cosas distintas,
 *   y guardar `false` por omisión haría que el detalle afirme "Sin cédula" sobre un auto
 *   que nadie revisó.
 * - El monto de la deuda sólo existe cuando la deuda NO está al día y es mayor a cero.
 *
 * Devuelve `undefined` si no quedó nada: un auto vacío no se guarda como `{}`.
 */
export function limpiarVehiculo(v: LoanVehicle): LoanVehicle | undefined {
  const out: LoanVehicle = {};
  const model = v.model?.trim();
  const version = v.version?.trim();
  const plate = v.plate?.trim().toUpperCase();
  if (model) out.model = model;
  if (version) out.version = version;
  if (plate) out.plate = plate;
  if (typeof v.hasCedula === "boolean") out.hasCedula = v.hasCedula;
  if (typeof v.debt08UpToDate === "boolean") out.debt08UpToDate = v.debt08UpToDate;
  const monto = Number(v.debt08Amount);
  if (v.debt08UpToDate === false && Number.isFinite(monto) && monto > 0) out.debt08Amount = monto;
  return Object.keys(out).length > 0 ? out : undefined;
}
