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

// Próxima ganancia del préstamo:
// - Activo (todavía no vence): la ganancia contratada que se cobra al vencimiento (capital × tasa).
// - Vencido: el contratado ya está devengado; lo que sigue es la capitalización del próximo
//   período sobre la deuda actual (deuda × tasa), igual que remainingDebt (balance *= 1 + rate).
// - Pagado / refinanciado: no hay próxima ganancia.
export function nextPeriodInterest(loan: Loan): number {
  const status = resolveStatus(loan);
  const rate = Number(loan.interestRate) / 100;
  if (status === "overdue") return remainingDebt(loan) * rate;
  if (status === "active") return expectedProfit(loan);
  return 0;
}

export function loanProgress(loan: Loan): number {
  // Progreso real de cobro: pagado / (pagado + deuda viva). A diferencia de
  // pagado / retorno de un período, no marca 100% mientras quede deuda
  // capitalizada por períodos vencidos.
  const paid = paidAmount(loan);
  if (!Number.isFinite(paid) || paid <= 0) return 0;
  const remaining = remainingDebt(loan);
  const total = paid + Math.max(0, remaining);
  if (!total || !Number.isFinite(total)) return 0;
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

  // La deuda siempre capitaliza al vencer (igual que remainingDebt/compoundReturn),
  // así el timeline muestra exactamente lo que se cobra. El flag legacy
  // `compoundInterest` ya no se consulta.
  if (!loan.dueDate) return [];
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
  gananciaCons: number;
  total: number;
}

export interface CalcProjectionResult {
  rate: number;
  consFactor: number;
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
  termDays = 30,
  collectability = null,
}: {
  activeLoans?: ResolvedLoan[];
  overdueLoans?: ResolvedLoan[];
  workingCapital?: number;
  avgRate?: number;
  /** Plazo típico de la cartera en días (mediana). Define el largo del ciclo. */
  termDays?: number;
  /** Tasa de cobro en término (0..1) para el escenario conservador; null = sin historial. */
  collectability?: number | null;
}): CalcProjectionResult {
  const deployedLoans = [...activeLoans, ...overdueLoans];
  const deployedBase = deployedLoans.reduce((a, l) => a + (l._remaining ?? Number(l.amount)), 0);
  const base = Math.max(0, deployedBase || workingCapital);

  // Tasa ponderada por capital desplegado: un préstamo grande pesa según su monto,
  // no igual que uno chico. Es la que se muestra en el label "X% × N ciclos".
  const rate =
    deployedBase > 0
      ? deployedLoans.reduce(
          (a, l) => a + Number(l.interestRate) * (l._remaining ?? Number(l.amount)),
          0
        ) / deployedBase / 100
      : avgRate / 100;
  // Ciclo según el plazo real (mediana) de la cartera, no 30 días fijos.
  const days = Math.min(365, Math.max(1, Number(termDays) || 30));
  const cyclesPerYear = 365 / days;
  const tea = Math.pow(1 + rate, cyclesPerYear) - 1;
  const doublingYears = rate > 0 ? (Math.log(2) / Math.log(1 + rate)) * (days / 365) : null;
  const gainPerCycle = base * rate;
  // Escenario conservador: la tasa efectiva se reduce por la cobrabilidad histórica
  // (préstamos cobrados en término). Sin historial se asume 90%.
  const consFactor = collectability != null ? Math.min(1, Math.max(0, collectability)) : 0.9;
  const rateCons = rate * consFactor;

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
    const totalCons = base * Math.pow(1 + rateCons, cycles);
    return {
      mes: i,
      label: i % 6 === 0 ? (i === 0 ? "Hoy" : `${i}m`) : "",
      ganancia: Math.round(total - base),
      gananciaCons: Math.round(totalCons - base),
      total: Math.round(total),
    };
  });

  return { rate, consFactor, days, base, cyclesPerYear, tea, doublingYears, gainPerCycle, cyclePoints, profitSeries };
}
