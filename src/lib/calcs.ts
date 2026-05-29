import { PAYMENT_TYPES, CALC, BUSINESS_RULES } from "./constants.js";
import { daysBetween, parseISO, addDays, todayDate, getLoanCycleDays } from "./utils.js";
import type { Loan, LoanStatus, Payment, ResolvedLoan } from "../types";

interface OverdueMeta {
  daysOverdue: number;
  termDays: number;
  overduePeriods: number;
  rate: number;
}

export function expectedProfit(loan: Loan): number {
  return (Number(loan.amount) * Number(loan.interestRate)) / 100;
}

export function expectedReturn(loan: Loan): number {
  return Number(loan.amount) + expectedProfit(loan);
}

function getOverdueMeta(loan: Loan): OverdueMeta | null {
  if (!loan.dueDate) return null;
  const daysOverdue = daysBetween(loan.dueDate, todayDate());
  if (daysOverdue <= 0) return null;
  const termDays = Math.max(1, getLoanCycleDays(loan));
  const overduePeriods = termDays > 0 ? Math.floor(daysOverdue / termDays) : 0;
  return { daysOverdue, termDays, overduePeriods, rate: Number(loan.interestRate) / 100 };
}

export function loanIntegrityErrors(loan: Loan): string[] {
  const errors: string[] = [];
  const amount = Number(loan.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Monto inválido");
  if (!loan.clientName?.trim()) errors.push("Cliente faltante");
  if (!loan.startDate) errors.push("Fecha de inicio faltante");
  if (loan.startDate && loan.dueDate && loan.dueDate < loan.startDate)
    errors.push("Vencimiento anterior al inicio");
  const rate = Number(loan.interestRate);
  if (!Number.isFinite(rate) || rate < 0) errors.push("Tasa inválida");
  return errors;
}

export function resolvePaymentPos(
  p: Payment,
  overduePeriods: number,
  termDays: number,
  dueDate: string
): number {
  if (typeof p.timelinePos === "number") return p.timelinePos;
  for (let i = 1; i <= overduePeriods; i++) {
    if (p.date < addDays(dueDate, i * termDays)) return i - 1;
  }
  return overduePeriods;
}

export function compoundReturn(loan: Loan): number {
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);

  if (loan.noDueDate) {
    const termDays =
      loan.paymentType === "custom"
        ? Number(loan.customDays) || 30
        : Number(PAYMENT_TYPES[loan.paymentType]?.days) || 30;
    const daysElapsed = Math.max(0, daysBetween(loan.startDate, todayDate()));
    const periods = Math.floor(daysElapsed / termDays) + 1;
    return base * Math.pow(1 + rate, periods);
  }

  if (!loan.dueDate) return expectedReturn(loan);
  const meta = getOverdueMeta(loan);
  if (!meta || meta.overduePeriods === 0) return expectedReturn(loan);
  return base * Math.pow(1 + rate, 1 + meta.overduePeriods);
}

export function paidAmount(loan: Loan): number {
  return (loan.payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
}

export function remainingDebt(loan: Loan): number {
  const payments = loan.payments || [];
  const meta = getOverdueMeta(loan);

  if (!meta || meta.overduePeriods === 0) {
    return Math.max(0, expectedReturn(loan) - paidAmount(loan));
  }

  const { overduePeriods, termDays, rate } = meta;
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, termDays, loan.dueDate);

  let balance = expectedReturn(loan);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance *= 1 + rate;
    payments.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });
  }
  return Math.max(0, balance);
}

export function loanProgress(loan: Loan): number {
  const total = expectedReturn(loan);
  if (!total || total <= 0 || !Number.isFinite(total)) return 0;
  const paid = paidAmount(loan);
  if (!Number.isFinite(paid)) return 0;
  return Math.min(1, Math.max(0, paid / total));
}

export function isOverdue(loan: Loan, today = todayDate()): boolean {
  if (loan.status === "paid" || loan.status === "refinanced") return false;
  if (loan.noDueDate) return false;
  const due = parseISO(loan.dueDate);
  if (!due) return false;
  return due.getTime() < today.getTime();
}

export function daysUntilDue(loan: Loan): number | null {
  const due = parseISO(loan.dueDate);
  if (!due) return null;
  return daysBetween(todayDate(), due);
}

export function resolveStatus(loan: Loan): LoanStatus {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  if (remainingDebt(loan) <= CALC.PAID_THRESHOLD) return "paid";
  if (isOverdue(loan)) return "overdue";
  return "active";
}

// ── Validation ────────────────────────────────────────────────────────────────
export interface LoanFormData {
  clientName?: string | null;
  amount?: string | number;
  interestRate?: string | number;
  noDueDate?: boolean;
  paymentType?: string;
  customDays?: string | number;
  startDate?: string;
  dueDate?: string;
}

export type LoanValidationErrors = Partial<Record<keyof LoanFormData, string>>;

export function validateLoan(form: LoanFormData): LoanValidationErrors {
  const errors: LoanValidationErrors = {};
  if (!form.clientName?.trim()) errors.clientName = "El nombre es obligatorio";
  const amount = Number(form.amount);
  if (!form.amount || Number.isNaN(amount) || amount <= 0) errors.amount = "Ingresá un monto mayor a 0";
  const rate = Number(form.interestRate);
  if (form.interestRate === "" || Number.isNaN(rate) || rate < 0)
    errors.interestRate = "La tasa debe ser 0 o mayor";
  else if (rate > BUSINESS_RULES.MAX_INTEREST_RATE)
    errors.interestRate = `La tasa no puede superar ${BUSINESS_RULES.MAX_INTEREST_RATE}%`;
  if (!form.noDueDate) {
    if (form.paymentType === "custom") {
      const d = Number(form.customDays);
      if (!form.customDays || Number.isNaN(d) || d <= 0)
        errors.customDays = "Ingresá una cantidad de días mayor a 0";
    }
    if (form.startDate && form.dueDate && form.dueDate <= form.startDate) {
      errors.dueDate = "El vencimiento debe ser posterior a la fecha de inicio";
    }
  }
  return errors;
}

// ── Compound periods breakdown ────────────────────────────────────────────────
export interface CompoundPeriod {
  period: number;
  date: string;
  total: number;
  added: number;
  isCurrent: boolean;
}

export function compoundPeriods(loan: Loan): CompoundPeriod[] {
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  const periods: CompoundPeriod[] = [];

  if (loan.noDueDate) {
    const termDays =
      loan.paymentType === "custom"
        ? Number(loan.customDays) || 30
        : Number(PAYMENT_TYPES[loan.paymentType]?.days) || 30;
    const daysElapsed = Math.max(0, daysBetween(loan.startDate, todayDate()));
    const numPeriods = Math.floor(daysElapsed / termDays) + 1;
    for (let i = 0; i < numPeriods; i++) {
      const prev = base * Math.pow(1 + rate, i);
      const current = base * Math.pow(1 + rate, i + 1);
      periods.push({
        period: i + 1,
        date: addDays(loan.startDate, (i + 1) * termDays),
        total: current,
        added: current - prev,
        isCurrent: i === numPeriods - 1,
      });
    }
    return periods;
  }

  if (!loan.compoundInterest || !loan.dueDate) return [];
  const meta = getOverdueMeta(loan);
  if (!meta || meta.overduePeriods === 0) return [];

  const { overduePeriods: numOverduePeriods, termDays: loanTermDays } = meta;
  for (let i = 0; i <= numOverduePeriods; i++) {
    const prev = base * Math.pow(1 + rate, i);
    const current = base * Math.pow(1 + rate, i + 1);
    periods.push({
      period: i + 1,
      date: i === 0 ? loan.dueDate : addDays(loan.dueDate, i * loanTermDays),
      total: current,
      added: current - prev,
      isCurrent: i === numOverduePeriods,
    });
  }
  return periods;
}

// ── Projection calculation ────────────────────────────────────────────────────
export interface CyclePoint {
  n: number;
  label: string;
  sublabel: string;
  total: number;
  profit: number;
  pct: number;
}

export interface ProfitSeriesPoint {
  mes: number;
  label: string;
  ganancia: number;
  total: number;
}

export interface CalcProjectionResult {
  rate: number;
  days: number;
  base: number;
  cyclesPerYear: number;
  tea: number;
  doublingYears: number | null;
  gainPerCycle: number;
  cyclePoints: CyclePoint[];
  profitSeries: ProfitSeriesPoint[];
}

export function calcProjection({
  activeLoans = [],
  overdueLoans = [],
  workingCapital = 0,
  avgRate = 0,
}: {
  activeLoans?: ResolvedLoan[];
  overdueLoans?: ResolvedLoan[];
  workingCapital?: number;
  avgRate?: number;
}): CalcProjectionResult {
  const deployedLoans = [...activeLoans, ...overdueLoans];
  const deployedCapital = deployedLoans.reduce((a, l) => a + Number(l.amount), 0);
  const base = Math.max(0, deployedCapital || workingCapital);

  const weightedRate =
    deployedCapital > 0
      ? deployedLoans.reduce((a, l) => a + Number(l.amount) * Number(l.interestRate), 0) /
        deployedCapital /
        100
      : avgRate / 100;

  const rate = weightedRate;
  const days = 30;
  const cyclesPerYear = 365 / days;
  const tea = Math.pow(1 + rate, cyclesPerYear) - 1;
  const doublingYears = rate > 0 ? (Math.log(2) / Math.log(1 + rate)) * (days / 365) : null;
  const gainPerCycle = base * rate;

  const cyclePoints: CyclePoint[] = [
    1,
    Math.max(1, Math.round(cyclesPerYear)),
    Math.max(2, Math.round(cyclesPerYear * 2)),
    Math.max(3, Math.round(cyclesPerYear * 3)),
  ].map((n) => {
    const total = base * Math.pow(1 + rate, n);
    const approxYears = (n * days) / 365;
    return {
      n,
      label: n === 1 ? "1 ciclo" : `${n} ciclos`,
      sublabel:
        n === 1
          ? `~${Math.round(days)} días`
          : approxYears < 1.5
          ? `~${Math.round(approxYears * 12)} meses`
          : `~${approxYears.toFixed(1)} años`,
      total,
      profit: total - base,
      pct: (Math.pow(1 + rate, n) - 1) * 100,
    };
  });

  const profitSeries: ProfitSeriesPoint[] = Array.from({ length: 25 }, (_, i) => {
    const cycles = (i * 30) / days;
    const total = base * Math.pow(1 + rate, cycles);
    return {
      mes: i,
      label: i % 6 === 0 ? (i === 0 ? "Hoy" : `${i}m`) : "",
      ganancia: Math.round(total - base),
      total: Math.round(total),
    };
  });

  return { rate, days, base, cyclesPerYear, tea, doublingYears, gainPerCycle, cyclePoints, profitSeries };
}
