import { CALC, BUSINESS_RULES } from "./constants.js";
import { daysBetween, parseISO, todayDate, todayISO, loanPeriodDate, loanElapsedPeriods, myShare, advancedCycles, advancedCyclesUpTo } from "./utils.js";
import type { Loan, LoanStatus, Payment, ResolvedLoan } from "../types";

interface OverdueMeta {
  daysOverdue: number;
  overduePeriods: number;
  rate: number;
}

/** Interés a devengar en un período dado. En modo "fixed" es un monto constante que no
 *  depende del balance. En modo "percent" (default) es `balance × tasa`. */
export function periodInterest(loan: Loan, balance: number): number {
  if (loan.interestMode === "fixed") return Number(loan.fixedInterest || 0);
  return balance * (Number(loan.interestRate) / 100);
}

export function expectedProfit(loan: Loan): number {
  if (loan.interestMode === "fixed") return Number(loan.fixedInterest || 0);
  return (Number(loan.amount) * Number(loan.interestRate)) / 100;
}

export function expectedReturn(loan: Loan): number {
  return Number(loan.amount) + expectedProfit(loan);
}

function getOverdueMeta(loan: Loan): OverdueMeta | null {
  if (!loan.dueDate) return null;
  const advCycles = advancedCycles(loan);
  const daysOverdue = daysBetween(loan.dueDate, todayDate());
  const today = todayISO();
  const naturalPeriods = daysOverdue > 0 ? loanElapsedPeriods(loan, loan.dueDate, today) : 0;
  const overduePeriods = naturalPeriods + advCycles;
  if (overduePeriods === 0) return null;
  return { daysOverdue: Math.max(0, daysOverdue), overduePeriods, rate: Number(loan.interestRate) / 100 };
}

export function loanIntegrityErrors(loan: Loan): string[] {
  const errors: string[] = [];
  const amount = Number(loan.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Monto inválido");
  if (!loan.clientName?.trim()) errors.push("Cliente faltante");
  if (!loan.startDate) errors.push("Fecha de inicio faltante");
  if (loan.startDate && loan.dueDate && loan.dueDate < loan.startDate)
    errors.push("Vencimiento anterior al inicio");
  if (loan.interestMode === "fixed") {
    const fx = Number(loan.fixedInterest);
    if (!Number.isFinite(fx) || fx < 0) errors.push("Interés fijo inválido");
  } else {
    const rate = Number(loan.interestRate);
    if (!Number.isFinite(rate) || rate < 0) errors.push("Tasa inválida");
  }
  return errors;
}

export function resolvePaymentPos(
  p: Payment,
  overduePeriods: number,
  loan: Loan
): number {
  if (typeof p.timelinePos === "number") return p.timelinePos;
  if (!loan.dueDate) return 0;
  for (let i = 1; i <= overduePeriods; i++) {
    if (p.date < loanPeriodDate(loan, loan.dueDate, i)) return i - 1;
  }
  return overduePeriods;
}

export function compoundReturn(loan: Loan): number {
  const base = Number(loan.amount);

  if (loan.noDueDate) {
    const today = todayISO();
    const periods = loanElapsedPeriods(loan, loan.startDate, today) + 1 + advancedCycles(loan);
    if (loan.interestMode === "fixed") {
      return base + Number(loan.fixedInterest || 0) * periods;
    }
    const rate = Number(loan.interestRate) / 100;
    return base * Math.pow(1 + rate, periods);
  }

  if (!loan.dueDate) return expectedReturn(loan);
  const meta = getOverdueMeta(loan);
  if (!meta || meta.overduePeriods === 0) return expectedReturn(loan);
  if (loan.interestMode === "fixed") {
    return base + Number(loan.fixedInterest || 0) * (1 + meta.overduePeriods);
  }
  return base * Math.pow(1 + meta.rate, 1 + meta.overduePeriods);
}

export function paidAmount(loan: Loan): number {
  return (loan.payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
}

export function remainingDebt(loan: Loan): number {
  const payments = loan.payments || [];

  // Sin vencimiento: la deuda capitaliza un período por cada ciclo transcurrido desde el
  // inicio. Sin esta rama, `getOverdueMeta` devuelve null (no hay dueDate) y la deuda
  // quedaría congelada en un solo período, contradiciendo a `compoundReturn`,
  // `remainingDebtAt` y la curva de capital de los gráficos.
  if (loan.noDueDate) {
    return Math.max(0, compoundReturn(loan) - paidAmount(loan));
  }

  const meta = getOverdueMeta(loan);

  if (!meta || meta.overduePeriods === 0) {
    return Math.max(0, expectedReturn(loan) - paidAmount(loan));
  }

  const { overduePeriods } = meta;
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, loan);

  let balance = expectedReturn(loan);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance += periodInterest(loan, balance);
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

  const base = Number(loan.amount);
  const paymentsUpTo = (loan.payments || []).filter((p) => (p.date || "") <= asOf);
  const paidUpTo = paymentsUpTo.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Sin vencimiento: compone un período por cada ciclo transcurrido desde el inicio.
  if (loan.noDueDate) {
    const periods = loanElapsedPeriods(loan, loan.startDate, asOf) + 1 + advancedCyclesUpTo(loan, asOf);
    if (loan.interestMode === "fixed") {
      return Math.max(0, base + Number(loan.fixedInterest || 0) * periods - paidUpTo);
    }
    const rate = Number(loan.interestRate) / 100;
    return Math.max(0, base * Math.pow(1 + rate, periods) - paidUpTo);
  }

  if (!loan.dueDate) return Math.max(0, expectedReturn(loan) - paidUpTo);

  const naturalPeriods = loanElapsedPeriods(loan, loan.dueDate, asOf);
  const overduePeriods = naturalPeriods + advancedCyclesUpTo(loan, asOf);

  if (overduePeriods === 0) return Math.max(0, expectedReturn(loan) - paidUpTo);

  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, loan);
  let balance = expectedReturn(loan);
  paymentsUpTo.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance += periodInterest(loan, balance);
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
  // A hoy la clasificación tiene que ser EXACTAMENTE la del header (`resolveStatus`), o la
  // curva del gráfico no cierra con la card de capital invertido: un préstamo marcado como
  // pagado queda fuera del header, pero su deuda recalculada podía volver a crecer con los
  // re-vencimientos y colarse en la curva. Para fechas pasadas alcanza con la deuda y el
  // vencimiento de ese momento (un préstamo cobrado ayer sí desplegaba capital antes).
  const status = asOf >= todayISO() ? resolveStatus(loan) : null;
  if (status === "paid" || status === "refinanced") return 0;
  const remaining = remainingDebtAt(loan, asOf);
  if (remaining <= CALC.PAID_THRESHOLD) return 0;
  const overdueAt = status
    ? status === "overdue"
    : !loan.noDueDate && !!loan.dueDate && loan.dueDate < asOf;
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
  const base = Number(loan.amount);
  const contracted = expectedProfit(loan);
  if (!(base > 0) || !(contracted > 0)) return events;

  const today = todayISO();
  const lastPayment = (loan.payments || []).reduce((max, p) => ((p.date || "") > max ? p.date! : max), "");
  const closed = loan.status === "paid" || loan.status === "refinanced";
  const horizon = closed ? (lastPayment || loan.dueDate || today) : today;

  // Adelantos manuales dentro del horizonte: cada uno devenga otro interés capitalizado
  // en su fecha, además del devengado natural del ciclo.
  const advances = (loan.advancedAt || []).filter((d) => d <= horizon).sort();

  if (loan.noDueDate) {
    if (!loan.startDate) return events;
    let balance = base;
    for (let i = 1; ; i++) {
      const date = loanPeriodDate(loan, loan.startDate, i);
      if (date > horizon) break;
      const interest = periodInterest(loan, balance);
      events.push({ date, amount: interest });
      balance += interest;
    }
    for (const date of advances) {
      const interest = periodInterest(loan, balance);
      events.push({ date, amount: interest });
      balance += interest;
    }
    return events;
  }

  if (!loan.dueDate) return events;
  if (loan.dueDate > horizon) {
    // Cerrado antes de su vencimiento: el interés contratado se cobró igual (el cliente
    // paga capital + interés aunque cancele antes), así que se devenga en la fecha de
    // cierre. Sin esto la ganancia de un préstamo pagado anticipadamente desaparecía del
    // ROI histórico y de "Ganancia acumulada proyectada".
    if (closed && lastPayment) events.push({ date: lastPayment, amount: contracted });
    return events;
  }
  // Vencimiento original: interés contratado.
  events.push({ date: loan.dueDate, amount: contracted });
  let balance = base + contracted;
  for (let i = 1; ; i++) {
    const date = loanPeriodDate(loan, loan.dueDate, i);
    if (date > horizon) break;
    const interest = periodInterest(loan, balance);
    events.push({ date, amount: interest });
    balance += interest;
  }
  for (const date of advances) {
    const interest = periodInterest(loan, balance);
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
  const base = Number(loan.amount);
  const contracted = expectedProfit(loan);
  if (!(base > 0) || !(contracted > 0)) return 0;
  const today = todayISO();
  if (until <= today) return 0;

  const advCycles = advancedCycles(loan);
  let anchor: string;
  let periodIndex: number; // próximo evento a devengar: anchor + (periodIndex+1) períodos
  let balance: number;
  if (loan.noDueDate) {
    if (!loan.startDate) return 0;
    anchor = loan.startDate;
    periodIndex = loanElapsedPeriods(loan, anchor, today) + advCycles;
    balance = remainingDebtAt(loan, today);
  } else {
    if (!loan.dueDate) return 0;
    anchor = loan.dueDate;
    if (loan.dueDate > today) {
      // Todavía no venció. Sin adelantos el próximo evento es el original (periodIndex=-1
      // → loanPeriodDate(anchor, 0) === anchor). Con N adelantos, esos N vencimientos ya
      // se "consumieron", así que el próximo cae N ciclos después.
      periodIndex = -1 + advCycles;
      balance = advCycles > 0 ? remainingDebtAt(loan, today) : base;
    } else {
      periodIndex = loanElapsedPeriods(loan, anchor, today) + advCycles;
      balance = remainingDebtAt(loan, today);
    }
  }

  let nextDate = loanPeriodDate(loan, anchor, periodIndex + 1);
  let total = 0;
  for (let guard = 0; nextDate <= until && guard < 64; guard++) {
    const interest = periodInterest(loan, balance);
    total += interest;
    balance += interest;
    periodIndex++;
    nextDate = loanPeriodDate(loan, anchor, periodIndex + 1);
  }
  return total;
}

// Próxima ganancia del préstamo:
// - Activo: los pagos hechos hasta hoy primero cubren el interés contratado del período
//   (capital × tasa) y el excedente amortiza capital. El próximo interés se calcula sobre
//   el capital pendiente. Ej: $100k @ 10%, cliente pagó $30k → interés cubierto ($10k) +
//   $20k al capital → capital pendiente $80k → próximo interés $8k. Sin pagos, coincide
//   con el contratado (amount × rate).
// - Vencido: el contratado ya está devengado; lo que sigue es la capitalización del próximo
//   período sobre la deuda actual (deuda × tasa), igual que remainingDebt (balance *= 1 + rate).
// - Pagado / refinanciado: no hay próxima ganancia.
export function nextPeriodInterest(loan: Loan): number {
  const status = resolveStatus(loan);
  if (status === "paid" || status === "refinanced") return 0;
  // Sin vencimiento: la deuda capitaliza cada ciclo, así que el próximo interés se cobra
  // sobre la deuda actual (igual que un vencido), no sobre el capital original.
  if (loan.noDueDate) return periodInterest(loan, remainingDebt(loan));
  if (status === "overdue") return periodInterest(loan, remainingDebt(loan));
  // Adelantos manuales: aunque la fecha del vencimiento aún no llegó, la deuda ya se
  // capitalizó por los ciclos adelantados. El próximo interés se cobra sobre esa deuda.
  if (advancedCycles(loan) > 0) return periodInterest(loan, remainingDebt(loan));
  const amount = Number(loan.amount);
  const contractedInterest = expectedProfit(loan);
  const paid = paidAmount(loan);
  const capitalPaidDown = Math.max(0, paid - contractedInterest);
  const capitalPending = Math.max(0, amount - capitalPaidDown);
  // Fijo: mientras haya capital pendiente cobrás el fijo entero; si ya está todo pagado, 0.
  if (loan.interestMode === "fixed") return capitalPending > 0 ? Number(loan.fixedInterest || 0) : 0;
  const rate = Number(loan.interestRate) / 100;
  return capitalPending * rate;
}

export function loanProgress(loan: Loan): number {
  const total = expectedReturn(loan);
  if (!total || total <= 0 || !Number.isFinite(total)) return 0;
  const paid = paidAmount(loan);
  if (!Number.isFinite(paid)) return 0;
  return Math.min(1, Math.max(0, paid / total));
}

// El interés del vencimiento se considera devengado desde el arranque del día en que
// vence (no recién al día siguiente): un préstamo que vence hoy y sigue impago ya cuenta
// como atrasado hoy mismo, no mañana.
export function isOverdue(loan: Loan, today = todayDate()): boolean {
  if (loan.status === "paid" || loan.status === "refinanced") return false;
  if (loan.noDueDate) return false;
  const due = parseISO(loan.dueDate);
  if (!due) return false;
  return due.getTime() <= today.getTime();
}

export function daysUntilDue(loan: Loan): number | null {
  const due = parseISO(loan.dueDate);
  if (!due) return null;
  return daysBetween(todayDate(), due);
}

export function resolveStatus(loan: Loan): LoanStatus {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  const remaining = remainingDebt(loan);
  if (remaining <= CALC.PAID_THRESHOLD) return "paid";
  if (!isOverdue(loan)) return "active";
  // Vencido: vuelve a "activo" sólo si los pagos dejaron la deuda en ≤ el capital
  // prestado (o sea, el interés acumulado quedó cubierto). Si un re-vencimiento posterior
  // volvió a subir la deuda por encima del capital, sigue atrasado.
  if (remaining <= Number(loan.amount)) return "active";
  return "overdue";
}

// ── Validation ────────────────────────────────────────────────────────────────
export interface LoanFormData {
  clientName?: string | null;
  amount?: string | number;
  interestRate?: string | number;
  interestMode?: "percent" | "fixed";
  fixedInterest?: string | number;
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
  if (form.interestMode === "fixed") {
    const fx = Number(form.fixedInterest);
    if (form.fixedInterest === "" || form.fixedInterest === undefined || Number.isNaN(fx) || fx < 0)
      errors.fixedInterest = "Ingresá un monto de interés 0 o mayor";
  } else {
    const rate = Number(form.interestRate);
    if (form.interestRate === "" || Number.isNaN(rate) || rate < 0)
      errors.interestRate = "La tasa debe ser 0 o mayor";
    else if (rate > BUSINESS_RULES.MAX_INTEREST_RATE)
      errors.interestRate = `La tasa no puede superar ${BUSINESS_RULES.MAX_INTEREST_RATE}%`;
  }
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

// ── Projection calculation ────────────────────────────────────────────────────

/** Días por mes de las proyecciones: 365/12. Con 30 exactos, 12 meses no daban los mismos
 *  ciclos que `cyclesPerYear` (365/días) y las cifras no cerraban entre sí. */
export const DAYS_PER_MONTH = 365 / 12;

/** Largo de ciclo utilizable. `Math.max(1, x)` no alcanza: con NaN devuelve NaN y todo el
 *  cálculo se propaga como NaN a la pantalla. */
const safeCycleDays = (days: number): number =>
  Number.isFinite(days) && days > 0 ? days : BUSINESS_RULES.DEFAULT_LOAN_DAYS;

export interface CyclePoint {
  n: number;
  label: string;
  sublabel: string;
  total: number;
  profit: number;
  pct: number;
}

export interface HorizonPoint {
  months: number;
  /** Ciclos que entran en la ventana. Puede ser fraccionario: con ciclo de 15 días, en
   *  un mes entran ~2,03. */
  cycles: number;
  total: number;
  profit: number;
  pct: number;
}

/** Capital proyectado a `months` meses reinvirtiendo capital + interés en cada ciclo.
 *  Es la misma fórmula que `cyclePoints`, expresada en meses en vez de ciclos. */
export function projectHorizon(
  base: number,
  ratePerCycle: number,
  cycleDays: number,
  months: number
): HorizonPoint {
  const days = safeCycleDays(cycleDays);
  const cycles = (months * DAYS_PER_MONTH) / days;
  const factor = Math.pow(1 + ratePerCycle, cycles);
  const total = base * factor;
  return { months, cycles, total, profit: total - base, pct: (factor - 1) * 100 };
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
  cycleDays = BUSINESS_RULES.DEFAULT_LOAN_DAYS,
}: {
  activeLoans?: ResolvedLoan[];
  overdueLoans?: ResolvedLoan[];
  workingCapital?: number;
  avgRate?: number;
  /** Interés ya acumulado por vencimientos a la fecha. La ganancia acumulada proyectada
   *  arranca desde acá (mes 0) en vez de cero, para reflejar lo ya devengado. */
  accumulatedProfit?: number;
  /** Largo del ciclo de la cartera en días (plazo mediano de los préstamos activos).
   *  Antes estaba fijo en 30, así que una cartera quincenal mostraba "cada ~30 días" y
   *  subestimaba la tasa efectiva anual y la duplicación. */
  cycleDays?: number;
}): CalcProjectionResult {
  const deployedLoans = [...activeLoans, ...overdueLoans];
  // Prorrateado por mi parte: la proyección es sobre MI capital, no sobre la deuda total
  // del cliente. Sin esto un préstamo compartido al 50% inflaba la base (y con ella la
  // ganancia por ciclo y toda la curva) con la mitad que le corresponde al socio.
  const deployedBase = deployedLoans.reduce((a, l) => a + myShare(l) * (l._remaining ?? Number(l.amount)), 0);
  const base = Math.max(0, deployedBase || workingCapital);

  // Tasa promedio simple de TODOS los préstamos desplegados (activos + atrasados),
  // no ponderada por capital. Es la que se muestra en el label "X% × N ciclos".
  const rate =
    deployedLoans.length > 0
      ? deployedLoans.reduce((a, l) => a + Number(l.interestRate), 0) / deployedLoans.length / 100
      : avgRate / 100;
  const days = safeCycleDays(cycleDays);
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
    const cycles = (i * DAYS_PER_MONTH) / days;
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
