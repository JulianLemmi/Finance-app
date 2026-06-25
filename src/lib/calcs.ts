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

// Versión "a una fecha" de remainingDebt: calcula la deuda (capital + interés
// capitalizado por vencimientos/re-vencimientos) tal como estaba al cierre de `asOf`,
// contando sólo los pagos hechos hasta esa fecha. Con asOf = hoy coincide con remainingDebt.
export function remainingDebtAt(loan: Loan, asOf: string): number {
  if (loan.startDate && loan.startDate > asOf) return 0;

  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  const paymentsUpTo = (loan.payments || []).filter((p) => (p.date || "") <= asOf);
  const paidUpTo = paymentsUpTo.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Sin vencimiento: compone un período por cada ciclo transcurrido desde el inicio.
  if (loan.noDueDate) {
    const termDays = Math.max(1, getLoanCycleDays(loan));
    const daysElapsed = Math.max(0, daysBetween(loan.startDate, asOf));
    const periods = Math.floor(daysElapsed / termDays) + 1;
    return Math.max(0, base * Math.pow(1 + rate, periods) - paidUpTo);
  }

  if (!loan.dueDate) return Math.max(0, expectedReturn(loan) - paidUpTo);

  const daysOverdue = daysBetween(loan.dueDate, asOf);
  const termDays = Math.max(1, getLoanCycleDays(loan));
  const overduePeriods = daysOverdue > 0 ? Math.floor(daysOverdue / termDays) : 0;

  if (overduePeriods === 0) return Math.max(0, expectedReturn(loan) - paidUpTo);

  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, termDays, loan.dueDate);
  let balance = expectedReturn(loan);
  paymentsUpTo.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance *= 1 + rate;
    paymentsUpTo.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });
  }
  return Math.max(0, balance);
}

// Capital desplegado en un préstamo al cierre de `asOf`, con la misma clasificación
// que `capitalInvested` (financials): los vencidos aportan toda su deuda capitalizada,
// los activos el principal acotado a lo que aún se debe. Refinanciados, ya cobrados y
// los que todavía no arrancaron no aportan. Con asOf = hoy, la suma == capitalInvested.
export function loanCapitalAt(loan: Loan, asOf: string): number {
  if (loan.status === "refinanced") return 0;
  if (loan.startDate && loan.startDate > asOf) return 0;
  const remaining = remainingDebtAt(loan, asOf);
  if (remaining <= CALC.PAID_THRESHOLD) return 0;
  const overdueAt = !loan.noDueDate && !!loan.dueDate && loan.dueDate < asOf;
  return overdueAt ? remaining : Math.min(remaining, Number(loan.amount));
}

// Eventos de interés devengado de un préstamo: cada vez que cae un vencimiento se le
// "cobra" interés al cliente (se suma a su deuda), lo pague o no. El primer vencimiento
// devenga el interés contratado (capital × tasa) en la fecha de vencimiento; cada
// re-vencimiento devenga tasa sobre la deuda compuesta. Se cuenta hasta hoy, o hasta que
// el préstamo se cerró (último pago) si está pagado/refinanciado, para no inventar
// intereses posteriores al cierre.
export function interestAccruals(loan: Loan): { date: string; amount: number }[] {
  const events: { date: string; amount: number }[] = [];
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  if (!(base > 0) || !(rate > 0)) return events;

  const today = todayDate().toISOString().slice(0, 10);
  const lastPayment = (loan.payments || []).reduce((max, p) => ((p.date || "") > max ? p.date! : max), "");
  const closed = loan.status === "paid" || loan.status === "refinanced";
  const horizon = closed ? (lastPayment || loan.dueDate || today) : today;
  const term = Math.max(1, getLoanCycleDays(loan));

  if (loan.noDueDate) {
    if (!loan.startDate) return events;
    let balance = base;
    for (let i = 1; ; i++) {
      const date = addDays(loan.startDate, i * term);
      if (date > horizon) break;
      const interest = balance * rate;
      events.push({ date, amount: interest });
      balance += interest;
    }
    return events;
  }

  if (!loan.dueDate || loan.dueDate > horizon) return events;
  // Vencimiento original: interés contratado.
  events.push({ date: loan.dueDate, amount: base * rate });
  let balance = base * (1 + rate);
  for (let i = 1; ; i++) {
    const date = addDays(loan.dueDate, i * term);
    if (date > horizon) break;
    const interest = balance * rate;
    events.push({ date, amount: interest });
    balance += interest;
  }
  return events;
}

// Interés que se va a cobrar (capitalizar a la deuda) entre hoy y `until`, por los
// vencimientos / re-vencimientos que caen en esa ventana. Proyecta hacia adelante: es el
// crecimiento futuro del capital. Compone si entran varios ciclos. Ignora pagos futuros.
export function upcomingInterest(loan: Loan, until: string): number {
  if (loan.status === "paid" || loan.status === "refinanced") return 0;
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  if (!(base > 0) || !(rate > 0)) return 0;
  const today = todayDate().toISOString().slice(0, 10);
  if (until <= today) return 0;
  const term = Math.max(1, getLoanCycleDays(loan));

  let nextDate: string;
  let balance: number;
  if (loan.noDueDate) {
    if (!loan.startDate) return 0;
    const periodsDone = Math.floor(Math.max(0, daysBetween(loan.startDate, today)) / term);
    nextDate = addDays(loan.startDate, (periodsDone + 1) * term);
    balance = remainingDebtAt(loan, today);
  } else {
    if (!loan.dueDate) return 0;
    if (loan.dueDate > today) {
      // Todavía no venció: el próximo vencimiento es el original (interés contratado).
      nextDate = loan.dueDate;
      balance = base;
    } else {
      const overduePeriods = Math.floor(Math.max(0, daysBetween(loan.dueDate, today)) / term);
      nextDate = addDays(loan.dueDate, (overduePeriods + 1) * term);
      balance = remainingDebtAt(loan, today);
    }
  }

  let total = 0;
  for (let guard = 0; nextDate <= until && guard < 64; guard++) {
    const interest = balance * rate;
    total += interest;
    balance += interest;
    nextDate = addDays(nextDate, term);
  }
  return total;
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

// Balance after periods 0..overduePeriods-1 (excludes current period's compounding).
// Used to detect if the client was current entering the latest period.
function balanceThroughPrevPeriod(loan: Loan, meta: OverdueMeta): number {
  const { overduePeriods, termDays, rate } = meta;
  const payments = loan.payments || [];
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, termDays, loan.dueDate);

  let balance = expectedReturn(loan);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });
  for (let i = 1; i <= overduePeriods - 1; i++) {
    if (balance > 0) balance *= 1 + rate;
    payments.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });
  }
  return Math.max(0, balance);
}

export function resolveStatus(loan: Loan): LoanStatus {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  const remaining = remainingDebt(loan);
  if (remaining <= CALC.PAID_THRESHOLD) return "paid";
  if (!isOverdue(loan)) return "active";
  const amount = Number(loan.amount);
  // All accrued interest paid — definitely current.
  if (remaining <= amount) return "active";
  // There's outstanding interest. But if the client was fully current at the end
  // of the previous period, the excess is only the new period's interest — still active.
  const meta = getOverdueMeta(loan);
  if (meta && meta.overduePeriods >= 1 && balanceThroughPrevPeriod(loan, meta) <= amount)
    return "active";
  return "overdue";
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
  accumulatedProfit = 0,
}: {
  activeLoans?: ResolvedLoan[];
  overdueLoans?: ResolvedLoan[];
  workingCapital?: number;
  avgRate?: number;
  /** Interés ya acumulado por vencimientos a la fecha. La ganancia acumulada proyectada
   *  arranca desde acá (mes 0) en vez de cero, para reflejar lo ya devengado. */
  accumulatedProfit?: number;
}): CalcProjectionResult {
  const deployedLoans = [...activeLoans, ...overdueLoans];
  const deployedBase = deployedLoans.reduce((a, l) => a + (l._remaining ?? Number(l.amount)), 0);
  const base = Math.max(0, deployedBase || workingCapital);

  // Tasa promedio simple de TODOS los préstamos desplegados (activos + atrasados),
  // no ponderada por capital. Es la que se muestra en el label "X% × N ciclos".
  const rate =
    deployedLoans.length > 0
      ? deployedLoans.reduce((a, l) => a + Number(l.interestRate), 0) / deployedLoans.length / 100
      : avgRate / 100;
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
      // Ganancia acumulada = lo ya devengado por vencimientos + la proyección hacia adelante.
      // El capital proyectado (total) ya incorpora el interés capitalizado vía la base,
      // así que no se le vuelve a sumar accumulatedProfit.
      ganancia: Math.round(accumulatedProfit + total - base),
      total: Math.round(total),
    };
  });

  return { rate, days, base, cyclesPerYear, tea, doublingYears, gainPerCycle, cyclePoints, profitSeries };
}
