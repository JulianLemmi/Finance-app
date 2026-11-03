// Activos y pasivos A UNA FECHA. Antes el gráfico aplicaba el total de HOY a todos los meses,
// así que comprar un reloj hoy, o registrar hoy una cuota del auto, subía también los meses
// pasados. Se reconstruye con las fechas que ya existen:
//   - activo en cuotas: la suma de las cuotas pagadas hasta esa fecha;
//   - activo de valor fijo: cero antes de su fecha de compra (`acquiredAt`), y el valor que
//     tenía en esa fecha según `valueHistory` (revaluarlo hoy no cambia un mes cerrado);
//   - deuda propia: nada antes de su `startDate`, y lo que faltaba pagar en esa fecha.
// Un activo viejo sin fecha de compra ni historial cuenta en todos los meses, como siempre:
// no hay de dónde saber cuándo entró. Al cargarle la fecha se ordena solo.
import type { Asset, AssetValueEntry, ISODate, Liability } from "../types";

const esEnCuotas = (a: Asset) => (a.installments?.length ?? 0) > 0 || !!a.totalCuotas;

/** Valor de un activo al cierre de `asOf` (YYYY-MM-DD). */
export function assetValueAt(a: Asset, asOf: ISODate): number {
  if (esEnCuotas(a)) {
    return (a.installments || []).filter((c) => c.date <= asOf).reduce((s, c) => s + Number(c.amount || 0), 0);
  }
  if (a.acquiredAt && a.acquiredAt > asOf) return 0;
  const hist = [...(a.valueHistory || [])].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  if (!hist.length) return Number(a.value || 0);
  const vigente = hist.filter((h) => h.date <= asOf).pop() ?? hist[0];
  return Number(vigente.value || 0);
}

/** Lo que faltaba pagar de una deuda propia al cierre de `asOf`, sin bajar de cero. */
export function liabilityOwedAt(l: Liability, asOf: ISODate): number {
  if (l.startDate && l.startDate > asOf) return 0;
  const pagado = (l.payments || []).filter((p) => p.date <= asOf).reduce((s, p) => s + Number(p.amount || 0), 0);
  return Math.max(0, Number(l.amount || 0) - pagado);
}

export const sumAssetsAt = (assets: readonly Asset[], asOf: ISODate) =>
  assets.reduce((s, a) => s + assetValueAt(a, asOf), 0);

export const sumLiabilitiesAt = (ls: readonly Liability[], asOf: ISODate) =>
  ls.reduce((s, l) => s + liabilityOwedAt(l, asOf), 0);

/**
 * El historial de valores después de guardar `next` sobre `prev` (o al darlo de alta). Sólo
 * los activos de valor fijo lo llevan: el de uno en cuotas sale de las fechas de sus cuotas.
 * Un cambio de valor se fecha HOY; si hoy ya había un cambio, se reemplaza (corregir un error
 * de tipeo no deja escalones). Un activo viejo sin historial arranca con su valor anterior
 * vigente desde su compra o, sin fecha, "desde siempre" (`""` ordena antes que toda fecha).
 */
export function nextValueHistory(prev: Asset | undefined, next: Asset, hoy: ISODate): AssetValueEntry[] | undefined {
  if (esEnCuotas(next)) return undefined;
  const valor = Number(next.value || 0);
  if (!prev) return [{ date: next.acquiredAt || hoy, value: valor }];
  let hist: AssetValueEntry[] = prev.valueHistory?.length
    ? [...prev.valueHistory]
    : [{ date: prev.acquiredAt || "", value: Number(prev.value || 0) }];
  // Si cambió la fecha de compra, la primera entrada se mueve con ella.
  if (next.acquiredAt !== prev.acquiredAt && hist.length) {
    hist = [{ ...hist[0], date: next.acquiredAt || "" }, ...hist.slice(1)];
  }
  const ultimo = hist[hist.length - 1];
  if (Number(ultimo.value) === valor) return hist;
  // Hoy (o una compra fechada a futuro): se corrige esa entrada en vez de sumar otra.
  if (ultimo.date >= hoy) {
    return [...hist.slice(0, -1), { date: ultimo.date, value: valor }];
  }
  return [...hist, { date: hoy, value: valor }];
}
