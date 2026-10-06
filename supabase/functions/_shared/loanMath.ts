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

/** Capital agregado a un préstamo en curso, sin refinanciar. Espeja LoanExtra del frontend. */
export type LoanExtra = {
  id?: string;
  amount?: number;
  date?: string;
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
  /** Fechas de adelantos manuales de ciclo. Cada entrada suma un ciclo de capitalización
   *  a la deuda y corre el próximo vencimiento un ciclo hacia adelante. */
  advancedAt?: string[];
  /** Archivado: sale de la agenda y de las notificaciones, pero sigue contando en las
   *  metricas de la app. Espeja loan.archived del frontend. */
  archived?: boolean;
  status?: string;
  paymentType?: string;
  customDays?: number;
  payments?: Payment[];
  /** Capital agregado al préstamo sin refinanciar. `amount` queda siendo el original: el
   *  capital vigente lo da `loanPrincipalAt`. Espeja loan.extras del frontend. */
  extras?: LoanExtra[];
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

/** Cantidad de ciclos adelantados manualmente hasta `asOf` (inclusive).
 *  Un adelanto fechado a futuro todavia no capitalizo nada, asi que no cuenta: espeja
 *  advancedCycles/advancedCyclesUpTo de src/lib/utils.ts. */
function advancedCycles(loan: Loan, asOf: string): number {
  return (loan.advancedAt || []).filter((d) => d <= asOf).length;
}

/** Mirror of src/lib/utils.js getNextRenewalDate. Suma los ciclos adelantados. */
export function getNextRenewalDate(loan: Loan, today: string): string | null {
  if (!loan.dueDate) return null;
  const periods = loanElapsedPeriods(loan, loan.dueDate, today) + advancedCycles(loan, today);
  return loanPeriodDate(loan, loan.dueDate, periods + 1);
}

/** Interés que se agrega en un período dado. Fijo: constante (fixedInterest). */
function periodInterest(loan: Loan, balance: number): number {
  if (loan.interestMode === "fixed") return Number(loan.fixedInterest ?? 0);
  return balance * (Number(loan.interestRate ?? 0) / 100);
}

/** Mirror of src/lib/utils.ts loanPrincipalAt: capital vigente = monto original + los
 *  adicionales ya entregados a esa fecha. Uno fechado a futuro todavía no está en la calle. */
export function loanPrincipalAt(loan: Loan, asOf: string): number {
  return (loan.extras || []).reduce(
    (s, e) => ((e.date ?? "") <= asOf ? s + Number(e.amount ?? 0) : s),
    Number(loan.amount ?? 0)
  );
}

export function expectedProfit(loan: Loan, asOf: string): number {
  return periodInterest(loan, loanPrincipalAt(loan, asOf));
}

export function expectedReturn(loan: Loan, asOf: string): number {
  return loanPrincipalAt(loan, asOf) + expectedProfit(loan, asOf);
}

/** Mirror of src/lib/calcs.ts extraDebtImpact: un adicional entra a la deuda con el interés
 *  de su ciclo por adelantado, igual que el capital original. En modo fijo, sólo capital. */
function extraDebtImpact(loan: Loan, amount: number): number {
  if (loan.interestMode === "fixed") return amount;
  return amount * (1 + Number(loan.interestRate ?? 0) / 100);
}

/** Mirror of src/lib/calcs.ts extraSlot: el vencimiento que cierra el ciclo en que se
 *  entregó el adicional. Entra a la deuda DESPUÉS de esa capitalización, porque su propio
 *  ciclo ya lo cobró por adelantado. */
function extraSlot(loan: Loan, date: string, overduePeriods: number): number {
  if (!loan.dueDate || date <= loan.dueDate) return 0;
  for (let i = 1; i <= overduePeriods; i++) {
    if (date <= loanPeriodDate(loan, loan.dueDate, i)) return i;
  }
  return overduePeriods + 1;
}

function extrasBySlot(loan: Loan, asOf: string, overduePeriods: number): Map<number, number> {
  const bySlot = new Map<number, number>();
  for (const e of loan.extras || []) {
    const date = e.date ?? "";
    const amount = Number(e.amount ?? 0);
    if (!date || date > asOf || !(amount > 0)) continue;
    const slot = extraSlot(loan, date, overduePeriods);
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + extraDebtImpact(loan, amount));
  }
  return bySlot;
}

export function paidAmount(loan: Loan): number {
  return (loan.payments || []).reduce((a, p) => a + Number(p?.amount ?? 0), 0);
}

type OverdueMeta = { daysOverdue: number; overduePeriods: number; rate: number };

function getOverdueMeta(loan: Loan, today: string): OverdueMeta | null {
  if (!loan.dueDate) return null;
  const advCycles = advancedCycles(loan, today);
  const daysOverdue = daysBetween(loan.dueDate, today);
  const naturalPeriods = daysOverdue > 0 ? loanElapsedPeriods(loan, loan.dueDate, today) : 0;
  const overduePeriods = naturalPeriods + advCycles;
  if (overduePeriods === 0) return null;
  return { daysOverdue: Math.max(0, daysOverdue), overduePeriods, rate: Number(loan.interestRate ?? 0) / 100 };
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
  const elapsed = loanElapsedPeriods(loan, loan.startDate ?? "", today);
  const advanced = advancedCycles(loan, today);
  const extras = (loan.extras || []).filter(
    (e) => e.date && e.date <= today && Number(e.amount ?? 0) > 0
  );
  if (loan.interestMode === "fixed") {
    const extraCapital = extras.reduce((s, e) => s + Number(e.amount), 0);
    return base + Number(loan.fixedInterest ?? 0) * (elapsed + 1 + advanced) + extraCapital;
  }
  // Ciclo por ciclo, igual que noDueDateDebt del frontend: cada adicional entra en el ciclo
  // en que se entregó y de ahí compone con el resto.
  const extrasEntre = (desde: string, hasta: string): number =>
    extras.reduce((s, e) => (e.date! > desde && e.date! <= hasta ? s + Number(e.amount) : s), 0);
  let balance = base;
  let desde = "";
  for (let i = 1; i <= elapsed; i++) {
    const date = loanPeriodDate(loan, loan.startDate ?? "", i);
    balance += extrasEntre(desde, date);
    desde = date;
    balance += periodInterest(loan, balance);
  }
  balance += extrasEntre(desde, today);
  for (let i = 0; i <= advanced; i++) balance += periodInterest(loan, balance);
  return balance;
}

/** Mirror of src/lib/calcs.js remainingDebt — includes compounding for overdue periods and
 *  los adicionales de capital en el ciclo en que se entregaron (ver debtWalk del frontend). */
export function remainingDebt(loan: Loan, today: string): number {
  const payments = loan.payments || [];

  // Sin vencimiento no hay dueDate, así que getOverdueMeta devuelve null y la deuda
  // quedaría congelada en un solo período (mismo bug que tenía el frontend).
  if (loan.noDueDate) {
    return Math.max(0, noDueDateBalance(loan, today) - paidAmount(loan));
  }

  const meta = getOverdueMeta(loan, today);
  const overduePeriods = meta?.overduePeriods ?? 0;
  const extras = extrasBySlot(loan, today, overduePeriods);
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, loan);
  const base = Number(loan.amount ?? 0);

  let balance = base + periodInterest(loan, base) + (extras.get(0) ?? 0);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount ?? 0));
  });
  for (let i = 1; i <= overduePeriods; i++) {
    if (balance > 0) balance += periodInterest(loan, balance);
    balance += extras.get(i) ?? 0;
    payments.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount ?? 0));
    });
  }
  return Math.max(0, balance + (extras.get(overduePeriods + 1) ?? 0));
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
  // Umbral = capital vigente (con los adicionales ya entregados), igual que resolveStatus
  // del frontend: después de sumarle capital, la deuda que lo deja "al día" sube con él.
  if (remaining <= loanPrincipalAt(loan, today)) return "active";
  return "overdue";
}

/** Today as YYYY-MM-DD in a given tz offset (hours from UTC). Default: Argentina (-3). */
export function todayISOInTz(tzOffsetHours = -3): string {
  const now = new Date();
  const local = new Date(now.getTime() + tzOffsetHours * 3_600_000);
  return local.toISOString().slice(0, 10);
}
