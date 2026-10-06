import { CALC, BUSINESS_RULES } from "./constants.js";
import { daysBetween, parseISO, todayDate, todayISO, loanPeriodDate, loanElapsedPeriods, myShare, advancedCycles, advancedCyclesUpTo, loanDeployedFrom, loanPrincipalAt, loanEffectiveRate } from "./utils.js";
import type { Loan, LoanStatus, Payment, ResolvedLoan } from "../types";

/** Ciclos ya capitalizados a `asOf`: los re-vencimientos naturales más los adelantos
 *  manuales. Sin fecha de vencimiento no hay ciclos que capitalizar. */
function overduePeriodsAt(loan: Loan, asOf: string): number {
  if (!loan.dueDate) return 0;
  return loanElapsedPeriods(loan, loan.dueDate, asOf) + advancedCyclesUpTo(loan, asOf);
}

/** Un cargo de interés con su fecha. `contracted` marca el del ciclo contratado (el que se
 *  cobra por adelantado al prestar y se reconoce en el vencimiento). */
interface Accrual {
  date: string;
  amount: number;
  contracted?: boolean;
}

/** Resultado de reconstruir la deuda: el saldo y, de paso, cada cargo de interés que lo
 *  formó. Sale todo del mismo recorrido para que el devengado no pueda contradecir a la
 *  deuda — ver `debtWalkDetailed`. */
interface WalkResult {
  balance: number;
  accruals: Accrual[];
}

/** Interés a devengar en un período dado. En modo "fixed" es un monto constante que no
 *  depende del balance. En modo "percent" (default) es `balance × tasa`. */
export function periodInterest(loan: Loan, balance: number): number {
  if (loan.interestMode === "fixed") return Number(loan.fixedInterest || 0);
  return balance * (Number(loan.interestRate) / 100);
}

/** Interés contratado del ciclo sobre el capital vigente a `asOf` (con los adicionales ya
 *  entregados a esa fecha). En modo "fixed" el cargo es un monto por período que no
 *  depende del capital, así que sumar capital no lo mueve. */
export function expectedProfitAt(loan: Loan, asOf: string): number {
  return periodInterest(loan, loanPrincipalAt(loan, asOf));
}

export function expectedProfit(loan: Loan): number {
  return expectedProfitAt(loan, todayISO());
}

export function expectedReturnAt(loan: Loan, asOf: string): number {
  return loanPrincipalAt(loan, asOf) + expectedProfitAt(loan, asOf);
}

export function expectedReturn(loan: Loan): number {
  return expectedReturnAt(loan, todayISO());
}

// ── Adicionales de capital (sin refinanciar) ──────────────────────────────────
// Un adicional es plata nueva prestada sobre un préstamo en curso. Se trata igual que el
// capital original: entra a la deuda con el interés de su ciclo cobrado por adelantado
// (prestar $50k al 10% ya son $55k de deuda, la misma regla que al dar de alta el
// préstamo) y de ahí en más capitaliza en cada vencimiento posterior.

const SIN_EXTRAS: ReadonlyMap<number, number> = new Map();

/** Lo que un adicional suma a la deuda el día que se entrega: capital + el interés del
 *  ciclo en curso, por adelantado. En modo "fixed" el cargo por período es un monto fijo
 *  que no depende del capital, así que el adicional suma sólo capital. */
export function extraDebtImpact(
  loan: Pick<Loan, "interestMode" | "interestRate">,
  amount: number
): number {
  if (loan.interestMode === "fixed") return amount;
  return amount * (1 + Number(loan.interestRate || 0) / 100);
}

/**
 * Posición del adicional en la línea de tiempo de la deuda: el índice del vencimiento que
 * cierra el ciclo en el que se entregó. Entra a la deuda DESPUÉS de esa capitalización,
 * porque su propio ciclo ya lo cobró por adelantado — capitalizarlo también ahí sería
 * cobrarle dos veces el mismo ciclo. De ahí en más compone como el resto de la deuda.
 *
 * 0 → entregado antes del vencimiento original (compone igual que el capital inicial).
 * i → entregado dentro del ciclo de mora que cierra en el vencimiento i.
 * N+1 → entregado en el ciclo abierto: todavía no capitalizó nada.
 */
function extraSlot(loan: Loan, date: string, overduePeriods: number): number {
  if (!loan.dueDate || date <= loan.dueDate) return 0;
  for (let i = 1; i <= overduePeriods; i++) {
    if (date <= loanPeriodDate(loan, loan.dueDate, i)) return i;
  }
  return overduePeriods + 1;
}

/** Capital de los adicionales entregados hasta `asOf`, agrupado por `extraSlot`. */
function extrasBySlot(loan: Loan, asOf: string, overduePeriods: number): ReadonlyMap<number, number> {
  const list = loan.extras;
  if (!list || list.length === 0) return SIN_EXTRAS;
  const bySlot = new Map<number, number>();
  for (const e of list) {
    const date = e.date || "";
    const amount = Number(e.amount || 0);
    if (!date || date > asOf || !(amount > 0)) continue;
    const slot = extraSlot(loan, date, overduePeriods);
    bySlot.set(slot, (bySlot.get(slot) || 0) + amount);
  }
  return bySlot;
}

/**
 * Impacto de los adicionales sobre la deuda, indexado por `extraSlot` (0..N+1). Lo usa la
 * línea de tiempo del detalle para reconstruir ciclo por ciclo los MISMOS saldos que
 * `remainingDebt`: si reparte los adicionales por su cuenta, los totales que muestra cada
 * fila de mora dejan de coincidir con la deuda del header.
 */
export function extraImpactsBySlot(loan: Loan, asOf: string, overduePeriods: number): number[] {
  const out = new Array<number>(overduePeriods + 2).fill(0);
  extrasBySlot(loan, asOf, overduePeriods).forEach((capital, slot) => {
    if (slot >= 0 && slot < out.length) out[slot] += extraDebtImpact(loan, capital);
  });
  return out;
}

/**
 * Núcleo de la deuda de un préstamo con vencimiento: arranca en capital + interés del
 * primer ciclo (cobrado por adelantado) y aplica, vencimiento por vencimiento, la
 * capitalización del período, los adicionales de ese ciclo y los pagos.
 *
 * Lo comparten `remainingDebt`, `remainingDebtAt` y `compoundReturn` a propósito: cuando
 * cada uno tenía su copia del bucle, agregar un caso nuevo los separaba y la misma plata
 * salía con dos números distintos en pantalla.
 */
function debtWalkDetailed(
  loan: Loan,
  asOf: string,
  overduePeriods: number,
  payments: Payment[]
): WalkResult {
  const base = Number(loan.amount);
  const extras = extrasBySlot(loan, asOf, overduePeriods);
  const getPos = (p: Payment) => resolvePaymentPos(p, overduePeriods, loan);
  const accruals: Accrual[] = [];
  /** Interés del ciclo propio de un adicional, cobrado por adelantado al entregarlo. 0 en
   *  modo fijo, donde el cargo del período no depende del capital. */
  const extraInterest = (capital: number) => extraDebtImpact(loan, capital) - capital;

  // Ciclo contratado: se cobra al prestar (de ahí que la deuda arranque en capital +
  // interés) y se reconoce al cerrarse, o sea en el vencimiento. Los adicionales
  // entregados antes del vencimiento viajan con el capital original.
  let balance = base + (extras.get(0) || 0);
  const contracted = periodInterest(loan, balance);
  balance += contracted;
  if (loan.dueDate) accruals.push({ date: loan.dueDate, amount: contracted, contracted: true });
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });

  // Fecha de cada capitalización: primero los re-vencimientos naturales y después los
  // ciclos adelantados a mano, con la misma convención que la línea de tiempo del detalle.
  const advances = (loan.advancedAt || []).filter((d) => d && d <= asOf).sort();
  const naturalCycles = overduePeriods - advances.length;

  for (let i = 1; i <= overduePeriods; i++) {
    const extraCapital = extras.get(i) || 0;
    // El interés se cobra sobre el saldo REAL del ciclo: si el cliente pagó antes del
    // re-vencimiento, se le cobra menos. Calcularlo sobre un saldo sin pagos inflaba el
    // devengado y rompía la identidad deuda = capital + devengado − pagado.
    let interest = balance > 0 ? periodInterest(loan, balance) : 0;
    interest += extraInterest(extraCapital);
    balance += interest + extraCapital;
    const date = i > naturalCycles
      ? (advances[i - naturalCycles - 1] || loanPeriodDate(loan, loan.dueDate, i))
      : loanPeriodDate(loan, loan.dueDate, i);
    if (interest > 0) accruals.push({ date, amount: interest });
    payments.filter((p) => getPos(p) === i).forEach((p) => {
      balance = Math.max(0, balance - Number(p.amount));
    });
  }
  // Adicionales del ciclo abierto: ya son deuda con su interés por adelantado, pero su
  // ciclo no cerró, así que todavía no se devengan.
  const abierto = extras.get(overduePeriods + 1) || 0;
  return { balance: balance + extraDebtImpact(loan, abierto), accruals };
}

/**
 * Deuda de un préstamo sin vencimiento al cierre de `asOf`, antes de los pagos: compone un
 * ciclo por cada período transcurrido desde el inicio más el ciclo en curso. Cada adicional
 * compone sólo los ciclos posteriores a su entrega.
 */
function noDueDateWalk(loan: Loan, asOf: string): WalkResult {
  const base = Number(loan.amount);
  const elapsed = loanElapsedPeriods(loan, loan.startDate, asOf);
  const advances = (loan.advancedAt || []).filter((d) => d && d <= asOf).sort();
  const extras = (loan.extras || []).filter(
    (e) => e.date && e.date <= asOf && Number(e.amount || 0) > 0
  );
  const accruals: Accrual[] = [];

  // Recorrido ciclo por ciclo: cada adicional entra en el ciclo en que se entregó y de ahí
  // en más compone con el resto de la deuda. Sin extras es `base * (1+r)^períodos`, y en
  // modo fijo `base + fijo * períodos` (el cargo no depende del capital).
  const extrasEntre = (desde: string, hasta: string): number =>
    extras.reduce((s, e) => (e.date! > desde && e.date! <= hasta ? s + Number(e.amount) : s), 0);
  let balance = base;
  let desde = "";
  for (let i = 1; i <= elapsed; i++) {
    const date = loanPeriodDate(loan, loan.startDate, i);
    balance += extrasEntre(desde, date);
    desde = date;
    const interest = periodInterest(loan, balance);
    balance += interest;
    if (interest > 0) accruals.push({ date, amount: interest });
  }
  balance += extrasEntre(desde, asOf);
  // Un ciclo capitalizado por cada adelanto manual, en su fecha.
  for (const date of advances) {
    const interest = periodInterest(loan, balance);
    balance += interest;
    if (interest > 0) accruals.push({ date, amount: interest });
  }
  // El ciclo en curso se cobra por adelantado (igual que al dar de alta el préstamo) pero
  // no se devenga hasta cerrarse.
  balance += periodInterest(loan, balance);
  return { balance, accruals };
}

export function loanIntegrityErrors(loan: Loan): string[] {
  const errors: string[] = [];
  const amount = Number(loan.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Monto inválido");
  if (!loan.clientName?.trim()) errors.push("Cliente faltante");
  if (!loan.startDate) errors.push("Fecha de inicio faltante");
  if (loan.startDate && loan.dueDate && loan.dueDate < loan.startDate)
    errors.push("Vencimiento anterior al inicio");
  for (const e of loan.extras || []) {
    const extra = Number(e.amount);
    if (!Number.isFinite(extra) || extra <= 0) { errors.push("Adicional con monto inválido"); break; }
    if (!e.date) { errors.push("Adicional sin fecha"); break; }
  }
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

/** Total acumulado de la deuda (capital + todo el interés capitalizado), sin descontar
 *  pagos. Es `remainingDebt` con los pagos apagados: misma reconstrucción, misma fuente. */
export function compoundReturn(loan: Loan): number {
  const today = todayISO();
  if (loan.noDueDate) return noDueDateWalk(loan, today).balance;
  return debtWalkDetailed(loan, today, overduePeriodsAt(loan, today), []).balance;
}

export function paidAmount(loan: Loan): number {
  return (loan.payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
}

export function remainingDebt(loan: Loan): number {
  // Sin vencimiento: la deuda capitaliza un período por cada ciclo transcurrido desde el
  // inicio. Sin esta rama la deuda quedaría congelada en un solo período, contradiciendo a
  // `compoundReturn`, `remainingDebtAt` y la curva de capital de los gráficos.
  if (loan.noDueDate) {
    return Math.max(0, compoundReturn(loan) - paidAmount(loan));
  }
  const today = todayISO();
  return Math.max(0, debtWalkDetailed(loan, today, overduePeriodsAt(loan, today), loan.payments || []).balance);
}

// Versión "a una fecha" de remainingDebt: calcula la deuda (capital + interés
// capitalizado por vencimientos/re-vencimientos) tal como estaba al cierre de `asOf`,
// contando sólo los pagos hechos hasta esa fecha. Con asOf = hoy coincide con remainingDebt.
export function remainingDebtAt(loan: Loan, asOf: string): number {
  // No es `startDate` a secas: un préstamo puede tener startDate a futuro (el cliente
  // pagó los intereses por adelantado) y aun así tener la plata prestada. Ver
  // `loanDeployedFrom`.
  const desplegadoDesde = loanDeployedFrom(loan);
  if (desplegadoDesde && desplegadoDesde > asOf) return 0;

  const paymentsUpTo = (loan.payments || []).filter((p) => (p.date || "") <= asOf);

  // Sin vencimiento: compone un período por cada ciclo transcurrido desde el inicio.
  if (loan.noDueDate) {
    const paidUpTo = paymentsUpTo.reduce((s, p) => s + Number(p.amount || 0), 0);
    return Math.max(0, noDueDateWalk(loan, asOf).balance - paidUpTo);
  }

  return Math.max(0, debtWalkDetailed(loan, asOf, overduePeriodsAt(loan, asOf), paymentsUpTo).balance);
}

// Capital desplegado en un préstamo al cierre de `asOf`, con la misma clasificación
// que `capitalInvested` (financials): los vencidos aportan toda su deuda capitalizada,
// los activos el principal acotado a lo que aún se debe. Refinanciados, ya cobrados y
// los que todavía no arrancaron no aportan. Con asOf = hoy, la suma == capitalInvested.
export function loanCapitalAt(loan: Loan, asOf: string): number {
  if (loan.status === "refinanced") return 0;
  const desplegadoDesde = loanDeployedFrom(loan);
  if (desplegadoDesde && desplegadoDesde > asOf) return 0;
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
  // El tope de un activo es el capital vigente a esa fecha: los adicionales ya entregados
  // también son plata en la calle (y los de mañana todavía no).
  return overdueAt ? remaining : Math.min(remaining, loanPrincipalAt(loan, asOf));
}

// Eventos de interés devengado de un préstamo: cada vez que cae un vencimiento se le
// "cobra" interés al cliente (se suma a su deuda), lo pague o no. El primer vencimiento
// devenga el interés contratado del ciclo; cada re-vencimiento devenga tasa sobre la deuda
// compuesta de ese momento.
//
// Sale del MISMO recorrido que la deuda (`debtWalkDetailed` / `noDueDateWalk`), así que lo
// devengado es exactamente lo que se le cargó al cliente. Cuando tenía su propio bucle
// componía sobre un saldo que ignoraba los pagos, y el cliente que paga los intereses al
// día —el caso más común— aparecía generando mucho más de lo real: seis meses al 10%
// pagando $10k por mes daban $94.871 de devengado contra $77.715 cobrados de verdad.
//
// Se cuenta hasta hoy, o hasta que el préstamo se cerró (último pago) si está
// pagado/refinanciado, para no inventar intereses posteriores al cierre.
export function interestAccruals(loan: Loan): { date: string; amount: number }[] {
  const events: { date: string; amount: number }[] = [];
  const base = Number(loan.amount);
  if (!(base > 0)) return events;

  const today = todayISO();
  const lastPayment = (loan.payments || []).reduce((max, p) => ((p.date || "") > max ? p.date! : max), "");
  const closed = loan.status === "paid" || loan.status === "refinanced";
  // Fecha de cierre. Con pagos, la del último. Un refinanciado normalmente cierra sin
  // pago —la deuda rueda al préstamo nuevo— y ahí vale su vencimiento... salvo que el
  // vencimiento todavía no haya llegado: refinanciar antes de tiempo cerraba el préstamo
  // hoy pero devengaba el interés en una fecha futura, y esa ganancia desaparecía del
  // gráfico hasta que esa fecha llegara.
  const closeDate = closed
    ? (lastPayment || (loan.dueDate && loan.dueDate < today ? loan.dueDate : today))
    : today;
  const horizon = closeDate;

  if (loan.noDueDate && !loan.startDate) return events;
  const { accruals } = loan.noDueDate
    ? noDueDateWalk(loan, today)
    : debtWalkDetailed(loan, today, overduePeriodsAt(loan, today), loan.payments || []);

  for (const ev of accruals) {
    if (!ev.date || !(ev.amount > 0)) continue;
    if (ev.date <= horizon) {
      events.push({ date: ev.date, amount: ev.amount });
      continue;
    }
    // Cerrado antes de su vencimiento: el interés contratado se cobró igual (el cliente
    // paga capital + interés aunque cancele antes, y en una refinanciación se capitaliza
    // dentro del préstamo nuevo), así que se devenga en la fecha de cierre. Sin esto la
    // ganancia de un préstamo pagado anticipadamente —o refinanciado antes de vencer—
    // desaparecía del ROI histórico y de "Ganancia acumulada proyectada". Lo que caiga
    // después del cierre y NO sea el ciclo contratado, en cambio, nunca se cobró.
    if (closed && ev.contracted) events.push({ date: lastPayment || closeDate, amount: ev.amount });
  }
  return events;
}

/**
 * Qué dejó un préstamo ya cerrado (cobrado o refinanciado) y cuándo cerró, prorrateado por
 * mi parte. Lo usan la card del historial de archivados y su resumen.
 *
 * Un eslabón **refinanciado** casi nunca cobró nada: la deuda rodó al préstamo siguiente,
 * así que `_paid - _principal` da una pérdida del tamaño del capital. Su ganancia es el
 * interés que devengó antes de capitalizarse — la misma definición que usa
 * `accumulatedProfit`, y la razón por la que la ganancia de una cadena no desaparece.
 *
 * `prestado` queda en bruto respecto de la cadena: quien agregue estos valores tiene que
 * excluir los eslabones con `refinancedFromId`, cuyo capital es la deuda del anterior
 * (mismo criterio que `totalDisbursed`).
 */
export function closedLoanOutcome(loan: ResolvedLoan): {
  generado: number;
  prestado: number;
  cierre: string;
} {
  const share = myShare(loan);
  const accruals = interestAccruals(loan);
  const lastPayment = (loan.payments || []).reduce((max, p) => ((p.date || "") > max ? p.date! : max), "");
  // Sin pagos, el cierre es el del último devengado: `interestAccruals` fecha ahí el
  // interés contratado de un préstamo cerrado.
  const lastAccrual = accruals.reduce((max, ev) => (ev.date > max ? ev.date : max), "");
  const generado = loan._status === "refinanced"
    ? accruals.reduce((s, ev) => s + ev.amount, 0)
    : loan._paid - loan._principal;
  return {
    generado: share * generado,
    prestado: share * loan._principal,
    cierre: lastPayment || lastAccrual || "",
  };
}

// Interés que se va a cobrar (capitalizar a la deuda) entre hoy y `until`, por los
// vencimientos / re-vencimientos que caen en esa ventana. Proyecta hacia adelante: es el
// crecimiento futuro del capital. Compone si entran varios ciclos. Ignora pagos futuros.
export function upcomingInterest(loan: Loan, until: string): number {
  if (loan.status === "paid" || loan.status === "refinanced") return 0;
  const today = todayISO();
  // Capital vigente: con adicionales ya entregados, el próximo interés se cobra sobre el
  // total prestado, no sobre el monto original.
  const base = loanPrincipalAt(loan, today);
  const contracted = expectedProfit(loan);
  if (!(base > 0) || !(contracted > 0)) return 0;
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
  // Capital vigente (con los adicionales ya entregados): la próxima ganancia se cobra
  // sobre toda la plata prestada.
  const amount = loanPrincipalAt(loan);
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
  // volvió a subir la deuda por encima del capital, sigue atrasado. El capital es el
  // vigente: después de sumarle un adicional, el umbral sube con él.
  if (remaining <= loanPrincipalAt(loan)) return "active";
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
  /** Rendimiento real de la cartera por ciclo (fracción 0-1): la ganancia del próximo ciclo
   *  sobre la base. Es la tasa que usa TODA la proyección. */
  rate: number;
  days: number;
  base: number;
  cyclesPerYear: number;
  tea: number;
  doublingYears: number | null;
  gainPerCycle: number;
  /** Promedio simple de las tasas de los contratos. Sólo para mostrar junto a `rate` y que
   *  se vea la diferencia entre la tasa a la que prestás y lo que rinde la plata. */
  contractRate: number;
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

  // Ganancia del próximo ciclo: la suma de lo que va a cobrar CADA préstamo, con su propia
  // tasa y sobre su propio saldo. Es exactamente `derived.nextProfitTotal`, el número que
  // la pantalla muestra como "Ganancia por ciclo".
  const realGain = deployedLoans.reduce((a, l) => {
    // `_nextProfit` viene de useDerived; si llega un préstamo sin resolver se calcula acá
    // en vez de tomarlo como 0, que dejaría toda la proyección en cero.
    const n = Number(l._nextProfit);
    return a + myShare(l) * (Number.isFinite(n) ? n : nextPeriodInterest(l));
  }, 0);

  // La tasa de la proyección SE DERIVA de esa ganancia, no al revés: es el rendimiento real
  // de la cartera por ciclo. Antes era el promedio simple de las tasas de los contratos
  // aplicado a la deuda total, que es otra cuenta: con la plata grande prestada a tasa baja
  // y varios préstamos chicos a tasa alta, el promedio simple se dispara y la proyección
  // prometía mucho más de lo que la cartera iba a dar. En una cartera de prueba, "Ganancia
  // por ciclo" decía $1.786 y el cuadro "1 ciclo" $4.623 — 2,6 veces más, y la TEA saltaba
  // de 100% a 457%. Derivándola, el cuadro de 1 ciclo ES la ganancia por ciclo.
  const rate = base > 0 && deployedLoans.length > 0
    ? realGain / base
    : avgRate / 100;
  const days = safeCycleDays(cycleDays);
  const cyclesPerYear = 365 / days;
  const tea = Math.pow(1 + rate, cyclesPerYear) - 1;
  const doublingYears = rate > 0 ? (Math.log(2) / Math.log(1 + rate)) * (days / 365) : null;
  const gainPerCycle = base * rate;

  // Tasa promedio simple de los contratos: NO alimenta ninguna proyección, es sólo para
  // mostrar al lado y que se vea la diferencia entre "a qué tasa presto" y "cuánto rinde
  // de verdad la plata". Si están muy separadas, hay capital grande en préstamos flojos.
  const contractRate = deployedLoans.length > 0
    ? deployedLoans.reduce((a, l) => a + loanEffectiveRate(l), 0) / deployedLoans.length
    : avgRate / 100;

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

  return { rate, days, base, cyclesPerYear, tea, doublingYears, gainPerCycle, contractRate, cyclePoints, profitSeries };
}
