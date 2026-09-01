/**
 * digest.ts — armado del resumen de vencimientos que sale por push.
 *
 * Vive separado de daily-digest/index.ts (que importa Deno y no se puede cargar desde los
 * tests) para que la lógica se pueda verificar: la fecha que se anuncia acá es la que ve
 * el usuario en la notificación, y tiene que ser la misma que muestra la app.
 */
import {
  Loan, getNextRenewalDate, resolveStatus, loanElapsedPeriods, daysBetween, addDays,
} from "./loanMath.ts";

export type DigestItem = { name: string; date: string; days: number; renewal: boolean };

export function fmtDate(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

/**
 * Fecha en la que se espera cobrar un préstamo abierto:
 * - activo → su propio vencimiento;
 * - vence hoy → hoy (todavía es el día de cobro, no se saltea al mes siguiente);
 * - atrasado → su próximo re-vencimiento.
 * Devuelve null si el préstamo no aplica (cerrado o sin fecha).
 */
export function nextCollectionDate(loan: Loan, today: string): { date: string; renewal: boolean } | null {
  // Archivar es sacar el préstamo de la vista: tampoco tiene que avisar por push.
  if (loan.archived) return null;
  const status = resolveStatus(loan, today);
  if (status !== "active" && status !== "overdue") return null;
  if (!loan.dueDate) return null; // los préstamos sin vencimiento no entran al digest
  if (status === "active" || loan.dueDate === today) {
    return { date: loan.dueDate, renewal: false };
  }
  const next = getNextRenewalDate(loan, today);
  if (!next) return null;
  // `renewal` marca con ↻ los que ya pasaron por al menos un ciclo de mora.
  return { date: next, renewal: loanElapsedPeriods(loan, loan.dueDate, today) > 0 };
}

/**
 * Lista los vencimientos dentro de [hoy, hoy+windowDays], ordenados por fecha. El estado
 * se recalcula: no se confía en el `status` guardado, que puede haber quedado viejo.
 * Devuelve null si no hay nada para avisar.
 */
export function buildDigest(loans: Loan[], today: string, windowDays = 7) {
  const horizon = addDays(today, windowDays);
  const items: DigestItem[] = [];

  for (const l of loans) {
    const next = nextCollectionDate(l, today);
    if (!next) continue;
    if (next.date < today || next.date > horizon) continue;
    items.push({
      name: l.clientName ?? "Sin nombre",
      date: next.date,
      days: daysBetween(today, next.date),
      renewal: next.renewal,
    });
  }

  if (items.length === 0) return null;
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const lineOf = (i: DigestItem) => {
    const when = i.days === 0 ? "hoy" : i.days === 1 ? "mañana" : fmtDate(i.date);
    return `• ${i.name} — ${when}${i.renewal ? " ↻" : ""}`;
  };
  const top = items.slice(0, 10).map(lineOf);
  const more = items.length > 10 ? `\n+${items.length - 10} más` : "";
  const title = items.length === 1 ? "1 vencimiento próximo" : `${items.length} vencimientos próximos`;
  return { title, body: `${top.join("\n")}${more}`, count: items.length, items };
}
