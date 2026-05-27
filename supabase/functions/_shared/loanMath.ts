/**
 * loanMath.ts — port de la lógica de cálculo del frontend.
 *
 * MANTENER EN SYNC con src/lib/utils.js (getLoanCycleDays, getNextRenewalDate)
 * y src/lib/calcs.js (remainingDebt con compounding). Si tocás alguna fórmula
 * en el frontend, replicala acá o las notificaciones van a divergir de lo que
 * el usuario ve en pantalla.
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
  startDate?: string;
  dueDate?: string;
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

/** Mirror of src/lib/utils.js getNextRenewalDate. */
export function getNextRenewalDate(loan: Loan, today: string): string | null {
  if (!loan.dueDate) return null;
  const term = getLoanCycleDays(loan);
  const overdueDays = Math.max(0, daysBetween(loan.dueDate, today));
  const periods = overdueDays > 0 ? Math.floor(overdueDays / term) : 0;
  return addDays(loan.dueDate, (periods + 1) * term);
}

export function expectedProfit(loan: Loan): number {
  return (Number(loan.amount ?? 0) * Number(loan.interestRate ?? 0)) / 100;
}

export function expectedReturn(loan: Loan): number {
  return Number(loan.amount ?? 0) + expectedProfit(loan);
}

export function paidAmount(loan: Loan): number {
  return (loan.payments || []).reduce((a, p) => a + Number(p?.amount ?? 0), 0);
}

type OverdueMeta = { daysOverdue: number; termDays: number; overduePeriods: number; rate: number };

function getOverdueMeta(loan: Loan, today: string): OverdueMeta | null {
  if (!loan.dueDate) return null;
  const daysOverdue = daysBetween(loan.dueDate, today);
  if (daysOverdue <= 0) return null;
  const termDays = Math.max(1, getLoanCycleDays(loan));
  const overduePeriods = termDays > 0 ? Math.floor(daysOverdue / termDays) : 0;
  return { daysOverdue, termDays, overduePeriods, rate: Number(loan.interestRate ?? 0) / 100 };
}

function resolvePaymentPos(p: Payment, overduePeriods: number, termDays: number, dueDate: string): number {
  if (typeof p.timelinePos === "number") return p.timelinePos;
  for (let i = 1; i <= overduePeriods; i++) {
    if ((p.date ?? "") < addDays(dueDate, i * termDays)) return i - 1;
  }
  return overduePeriods;
}

/** Mirror of src/lib/calcs.js remainingDebt — includes compounding for overdue periods. */
export function remainingDebt(loan: Loan, today: string): number {
  const payments = loan.payments || [];
  const meta = getOverdueMeta(loan, today);

  if (!meta || meta.overduePeriods === 0) {
    return Math.max(0, expectedReturn(loan) - paidAmount(loan));
  }

  const { overduePeriods, termDays, rate } = meta;
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, termDays, loan.dueDate!);

  let balance = expectedReturn(loan);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount ?? 0));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance *= 1 + rate;
    payments.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount ?? 0));
    });
  }
  return Math.max(0, balance);
}

export function resolveStatus(loan: Loan, today: string): string {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  if (remainingDebt(loan, today) <= PAID_THRESHOLD) return "paid";
  if (loan.dueDate && loan.dueDate < today) return "overdue";
  return "active";
}

/** Today as YYYY-MM-DD in a given tz offset (hours from UTC). Default: Argentina (-3). */
export function todayISOInTz(tzOffsetHours = -3): string {
  const now = new Date();
  const local = new Date(now.getTime() + tzOffsetHours * 3_600_000);
  return local.toISOString().slice(0, 10);
}
