import type { Loan } from "../types";

export const uid = (prefix = "id"): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Quita los campos computados (prefijo "_") de loans/clients antes de despachar o
// persistir. Ver CLAUDE.md: los _* sólo existen en ResolvedLoan/ResolvedClient y
// nunca deben guardarse. Devuelve la misma referencia si no hay nada que quitar.
export function stripComputed<T extends object>(obj: T): T {
  const src = obj as Record<string, unknown>;
  const keys = Object.keys(src);
  if (!keys.some((k) => k.startsWith("_"))) return obj;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (!k.startsWith("_")) out[k] = src[k];
  return out as T;
}

export const todayDate = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Formatea una fecha como YYYY-MM-DD en hora LOCAL. Nunca usar `toISOString()` para esto:
// convierte a UTC y devuelve otro día según la zona y la hora — en Argentina (UTC-3)
// `new Date().toISOString()` ya es "mañana" a partir de las 21:00, y en zonas UTC+ una
// fecha local a medianoche retrocede al día anterior.
export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = (): string => toISODate(new Date());

export const addDays = (isoDate: string, days: number): string => {
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + Number(days || 0));
  return toISODate(d);
};

export const parseISO = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? null : d;
};

export const daysBetween = (a: string | Date, b: string | Date): number => {
  const da = typeof a === "string" ? parseISO(a) : a;
  const db = typeof b === "string" ? parseISO(b) : b;
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
};

export const monthKey = (iso: string): string => (iso || "").slice(0, 7);

export const formatMoney = (value: number | string, hidden = false, currency = "$"): string => {
  if (hidden) return "••••••";
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${sign}${currency}${formatted}`;
};

// Número compacto para etiquetas de gráficos en mobile (sin símbolo de moneda):
// 4400 → "4,4k", 5000 → "5k", 384 → "384", 1_200_000 → "1,2M".
export const formatCompact = (value: number | string, hidden = false): string => {
  if (hidden) return "••";
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
};

export const formatDate = (iso: string): string => {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export const formatShortDate = (iso: string): string => {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

export type LoanCycleInput = Pick<Loan, "paymentType" | "customDays" | "startDate" | "dueDate">;

export function getLoanCycleDays(loan: LoanCycleInput): number {
  if (loan?.paymentType === "15") return 15;
  if (loan?.paymentType === "30") return 30;
  const custom = Number(loan?.customDays);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const span = daysBetween(loan?.startDate ?? "", loan?.dueDate ?? "");
  return Math.max(1, span || 30);
}

// Agrega `months` meses calendario a una fecha ISO, preservando el día del mes; si el mes
// destino tiene menos días, cae en su último día (ej. 31/01 + 1 mes → 28 o 29/02).
export function addCalendarMonths(iso: string, months: number): string {
  if (!iso || iso.length < 10) return iso || "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const targetMonth = d.getMonth() + Number(months || 0);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), targetMonth + 1, 0).getDate();
  const result = new Date(d.getFullYear(), targetMonth, Math.min(day, lastDayOfTargetMonth));
  return toISODate(result);
}

// Fecha del período N desde `anchor` (dueDate o startDate; N=0 → el propio anchor).
// "30 días" avanza por meses calendario preservando el día del mes — vence siempre el
// mismo día, sin importar si el mes tiene 28, 30 o 31 días. "15 días" y "personalizado"
// avanzan una cantidad fija de días.
export function loanPeriodDate(loan: LoanCycleInput, anchor: string, n: number): string {
  if (loan?.paymentType === "30") return addCalendarMonths(anchor, n);
  return addDays(anchor, n * getLoanCycleDays(loan));
}

// Cantidad de períodos completos transcurridos entre `anchor` y `asOf` (0 si `asOf` no
// pasó el anchor todavía). Usa el mismo criterio "mismo día del mes" que loanPeriodDate.
export function loanElapsedPeriods(loan: LoanCycleInput, anchor: string, asOf: string): number {
  if (!anchor || !asOf || asOf <= anchor) return 0;
  if (loan?.paymentType === "30") {
    let n = 0;
    for (; n < 1200 && loanPeriodDate(loan, anchor, n + 1) <= asOf; n++);
    return n;
  }
  const term = getLoanCycleDays(loan);
  return Math.max(0, Math.floor(daysBetween(anchor, asOf) / term));
}

/** Cantidad de ciclos que el usuario adelantó manualmente (sin llegar el vencimiento).
 *  Cada adelanto corre el próximo vencimiento un ciclo hacia adelante.
 *
 *  Cuenta sólo los adelantos que YA ocurrieron. Un adelanto es un hecho con fecha —"el
 *  cliente vino a pagar el vencimiento antes de tiempo"—, así que uno fechado a futuro
 *  todavía no capitalizó nada. Cuando esto contaba el array entero, la card del header
 *  sumaba el ciclo adelantado y la curva del gráfico no (reconstruye la deuda con
 *  advancedCyclesUpTo): la misma plata salía con dos números distintos en pantalla. */
export function advancedCycles(loan: Pick<Loan, "advancedAt">): number {
  return advancedCyclesUpTo(loan, todayISO());
}

/** Cantidad de adelantos manuales hechos hasta `asOf` (inclusive). Sirve para reconstruir
 *  la deuda a fechas pasadas sin contar adelantos futuros. */
export function advancedCyclesUpTo(loan: Pick<Loan, "advancedAt">, asOf: string): number {
  return (loan.advancedAt || []).filter((d) => d <= asOf).length;
}

export function getNextRenewalDate(loan: LoanCycleInput & Pick<Loan, "advancedAt">): string {
  if (!loan.dueDate) return "";
  const periods = loanElapsedPeriods(loan, loan.dueDate, todayISO()) + advancedCycles(loan);
  return loanPeriodDate(loan, loan.dueDate, periods + 1);
}

export const getMonthLabel = (iso: string): string => {
  const d = parseISO(iso + "-01");
  if (!d) return iso;
  return d.toLocaleDateString("es-AR", { month: "short" });
};

// Etiqueta corta del interés de un préstamo: "8.0%" en modo tasa, "$50k fijo" en modo monto fijo.
export function formatInterest(loan: Pick<Loan, "interestMode" | "interestRate" | "fixedInterest">, currency = "$"): string {
  if (loan.interestMode === "fixed") {
    return `${formatMoney(Number(loan.fixedInterest || 0), false, currency)} fijo`;
  }
  return `${Number(loan.interestRate || 0).toFixed(1)}%`;
}

// Mi parte (fracción 0-1) de un préstamo compartido. Sin campo o 100 → 1 (todo mío).
export function myShare(loan: Pick<Loan, "myPercent">): number {
  const pct = Number(loan.myPercent);
  if (!Number.isFinite(pct) || pct <= 0) return 1;
  return Math.min(1, pct / 100);
}
