import { CALC, BUSINESS_RULES } from "./constants.js";
import { daysBetween, parseISO, todayDate, todayISO, loanPeriodDate, loanElapsedPeriods, myShare, advancedCycles, advancedCyclesUpTo, advanceDates, advanceEntries, loanDeployedFrom, loanPrincipalAt, loanEffectiveRate, getNextRenewalDate } from "./utils.js";
import type { AdvanceEntry, Loan, LoanStatus, Payment, ResolvedLoan } from "../types";

/**
 * Ciclos ya capitalizados a `asOf`: los re-vencimientos naturales más los adelantos
 * manuales. Sin fecha de vencimiento no hay ciclos que capitalizar.
 *
 * Mira SÓLO el calendario, nunca `_status`, y de eso depende que la pantalla coincida con
 * la deuda. Un préstamo vencido al que le pagaron lo suficiente vuelve a `"active"` (ver
 * `resolveStatus`) y sin embargo sigue re-venciendo: el motor le cobra el ciclo igual. La
 * UI que contaba los ciclos por el estado se quedaba en cero y escondía cargos que la
 * deuda del header ya tenía adentro.
 */
export function overduePeriodsAt(loan: Loan, asOf: string): number {
  if (!loan.dueDate) return 0;
  return loanElapsedPeriods(loan, loan.dueDate, asOf) + advancedCyclesUpTo(loan, asOf);
}

/** Un cargo de interés con su fecha. `contracted` marca el del ciclo contratado (el que se
 *  cobra por adelantado al prestar y se reconoce en el vencimiento). */
interface Accrual {
  date: string;
  amount: number;
  contracted?: boolean;
  /** Ciclo cobrado por adelantado (`advancedAt`). Se fecha en el vencimiento que consume,
   *  no el día que el cliente vino a pagar, así que puede caer en el futuro. */
  advanced?: boolean;
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

// ── Secuencia de ciclos (`advancedAt`) ────────────────────────────────────────

/** Un slot de la secuencia de capitalizaciones: o un re-vencimiento natural, o un ciclo
 *  adelantado a mano. */
export interface CycleSlot {
  /** Posición en el recorrido, 1..overduePeriods. */
  slot: number;
  /** Fecha en que el ciclo se devenga: el vencimiento que cierra. En un adelanto es el
   *  vencimiento que ese adelanto está pagando, NO el día en que el cliente vino —de eso
   *  depende a qué mes va la ganancia. */
  date: string;
  /** Sólo en los adelantos: el día en que se cobró. La línea de tiempo lo usa para
   *  dibujar la fila donde el cliente efectivamente vino. */
  paidAt?: string;
  /** Índice en `advanceEntries(loan.advancedAt)` si este ciclo es un adelanto manual. */
  advanceIndex?: number;
  /** El usuario le fijó la posición a mano (`pos`), no es la que le tocaba por default. */
  pinned?: boolean;
}

/**
 * Qué cae en cada slot de la secuencia de capitalizaciones 1..N. El slot es lo que define
 * el recorrido de la deuda —en qué orden capitaliza y qué pagos entraron antes de cada
 * cargo— y la fila que dibuja la línea de tiempo.
 *
 * Default (nadie movió nada): los re-vencimientos naturales ocupan los primeros slots en
 * orden de calendario y los adelantos van al final, en orden de fecha. Es el
 * comportamiento histórico, bit por bit.
 *
 * Con `pos` el usuario fija un adelanto en un slot y los naturales se corren para dejarle
 * el lugar. Hace falta porque el adelanto se queda con su fecha mientras el tiempo sigue
 * corriendo: a los dos meses su cargo seguía dibujado al final de la lista, con el saldo
 * más alto de todos, aunque hubiera pasado antes que dos re-vencimientos.
 *
 * Mover un adelanto NO cambia la deuda total: todos los slots capitalizan con la misma
 * fórmula, así que permutarlos da el mismo saldo. Cambia la FECHA con la que se devenga
 * cada ciclo —o sea a qué mes va la ganancia— y el orden en que se lee la línea de tiempo.
 */
export function cycleSequence(loan: Loan, asOf: string, overduePeriods: number): CycleSlot[] {
  const n = Math.max(0, overduePeriods);
  if (n === 0) return [];
  // El índice original se preserva: es con lo que la UI sabe a qué entrada del array
  // pertenece la fila que estás mirando (hay adelantos que comparten fecha).
  const advances = advanceEntries(loan.advancedAt)
    .map((e, advanceIndex) => ({ ...e, advanceIndex }))
    .filter((e) => e.date <= asOf);

  const filled = new Array<CycleSlot | undefined>(n + 1);
  const floating: typeof advances = [];

  // 1) Los fijados reclaman su slot, de menor a mayor. Dos adelantos en el mismo slot no
  //    pueden ser: el segundo vuelve a la bolsa de los que no tienen posición.
  for (const adv of advances
    .filter((a) => typeof a.pos === "number")
    .sort((a, b) => a.pos! - b.pos!)) {
    const slot = Math.min(Math.max(adv.pos!, 1), n);
    if (filled[slot]) { floating.push(adv); continue; }
    filled[slot] = { slot, date: adv.date, advanceIndex: adv.advanceIndex, pinned: true };
  }
  floating.push(...advances.filter((a) => typeof a.pos !== "number"));

  // 2) Los que quedaron sin fijar van a los ÚLTIMOS slots libres, en orden de fecha: ese es
  //    el default histórico ("los adelantos, al final de la secuencia").
  const free: number[] = [];
  for (let i = 1; i <= n; i++) if (!filled[i]) free.push(i);
  floating.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.advanceIndex - b.advanceIndex));
  const tail = free.slice(Math.max(0, free.length - floating.length));
  floating.forEach((adv, i) => {
    const slot = tail[i];
    if (slot !== undefined) filled[slot] = { slot, date: adv.date, advanceIndex: adv.advanceIndex };
  });

  // 3) Cada ciclo se devenga en el vencimiento que cierra. Los naturales son los primeros
  //    del calendario: el k-ésimo natural vence en `loanPeriodDate(..., k)`, sin importar
  //    en qué slot haya quedado (moverlo de lugar no cambia el día en que venció).
  //
  //    Un adelanto paga un vencimiento que TODAVÍA NO LLEGÓ, así que le tocan los que
  //    siguen: con 2 naturales corridos, el primer adelanto paga el vencimiento 3. Antes
  //    el adelanto se devengaba el día en que el cliente vino a pagar, y el gráfico
  //    mensual le sumaba ese ciclo al mes del cobro: cobrar en octubre el vencimiento de
  //    noviembre pasaba la ganancia de octubre de $10.000 a $21.000.
  const naturalTotal = n - advances.length;
  let natural = 0;
  let advanced = 0;
  const out: CycleSlot[] = [];
  for (let i = 1; i <= n; i++) {
    const hit = filled[i];
    if (hit) {
      advanced += 1;
      out.push({ ...hit, date: loanPeriodDate(loan, loan.dueDate, naturalTotal + advanced), paidAt: hit.date });
      continue;
    }
    natural += 1;
    out.push({ slot: i, date: loanPeriodDate(loan, loan.dueDate, natural) });
  }
  return out;
}

/**
 * Las entradas de `advancedAt` con el ciclo adelantado `advanceIndex` corrido un slot hacia
 * atrás (`dir: -1`) o hacia adelante (`+1`). `null` si no hay nada que mover: el adelanto no
 * está en la secuencia (fechado a futuro) o ya está en el borde.
 *
 * Si en el slot destino hay OTRO adelanto, los dos se intercambian. Sin eso el desempate de
 * `cycleSequence` mandaba al desplazado al final de la secuencia, que no es "moverse un
 * lugar". Si hay un re-vencimiento natural, los naturales se corren solos.
 */
export function reorderAdvance(
  loan: Loan,
  advanceIndex: number,
  dir: -1 | 1,
  asOf: string,
  overduePeriods: number
): AdvanceEntry[] | null {
  const n = Math.max(0, overduePeriods);
  if (n === 0) return null;
  const sequence = cycleSequence(loan, asOf, n);
  const from = sequence.find((s) => s.advanceIndex === advanceIndex);
  if (!from) return null;
  const to = Math.min(Math.max(from.slot + dir, 1), n);
  if (to === from.slot) return null;
  const occupant = sequence[to - 1];
  return advanceEntries(loan.advancedAt).map((e, i) => {
    if (i === advanceIndex) return { ...e, pos: to };
    if (occupant?.advanceIndex === i) return { ...e, pos: from.slot };
    return e;
  });
}

// ── Medio ciclo (`halfAdvancedAt`) ────────────────────────────────────────────
// El cliente vino a pagar unos días después del vencimiento y se le cobra la mitad del
// interés del período en vez del mes entero. El cargo cae en la fecha elegida y el
// re-vencimiento que ese medio ciclo adelanta cobra sólo la mitad que quedaba; de ahí en
// más vuelven los ciclos completos. Media y media hacen un mes: no es un descuento, es
// cobrar partido. El calendario no se toca — a diferencia de `advancedAt`, un medio ciclo
// NO corre `getNextRenewalDate` ni abre un slot de pago propio.

/** Fracción de un ciclo que cobra cada medio adelanto. */
const HALF = 0.5;

/**
 * Medios ciclos cobrados hasta `asOf`, agrupados por el re-vencimiento que adelantan.
 * Comparte la cuenta de `extraSlot`: el slot de una fecha es el índice del vencimiento que
 * cierra el ciclo en el que cae, que es justamente el que ese medio ciclo está pagando por
 * adelantado. El slot `overduePeriods + 1` es el ciclo abierto: ya se cobró, y cuando esa
 * fecha llegue va a descontar su mitad.
 */
export function halfCyclesBySlot(loan: Loan, asOf: string, overduePeriods: number): ReadonlyMap<number, HalfCharge[]> {
  const list = advanceEntries(loan.halfAdvancedAt);
  if (list.length === 0) return new Map();
  const bySlot = new Map<number, HalfCharge[]>();
  const charges = list
    .map((e, index) => ({ ...e, index }))
    .filter((e) => e.date <= asOf)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index));
  for (const e of charges) {
    const slot = halfSlot(loan, e, overduePeriods);
    const charge: HalfCharge = typeof e.pos === "number"
      ? { date: e.date, index: e.index, pinned: true }
      : { date: e.date, index: e.index };
    const prev = bySlot.get(slot);
    if (prev) prev.push(charge);
    else bySlot.set(slot, [charge]);
  }
  return bySlot;
}

/** Un medio ciclo ubicado en el recorrido, con su identidad para la UI. */
export interface HalfCharge {
  /** Fecha en la que se cobró. */
  date: string;
  /** Índice en `advanceEntries(loan.halfAdvancedAt)`. */
  index: number;
  /** El usuario eligió a mano qué re-vencimiento adelanta. */
  pinned?: boolean;
}

/**
 * El re-vencimiento que adelanta un medio ciclo: el que el usuario fijó con `pos`, o el del
 * ciclo en el que cae su fecha.
 *
 * Un `pos` a mano se topea en 1..N+1, que son los slots que el recorrido cobra. El slot
 * natural se devuelve tal cual, 0 incluido: un medio ciclo fechado antes del vencimiento no
 * se cobra en ningún recorrido, y eso ya era así.
 */
function halfSlot(loan: Loan, e: AdvanceEntry, overduePeriods: number): number {
  if (typeof e.pos !== "number") return extraSlot(loan, e.date, overduePeriods);
  return Math.min(Math.max(e.pos, 1), overduePeriods + 1);
}

/**
 * Fracción que le queda por cobrar al re-vencimiento `slot`: 1 si nadie lo adelantó, 0.5 si
 * ya se cobró un medio ciclo. Topeado en 0 — más de dos medios en un mismo período sólo
 * puede venir de datos viejos o importados, y cobrar negativo sería peor que no cobrar.
 */
export function pendingCycleFraction(halves: ReadonlyMap<number, HalfCharge[]>, slot: number): number {
  return Math.max(0, 1 - HALF * (halves.get(slot)?.length ?? 0));
}

/**
 * Lo que le falta cobrar al PRÓXIMO re-vencimiento, como fracción de un ciclo: 0.5 si ya se
 * le cobró medio al cliente, 1 si no. Lo usan `nextPeriodInterest` y `upcomingInterest`
 * para no volver a prometer el mes entero cuando ya se cobró la mitad.
 */
export function nextCycleFraction(loan: Loan, asOf: string = todayISO()): number {
  if (!loan.dueDate || loan.noDueDate) return 1;
  const periods = overduePeriodsAt(loan, asOf);
  return pendingCycleFraction(halfCyclesBySlot(loan, asOf, periods), periods + 1);
}

/**
 * ¿El período en el que cae `date` ya tiene cobrado su medio ciclo? Dos medios son el ciclo
 * entero y para eso está "Adelantar", así que el reducer rechaza el segundo y la UI apaga
 * el botón. Mira todos los medios registrados, no sólo los anteriores a `date`.
 *
 * Compara el slot EFECTIVO de cada medio ya registrado: uno que el usuario movió a otro
 * re-vencimiento deja libre el período en el que cae su fecha, y uno que movió hasta acá lo
 * ocupa aunque su fecha diga otra cosa.
 */
export function halfCycleCharged(loan: Loan, date: string): boolean {
  if (!loan.dueDate || loan.noDueDate || !date) return false;
  // La base de ciclos tiene que alcanzar para ubicar `date` y los medios ya registrados:
  // `extraSlot` manda al mismo slot abierto todo lo que caiga más allá del último ciclo
  // contado, así que con una base corta dos fechas de períodos distintos se confunden.
  const horizon = [date, todayISO(), ...advanceDates(loan.halfAdvancedAt)]
    .reduce((a, b) => (b && b > a ? b : a), date);
  const periods = overduePeriodsAt(loan, horizon);
  const slot = extraSlot(loan, date, periods);
  return advanceEntries(loan.halfAdvancedAt).some((e) => halfSlot(loan, e, periods) === slot);
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

  // Medios ciclos: se cobran en su propia fecha, sobre el saldo de ese momento, y van
  // antes de los pagos del tramo — el cliente viene, se le cobra la mitad, y recién
  // entonces paga. El re-vencimiento que adelantan cobra después lo que quedaba.
  const halves = halfCyclesBySlot(loan, asOf, overduePeriods);
  const chargeHalves = (slot: number) => {
    for (const half of halves.get(slot) || []) {
      const charge = balance > 0 ? HALF * periodInterest(loan, balance) : 0;
      balance += charge;
      if (charge > 0) accruals.push({ date: half.date, amount: charge });
    }
  };

  chargeHalves(1);
  payments.filter((p) => getPos(p) === 0).forEach((p) => {
    balance = Math.max(0, balance - Number(p.amount));
  });

  // Fecha de cada capitalización: la secuencia de slots que arma `cycleSequence`, la misma
  // que dibuja la línea de tiempo del detalle. Por default los re-vencimientos naturales
  // van primero y los ciclos adelantados al final; un adelanto que el usuario movió de
  // lugar se devenga en el slot que le fijó.
  const sequence = cycleSequence(loan, asOf, overduePeriods);

  for (let i = 1; i <= overduePeriods; i++) {
    const extraCapital = extras.get(i) || 0;
    // El interés se cobra sobre el saldo REAL del ciclo: si el cliente pagó antes del
    // re-vencimiento, se le cobra menos. Calcularlo sobre un saldo sin pagos inflaba el
    // devengado y rompía la identidad deuda = capital + devengado − pagado.
    // Si a este re-vencimiento ya se le cobró medio ciclo por adelantado, acá sólo entra
    // la mitad que quedaba. Media y media hacen el mes completo.
    let interest = balance > 0
      ? pendingCycleFraction(halves, i) * periodInterest(loan, balance)
      : 0;
    interest += extraInterest(extraCapital);
    balance += interest + extraCapital;
    const cycle = sequence[i - 1];
    const date = cycle?.date || loanPeriodDate(loan, loan.dueDate, i);
    // Un adelanto paga un vencimiento que todavía no llegó, así que su devengado queda
    // fechado a futuro. `interestAccruals` lo deja pasar igual: la plata ya entró y el
    // ciclo ya está capitalizado en la deuda — sólo que la ganancia es del mes que cierra.
    if (interest > 0) accruals.push({ date, amount: interest, advanced: !!cycle?.paidAt });
    chargeHalves(i + 1);
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
  // Sin vencimiento no hay slots entre los cuales elegir, así que `pos` acá no significa
  // nada: los adelantos capitalizan al final, en orden de fecha.
  const advances = advanceDates(loan.advancedAt).filter((d) => d <= asOf).sort();
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

/**
 * Fecha a la que se ancla un pago en la línea de tiempo del detalle: la capitalización de
 * su slot, que es el punto donde `debtWalk` lo aplica. El slot 0 cae en el vencimiento (el
 * pago entra después de reconocerse el interés contratado) y el slot N en su
 * re-vencimiento.
 *
 * Es lo que le da sentido al reordenado: un pago se dibuja donde la deuda lo aplica, no en
 * su fecha. Ordenando el slot 0 por la fecha del pago, uno fechado antes del vencimiento
 * se iba al tope de la línea y no quedaba ninguna posición entre el vencimiento y el
 * primer re-vencimiento — las flechas sólo podían mandarlo al principio o al final.
 *
 * Sin ciclos corridos no hay slots entre los cuales elegir y el vencimiento puede ser
 * futuro, así que ahí manda la fecha del pago y la lista se lee cronológica.
 */
export function paymentAnchorDate(loan: Loan, p: Payment, overduePeriods: number): string {
  if (!loan.dueDate || overduePeriods <= 0) return p.date;
  const pos = resolvePaymentPos(p, overduePeriods, loan);
  return pos > 0 ? loanPeriodDate(loan, loan.dueDate, pos) : loan.dueDate;
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
/**
 * Cuándo dejó de estar vivo cada eslabón refinanciado: el día en que arrancó el préstamo
 * que lo reemplazó. Es el único dato que permite resolver una cadena **por fecha**, y sin
 * él la curva de capital miente en los dos sentidos.
 *
 * La fecha sale de `loanDeployedFrom` del sucesor, no de su `startDate` crudo: con los
 * intereses pagos por adelantado un préstamo puede arrancar con fecha futura, y ahí la
 * plata ya estaba en la calle desde el alta.
 *
 * Si un eslabón quedó huérfano (el sucesor se borró), cae en su propia fecha de cierre
 * —el último pago, o el vencimiento si ya pasó— que es la misma convención de
 * `interestAccruals`.
 */
export function refinancedAtByLoan(loans: Loan[]): ReadonlyMap<string, string> {
  const porOrigen = new Map<string, string>();
  for (const l of loans) {
    const origen = l.refinancedFromId;
    if (!origen) continue;
    const desde = loanDeployedFrom(l);
    const previo = porOrigen.get(origen);
    // Con varios sucesores (no debería pasar), vale el más temprano.
    if (!previo || (desde && desde < previo)) porOrigen.set(origen, desde);
  }
  return porOrigen;
}

/** Fecha de cierre propia de un préstamo, sin mirar la cadena. */
function ownCloseDate(loan: Loan): string {
  const today = todayISO();
  const lastPayment = (loan.payments || []).reduce((max, p) => ((p.date || "") > max ? p.date! : max), "");
  return lastPayment || (loan.dueDate && loan.dueDate < today ? loan.dueDate : today);
}

/**
 * Capital desplegado a una fecha. `refinancedAt` es el día en que este préstamo fue
 * reemplazado por otro (ver `refinancedAtByLoan`): hasta ahí su plata estaba en la calle
 * y tiene que verse en la curva; desde ahí la cuenta el sucesor.
 *
 * Mandar a cero un refinanciado para CUALQUIER fecha —como hacía antes— le borraba el
 * capital a toda la historia hacia atrás: un préstamo de $100.000 entregado en mayo y
 * refinanciado en junio desaparecía de mayo, cuando esa plata sí estaba prestada. Y como
 * el sucesor todavía no existía en mayo, no lo cubría nadie: el gráfico mostraba un pozo.
 */
export function loanCapitalAt(loan: Loan, asOf: string, refinancedAt?: string): number {
  if (loan.status === "refinanced" && asOf >= (refinancedAt || ownCloseDate(loan))) return 0;
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
    // Un ciclo adelantado se devenga en el vencimiento que paga, que por definición
    // todavía no llegó. Se cuenta igual —la plata entró y la deuda ya lo capitalizó—, o
    // la identidad `deuda = capital + devengado − pagado` dejaría de cerrar. Sólo mientras
    // el préstamo siga abierto: uno cerrado no tiene ciclos por delante.
    if (!closed && ev.advanced) {
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
 * Interés del ciclo EN CURSO: ya está dentro de la deuda —se cobra por adelantado, igual
 * que al dar de alta el préstamo— pero el devengado todavía no lo reconoce, porque el
 * período no cerró. Es el desfasaje de un ciclo que documenta CLAUDE.md, y el motivo por
 * el que `deuda = capital + devengado − pagado` recién cierra una vez vencido el primero.
 *
 * Sale de la regla, no de restarle cosas a `remainingDebt`: si fuera un residuo, la
 * planilla cerraría siempre y el test que la controla no probaría nada.
 */
export function unaccruedInterest(loan: Loan): number {
  const status = resolveStatus(loan);
  if (status === "paid" || status === "refinanced") return 0;
  const today = todayISO();
  if (loan.noDueDate) {
    // El ciclo en curso cobra sobre todo lo acumulado hasta el último cierre.
    const recognized = interestAccruals(loan).reduce((s, ev) => s + ev.amount, 0);
    return periodInterest(loan, loanPrincipalAt(loan, today) + recognized);
  }
  // Con vencimiento, lo único que la deuda tiene y el devengado no es el interés
  // contratado, mientras la fecha no haya llegado. Ya vencido, todos los ciclos cerrados
  // están reconocidos y no queda nada por fuera.
  return loan.dueDate && loan.dueDate > today ? expectedProfit(loan) : 0;
}

// ── Planilla de cuenta corriente ──────────────────────────────────────────────

/** Qué originó una fila de la planilla. */
export type LedgerKind = "capital" | "interes" | "extra" | "pago";

/** Una fila de la ficha de cuenta corriente del préstamo. Importes brutos (sin `myShare`),
 *  igual que el resto del detalle. */
export interface LedgerRow {
  date: string;
  kind: LedgerKind;
  detalle: string;
  /** Lo que sumó a la deuda. */
  debe: number;
  /** Lo que la bajó. */
  haber: number;
  /** Deuda después de esta fila. */
  saldo: number;
}

/**
 * La historia del préstamo como una ficha de cuenta corriente: capital, intereses,
 * adicionales y pagos en orden, con el saldo corriendo fila por fila.
 *
 * No vuelve a recorrer la deuda: compone lo que ya calculan `interestAccruals`, los
 * adicionales y los pagos. De ahí que el último saldo tenga que dar exactamente
 * `remainingDebt` — es la identidad `deuda = capital vigente + devengado − pagado` escrita
 * línea por línea, y hay un test que la afirma sobre once formas de préstamo. Si alguna vez
 * deja de cerrar, el que está mal es el recorrido, no la planilla.
 *
 * Los pagos se ubican por su slot (`paymentAnchorDate`), igual que la línea de tiempo: un
 * pago reordenado se mueve de lugar acá también.
 */
export function loanLedger(loan: Loan): LedgerRow[] {
  const today = todayISO();
  const base = Number(loan.amount || 0);
  if (!(base > 0)) return [];

  const periods = overduePeriodsAt(loan, today);
  const halfDates = new Set(advanceDates(loan.halfAdvancedAt).filter((d) => d <= today));
  const advDates = new Set(advanceDates(loan.advancedAt).filter((d) => d <= today));

  // `sort` es dónde cae la fila en el recorrido de la deuda; `date` es la fecha que se
  // muestra. Difieren en un pago reordenado: se ubica en el ciclo al que lo imputaron,
  // pero la ficha tiene que seguir diciendo el día en que el cliente trajo la plata.
  type Draft = Omit<LedgerRow, "saldo"> & { sort: string; order: number };
  const rows: Draft[] = [
    { date: loan.startDate, sort: loan.startDate, kind: "capital", detalle: "Capital prestado", debe: base, haber: 0, order: 0 },
  ];

  // Un adicional entregado en el ciclo ABIERTO todavía no cerró su período, así que su
  // interés se cobró por adelantado y no está en el devengado: la fila tiene que mostrar el
  // impacto completo o el saldo no cierra. En los ciclos ya cerrados ese interés sí está
  // dentro del devengado del ciclo, y acá va sólo el capital.
  for (const e of loan.extras || []) {
    const amount = Number(e.amount || 0);
    if (!e.date || e.date > today || !(amount > 0)) continue;
    const abierto = !loan.noDueDate && extraSlot(loan, e.date, periods) === periods + 1;
    rows.push({
      date: e.date,
      sort: e.date,
      kind: "extra",
      detalle: e.note?.trim() || (abierto ? "Capital agregado (con su interés)" : "Capital agregado"),
      debe: abierto ? extraDebtImpact(loan, amount) : amount,
      haber: 0,
      order: 25,
    });
  }

  for (const ev of interestAccruals(loan)) {
    const detalle = loan.noDueDate || ev.date === loan.dueDate
      ? "Interés del período"
      : halfDates.has(ev.date)
        ? "Medio ciclo"
        : advDates.has(ev.date)
          ? "Ciclo adelantado"
          : "Interés por mora";
    rows.push({ date: ev.date, sort: ev.date, kind: "interes", detalle, debe: ev.amount, haber: 0, order: 20 });
  }

  for (const p of loan.payments || []) {
    const amount = Number(p.amount || 0);
    if (!p.date || !(amount > 0)) continue;
    rows.push({
      date: p.date,
      sort: periods > 0 ? paymentAnchorDate(loan, p, periods) : p.date,
      kind: "pago",
      detalle: p.note?.trim() || "Pago recibido",
      debe: 0,
      haber: amount,
      order: 30,
    });
  }

  // El ciclo que todavía no cerró ya está cobrado: va al final, con su nombre, para que el
  // último saldo sea la deuda que muestra el header y no quede plata sin explicar.
  const enCurso = unaccruedInterest(loan);
  if (enCurso > 0) {
    rows.push({
      date: today,
      sort: today,
      kind: "interes",
      detalle: "Interés del ciclo en curso (cobrado por adelantado)",
      debe: enCurso,
      haber: 0,
      order: 40,
    });
  }

  let saldo = 0;
  return rows
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.order - b.order || a.i - b.i))
    .map(({ sort: _sort, order: _order, i: _i, ...r }) => {
      saldo = Math.max(0, saldo + r.debe - r.haber);
      return { ...r, saldo };
    });
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
  // Al primer re-vencimiento de la ventana puede quedarle media fracción nada más, si ya se
  // le cobró medio ciclo al cliente. Los siguientes cobran el ciclo entero.
  let fraction = nextCycleFraction(loan, today);
  for (let guard = 0; nextDate <= until && guard < 64; guard++) {
    const interest = fraction * periodInterest(loan, balance);
    total += interest;
    balance += interest;
    fraction = 1;
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
/**
 * Interés que va a cobrar el próximo re-vencimiento. Si a ese re-vencimiento ya se le cobró
 * medio ciclo (el cliente vino unos días tarde y pagó la mitad), lo que falta es la otra
 * mitad, no el mes entero: el sheet de adelanto, la card y el mapa de vencimientos anuncian
 * lo mismo que la deuda va a cobrar.
 */
export function nextPeriodInterest(loan: Loan): number {
  return fullNextPeriodInterest(loan) * nextCycleFraction(loan);
}

/** El ciclo entero, sin descontar lo que ya se cobró por adelantado. */
function fullNextPeriodInterest(loan: Loan): number {
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

/**
 * La próxima fecha en la que se espera cobrarle a este préstamo.
 *
 * El `dueDate` sólo vale mientras no haya pasado Y no haya corrido ningún ciclo; de ahí en
 * más manda `getNextRenewalDate`. Decidirlo por el ESTADO no alcanza: un préstamo al que le
 * pagaron lo suficiente vuelve a `"active"` (`resolveStatus`) con el vencimiento ya pasado,
 * y anunciar esa fecha es anunciar algo que ya ocurrió. Pasa sobre todo en los
 * refinanciados, donde el umbral para volver a "active" es alto.
 *
 * Es la única definición: la usan el detalle del préstamo y el digest del push (replicada
 * en `_shared/digest.ts`). Cuando cada uno tenía la suya, la notificación anunciaba una
 * fecha distinta de la que mostraba la pantalla — o directamente no anunciaba nada.
 */
export function nextCollectionDate(loan: Loan, asOf: string = todayISO()): string {
  if (!loan.dueDate) return "";
  if (loan.dueDate >= asOf && overduePeriodsAt(loan, asOf) === 0) return loan.dueDate;
  return getNextRenewalDate(loan);
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
