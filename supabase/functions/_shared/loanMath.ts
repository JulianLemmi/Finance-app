/**
 * loanMath.ts — port de la lógica de cálculo del frontend.
 *
 * MANTENER EN SYNC con src/lib/utils.js (getLoanCycleDays, addCalendarMonths,
 * loanPeriodDate, loanElapsedPeriods, getNextRenewalDate) y src/lib/calcs.js
 * (remainingDebt con compounding). Si tocás alguna fórmula en el frontend,
 * replicala acá o las notificaciones van a divergir de lo que el usuario ve
 * en pantalla.
 *
 * (El ideal sería un módulo compartido único, pero Supabase Edge Functions
 * solo bundlea archivos dentro de la carpeta de la function — no podemos
 * importar desde src/ directamente.)
 */

export type Payment = {
  amount?: number;
  date?: string;
  timelinePos?: number;
};

export type Loan = {
  id: string;
  clientName?: string;
  amount?: number;
  interestRate?: number;
  /** "percent" (default) usa interestRate; "fixed" usa fixedInterest. */
  interestMode?: "percent" | "fixed";
  fixedInterest?: number;
  startDate?: string;
  dueDate?: string;
  /** Préstamo sin fecha de vencimiento: capitaliza un ciclo tras otro desde el inicio. */
  noDueDate?: boolean;
  status?: string;
  paymentType?: string;
  customDays?: number;
  payments?: Payment[];
};

const PAID_THRESHOLD = 0.001;

export function daysBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Mirror of src/lib/utils.js getLoanCycleDays. */
export function getLoanCycleDays(loan: Loan): number {
  if (loan.paymentType === "15") return 15;
  if (loan.paymentType === "30") return 30;
  const custom = Number(loan.customDays);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const span = daysBetween(loan.startDate, loan.dueDate);
  return Math.max(1, span || 30);
}

/** Mirror of src/lib/utils.js addCalendarMonths. */
export function addCalendarMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const result = new Date(Date.UTC(y, m, Math.min(day, lastDayOfTargetMonth)));
  return result.toISOString().slice(0, 10);
}

/** Mirror of src/lib/utils.js loanPeriodDate. "30 días" avanza por meses calendario
 *  preservando el día del mes (vence siempre el mismo día); el resto, por días fijos. */
export function loanPeriodDate(loan: Loan, anchor: string, n: number): string {
  if (loan.paymentType === "30") return addCalendarMonths(anchor, n);
  return addDays(anchor, n * getLoanCycleDays(loan));
}

/** Mirror of src/lib/utils.js loanElapsedPeriods. */
export function loanElapsedPeriods(loan: Loan, anchor: string, asOf: string): number {
  if (!anchor || !asOf || asOf <= anchor) return 0;
  if (loan.paymentType === "30") {
    let n = 0;
    for (; n < 1200 && loanPeriodDate(loan, anchor, n + 1) <= asOf; n++);
    return n;
  }
  const term = getLoanCycleDays(loan);
  return Math.max(0, Math.floor(daysBetween(anchor, asOf) / term));
}

/** Mirror of src/lib/utils.js getNextRenewalDate. */
export function getNextRenewalDate(loan: Loan, today: string): string | null {
  if (!loan.dueDate) return null;
  const periods = loanElapsedPeriods(loan, loan.dueDate, today);
  return loanPeriodDate(loan, loan.dueDate, periods + 1);
}

/** Interés que se agrega en un período dado. Fijo: constante (fixedInterest). */
function periodInterest(loan: Loan, balance: number): number {
  if (loan.interestMode === "fixed") return Number(loan.fixedInterest ?? 0);
  return balance * (Number(loan.interestRate ?? 0) / 100);
}

export function expectedProfit(loan: Loan): number {
  if (loan.interestMode === "fixed") return Number(loan.fixedInterest ?? 0);
  return (Number(loan.amount ?? 0) * Number(loan.interestRate ?? 0)) / 100;
}

export function expectedReturn(loan: Loan): number {
  return Number(loan.amount ?? 0) + expectedProfit(loan);
}

export function paidAmount(loan: Loan): number {
  return (loan.payments || []).reduce((a, p) => a + Number(p?.amount ?? 0), 0);
}

type OverdueMeta = { daysOverdue: number; overduePeriods: number; rate: number };

function getOverdueMeta(loan: Loan, today: string): OverdueMeta | null {
  if (!loan.dueDate) return null;
  const daysOverdue = daysBetween(loan.dueDate, today);
  if (daysOverdue <= 0) return null;
  const overduePeriods = loanElapsedPeriods(loan, loan.dueDate, today);
  return { daysOverdue, overduePeriods, rate: Number(loan.interestRate ?? 0) / 100 };
}

function resolvePaymentPos(p: Payment, overduePeriods: number, loan: Loan): number {
  if (typeof p.timelinePos === "number") return p.timelinePos;
  if (!loan.dueDate) return 0;
  for (let i = 1; i <= overduePeriods; i++) {
    if ((p.date ?? "") < loanPeriodDate(loan, loan.dueDate, i)) return i - 1;
  }
  return overduePeriods;
}

/** Mirror of src/lib/calcs.js compoundReturn para préstamos sin vencimiento: capitaliza un
 *  período por cada ciclo transcurrido desde el inicio, más el ciclo en curso. */
function noDueDateBalance(loan: Loan, today: string): number {
  const base = Number(loan.amount ?? 0);
  const periods = loanElapsedPeriods(loan, loan.startDate ?? "", today) + 1;
  if (loan.interestMode === "fixed") return base + Number(loan.fixedInterest ?? 0) * periods;
  return base * Math.pow(1 + Number(loan.interestRate ?? 0) / 100, periods);
}

/** Mirror of src/lib/calcs.js remainingDebt — includes compounding for overdue periods. */
export function remainingDebt(loan: Loan, today: string): number {
  const payments = loan.payments || [];

  // Sin vencimiento no hay dueDate, así que getOverdueMeta devuelve null y la deuda
  // quedaría congelada en un solo período (mismo bug que tenía el frontend).
  if (loan.noDueDate) {
    return Math.max(0, noDueDateBalance(loan, today) - paidAmount(loan));
  }

  const meta = getOverdueMeta(loan, today);

  if (!meta || meta.overduePeriods === 0) {
    return Math.max(0, expectedReturn(loan) - paidAmount(loan));
  }

  const { overduePeriods } = meta;
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, loan);

  let balance = expectedReturn(loan);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount ?? 0));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance += periodInterest(loan, balance);
    payments.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount ?? 0));
    });
  }
  return Math.max(0, balance);
}

/** Mirror of src/lib/calcs.js resolveStatus. Pasa a "overdue" desde el propio día del
 *  vencimiento (no al día siguiente), y un vencido vuelve a "active" si los pagos dejaron
 *  la deuda en ≤ el capital prestado — o sea, si el interés acumulado quedó cubierto.
 *  Sin esa última regla el digest trataba como atrasado a un cliente que paga los
 *  intereses al día y le anunciaba la fecha del re-vencimiento en vez de su vencimiento. */
export function resolveStatus(loan: Loan, today: string): string {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  const remaining = remainingDebt(loan, today);
  if (remaining <= PAID_THRESHOLD) return "paid";
  if (loan.noDueDate || !loan.dueDate || loan.dueDate > today) return "active";
  if (remaining <= Number(loan.amount ?? 0)) return "active";
  return "overdue";
}

/** Today as YYYY-MM-DD in a given tz offset (hours from UTC). Default: Argentina (-3). */
export function todayISOInTz(tzOffsetHours = -3): string {
  const now = new Date();
  const local = new Date(now.getTime() + tzOffsetHours * 3_600_000);
  return local.toISOString().slice(0, 10);
}
