// Lo que quedó tipeado en una fila de "agregar" —un pago de una deuda, una cuota de un
// activo, un costo de preparación de un auto— cuando se toca Guardar sin haber tocado el
// botón de la fila. Antes se tiraba en silencio: el sheet se cerraba, el pago no existía y
// el saldo de la deuda quedaba más alto que el real (en un activo en cuotas, además, el
// valor quedaba corto, porque es la suma de las cuotas).
//
// La regla que comparten los tres sheets: una fila COMPLETA se registra al guardar —es lo
// que la persona quiso al tipearla— y una a medio cargar no deja guardar hasta que se
// complete o se borre, con un mensaje que dice qué falta.

export type Pendiente<T> =
  | { estado: "vacio" }
  | { estado: "listo"; entrada: T }
  | { estado: "incompleto"; motivo: string };

/** Un pago o una cuota: monto + fecha (la fecha viene precargada con hoy). */
export function pagoPendiente(monto: string, fecha: string): Pendiente<{ amount: number; date: string }> {
  if (monto.trim() === "") return { estado: "vacio" };
  const amount = Number(monto);
  if (!Number.isFinite(amount) || amount <= 0) return { estado: "incompleto", motivo: "El monto tiene que ser mayor a 0" };
  if (!fecha) return { estado: "incompleto", motivo: "Falta la fecha" };
  return { estado: "listo", entrada: { amount, date: fecha } };
}

/** Un costo de preparación: descripción + monto. */
export function costoPendiente(descripcion: string, monto: string): Pendiente<{ description: string; amount: number }> {
  const description = descripcion.trim();
  const hayMonto = monto.trim() !== "";
  if (!description && !hayMonto) return { estado: "vacio" };
  if (!description) return { estado: "incompleto", motivo: "Falta la descripción del costo" };
  if (!hayMonto) return { estado: "incompleto", motivo: "Falta el monto del costo" };
  const amount = Number(monto);
  if (!Number.isFinite(amount) || amount <= 0) return { estado: "incompleto", motivo: "El monto tiene que ser mayor a 0" };
  return { estado: "listo", entrada: { description, amount } };
}
