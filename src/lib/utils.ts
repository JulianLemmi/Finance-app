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

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const addDays = (isoDate: string, days: number): string => {
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
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

type LoanCycleInput = Pick<Loan, "paymentType" | "customDays" | "startDate" | "dueDate">;

export function getLoanCycleDays(loan: LoanCycleInput): number {
  if (loan?.paymentType === "15") return 15;
  if (loan?.paymentType === "30") return 30;
  const custom = Number(loan?.customDays);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const span = daysBetween(loan?.startDate ?? "", loan?.dueDate ?? "");
  return Math.max(1, span || 30);
}

export function getNextRenewalDate(loan: LoanCycleInput): string {
  const term = getLoanCycleDays(loan);
  const overdueDays = Math.max(0, daysBetween(loan.dueDate ?? "", todayISO()));
  const periods = overdueDays > 0 ? Math.floor(overdueDays / term) : 0;
  return addDays(loan.dueDate ?? "", (periods + 1) * term);
}

export const getMonthLabel = (iso: string): string => {
  const d = parseISO(iso + "-01");
  if (!d) return iso;
  return d.toLocaleDateString("es-AR", { month: "short" });
};
