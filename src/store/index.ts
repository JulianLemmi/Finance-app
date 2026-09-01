import { createContext, useContext, useMemo } from "react";
import { EXPENSE_CATEGORIES, UI_LIMITS, BUSINESS_RULES } from "../lib/constants.js";
import { uid, todayISO, toISODate, monthKey, getMonthLabel, daysBetween, addDays, getNextRenewalDate, getLoanCycleDays, stripComputed, myShare, loanDeployedFrom } from "../lib/utils.js";
import {
  resolveStatus, paidAmount, remainingDebt, loanProgress,
  expectedProfit, expectedReturn, compoundReturn, nextPeriodInterest, daysUntilDue,
  loanIntegrityErrors, loanCapitalAt, interestAccruals,
} from "../lib/calcs.js";
import type {
  AppState, AppAction, AppContextValue, Derived,
  Loan, Transaction, ResolvedLoan,
} from "../types";

export const initialState: AppState = {
  loaded: false,
  loans: [],
  clients: [],
  expenses: [],
  income: [],
  history: [],
  assets: [],
  cars: [],
  liabilities: [],
  settings: {
    currency: "$", cashOnHand: 0, hideBalances: false, userName: "", theme: "dark",
    defaultRate: 8, defaultDays: 30, mpBalance: 0, telegramChatId: "",
    monthlyTarget: 0, fixedIncomeAmount: 0, fixedIncomeDay: 1,
    dollarAlerts: false, dollarThreshold: 20,
  },
  ui: { activeTab: "home", modal: null },
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        loaded: true,
        // Limpia cualquier campo _* legacy que se hubiera persistido (ver stripComputed).
        loans: action.payload.loans ? action.payload.loans.map(stripComputed) : state.loans,
        clients: action.payload.clients ? action.payload.clients.map(stripComputed) : state.clients,
        expenses: action.payload.expenses ?? state.expenses,
        income: action.payload.income ?? state.income,
        history: action.payload.history ?? state.history,
        assets: action.payload.assets ?? state.assets,
        cars: Array.isArray(action.payload.cars) ? action.payload.cars : state.cars,
        liabilities: Array.isArray(action.payload.liabilities) ? action.payload.liabilities : state.liabilities,
        settings: { ...state.settings, ...(action.payload.settings || {}) },
      };
    case "SET_TAB":
      return { ...state, ui: { ...state.ui, activeTab: action.payload } };
    case "OPEN_MODAL":
      return { ...state, ui: { ...state.ui, modal: action.payload } };
    case "CLOSE_MODAL":
      return { ...state, ui: { ...state.ui, modal: null } };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "ADD_LOAN": {
      const loan: Loan = stripComputed({
        id: uid("loan"),
        payments: [],
        contacts: [],
        createdAt: Date.now(),
        status: "active",
        ...action.payload,
      });
      return {
        ...state,
        loans: [loan, ...state.loans],
        history: [
          {
            id: uid("h"), kind: "loan_created" as const, ref: loan.id,
            label: `Préstamo creado a ${loan.clientName}`,
            amount: loan.amount, date: todayISO(),
          },
          ...state.history,
        ].slice(0, UI_LIMITS.HISTORY_STORE_MAX),
      };
    }
    case "UPDATE_LOAN":
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== action.payload.id) return l;
          const merged: Loan = { ...l, ...action.payload };
          if (merged.startDate && merged.dueDate && merged.dueDate < merged.startDate) {
            console.warn("[UPDATE_LOAN] dueDate < startDate — update rejected", merged.id);
            return l;
          }
          merged.status = resolveStatus(merged);
          return stripComputed(merged);
        }),
      };
    case "DELETE_LOAN":
      return { ...state, loans: state.loans.filter((l) => l.id !== action.payload) };
    case "ADD_CONTACT": {
      const { loanId, contact } = action.payload;
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== loanId) return l;
          return { ...l, contacts: [...(l.contacts || []), contact] };
        }),
      };
    }
    case "DELETE_CONTACT": {
      const { loanId, contactId } = action.payload;
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== loanId) return l;
          return { ...l, contacts: (l.contacts || []).filter((c) => c.id !== contactId) };
        }),
      };
    }
    case "ADD_PAYMENT": {
      const { loanId, payment } = action.payload;
      const exists = state.loans.find((l) => l.id === loanId);
      const amount = Number(payment?.amount);
      if (!exists || !Number.isFinite(amount) || amount <= 0) {
        console.warn("[ADD_PAYMENT] invalid payment — rejected", { loanId, amount });
        return state;
      }
      const newLoans = state.loans.map((l) => {
        if (l.id !== loanId) return l;
        const payments = [...(l.payments || []), payment];
        const next: Loan = { ...l, payments };
        next.status = resolveStatus(next);
        return next;
      });
      const loan = newLoans.find((l) => l.id === loanId);
      return {
        ...state,
        loans: newLoans,
        history: [
          {
            id: uid("h"), kind: "payment_received" as const, ref: loanId,
            label: `Pago recibido de ${loan?.clientName ?? "cliente"}`,
            amount: payment.amount, date: payment.date,
          },
          ...state.history,
        ].slice(0, UI_LIMITS.HISTORY_STORE_MAX),
      };
    }
    case "ADVANCE_CYCLE": {
      const { loanId, date } = action.payload;
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== loanId) return l;
          const advancedAt = [...(l.advancedAt || []), date];
          const next: Loan = { ...l, advancedAt };
          next.status = resolveStatus(next);
          return next;
        }),
      };
    }
    case "UNDO_ADVANCE_CYCLE": {
      const { loanId } = action.payload;
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== loanId) return l;
          const arr = l.advancedAt || [];
          if (arr.length === 0) return l;
          const advancedAt = arr.slice(0, -1);
          const next: Loan = { ...l, advancedAt };
          next.status = resolveStatus(next);
          return next;
        }),
      };
    }
    case "ADD_PARKING_PAYMENT": {
      const { loanId, payment } = action.payload;
      const amount = Number(payment?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        console.warn("[ADD_PARKING_PAYMENT] invalid payment — rejected", { loanId, amount });
        return state;
      }
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== loanId) return l;
          return { ...l, parkingPayments: [...(l.parkingPayments || []), payment] };
        }),
      };
    }
    case "DELETE_PARKING_PAYMENT": {
      const { loanId, paymentId } = action.payload;
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== loanId) return l;
          return { ...l, parkingPayments: (l.parkingPayments || []).filter((p) => p.id !== paymentId) };
        }),
      };
    }
    case "ADD_CLIENT": {
      const client = stripComputed({
        id: uid("client"),
        createdAt: Date.now(),
        riskLevel: "low" as const,
        ...action.payload,
      });
      return { ...state, clients: [client, ...state.clients] };
    }
    case "UPDATE_CLIENT":
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === action.payload.id ? stripComputed({ ...c, ...action.payload }) : c
        ),
      };
    case "DELETE_CLIENT":
      return { ...state, clients: state.clients.filter((c) => c.id !== action.payload) };
    case "ADD_TX": {
      const incoming = action.payload;
      if (incoming.type !== "income" && incoming.type !== "expense") {
        console.warn("[ADD_TX] invalid type — rejected", incoming.type);
        return state;
      }
      const amount = Number(incoming.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        console.warn("[ADD_TX] invalid amount — rejected", incoming.amount);
        return state;
      }
      const tx: Transaction = {
        id: uid("tx"),
        createdAt: Date.now(),
        date: todayISO(),
        category: "otros",
        description: "",
        ...incoming,
        amount,
      };
      if (tx.type === "income") {
        return { ...state, income: [tx, ...state.income] };
      } else {
        return { ...state, expenses: [tx, ...state.expenses] };
      }
    }
    case "DELETE_TX": {
      const { id, type } = action.payload;
      if (type === "income") {
        return { ...state, income: state.income.filter((t) => t.id !== id) };
      } else {
        return { ...state, expenses: state.expenses.filter((t) => t.id !== id) };
      }
    }
    case "ADD_ASSET":
      return { ...state, assets: [action.payload, ...state.assets] };
    case "UPDATE_ASSET":
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      };
    case "DELETE_ASSET":
      return { ...state, assets: state.assets.filter((a) => a.id !== action.payload) };
    case "ADD_CAR":
      return { ...state, cars: [action.payload, ...state.cars] };
    case "UPDATE_CAR":
      return {
        ...state,
        cars: state.cars.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      };
    case "DELETE_CAR":
      return { ...state, cars: state.cars.filter((c) => c.id !== action.payload) };
    case "ADD_LIABILITY":
      return { ...state, liabilities: [action.payload, ...state.liabilities] };
    case "UPDATE_LIABILITY":
      return {
        ...state,
        liabilities: state.liabilities.map((l) =>
          l.id === action.payload.id ? { ...l, ...action.payload } : l
        ),
      };
    case "DELETE_LIABILITY":
      return { ...state, liabilities: state.liabilities.filter((l) => l.id !== action.payload) };
    default:
      return state;
  }
}

export const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppContext.Provider");
  return ctx;
};

// Sueldo fijo virtual aplicable a un mes (YYYY-MM): el monto si la fecha de cobro de ese
// mes ya pasó y el mes no es anterior a la primera actividad registrada; 0 si no aplica.
function salaryForMonth(mKey: string, amount: number, day: number, firstMonth: string, today: string): number {
  if (!(amount > 0) || mKey < firstMonth) return 0;
  const [yr, mo] = mKey.split("-").map(Number);
  const payDay = Math.min(day, new Date(yr, mo, 0).getDate());
  const payDate = `${mKey}-${String(payDay).padStart(2, "0")}`;
  return payDate <= today ? amount : 0;
}

// Suma del sueldo fijo virtual desde el primer mes con actividad hasta el mes actual.
function totalSalary(firstMonth: string, currentMonth: string, amount: number, day: number, today: string): number {
  if (!(amount > 0)) return 0;
  let total = 0;
  let [yr, mo] = firstMonth.split("-").map(Number);
  const [ey, em] = currentMonth.split("-").map(Number);
  while (yr < ey || (yr === ey && mo <= em)) {
    total += salaryForMonth(`${yr}-${String(mo).padStart(2, "0")}`, amount, day, firstMonth, today);
    if (++mo > 12) { mo = 1; yr++; }
  }
  return total;
}

export function useDerived(state: AppState): Derived {
  // Stage 1: resolve each loan's computed fields
  const loansResolved = useMemo<ResolvedLoan[]>(() =>
    state.loans.map((l) => {
      const integrityErrors = loanIntegrityErrors(l);
      return {
        ...l,
        _status: resolveStatus(l),
        _paid: paidAmount(l),
        _remaining: remainingDebt(l),
        _profit: expectedProfit(l),
        _return: expectedReturn(l),
        _compoundReturn: compoundReturn(l),
        _nextProfit: nextPeriodInterest(l),
        _progress: loanProgress(l),
        _daysUntilDue: daysUntilDue(l),
        _invalid: integrityErrors.length > 0,
        _integrityErrors: integrityErrors,
      };
    }),
  [state.loans]);

  // Stage 2: group loans by status
  const loanGroups = useMemo(() => ({
    activeLoans: loansResolved.filter((l) => l._status === "active"),
    overdueLoans: loansResolved.filter((l) => l._status === "overdue"),
    paidLoans: loansResolved.filter((l) => l._status === "paid"),
    refinancedLoans: loansResolved.filter((l) => l._status === "refinanced"),
  }), [loansResolved]);

  // Primera fecha con actividad registrada (préstamo o movimiento). Acota desde cuándo
  // aplica el sueldo fijo virtual para no inventar ingreso en meses previos sin datos.
  const firstActivityISO = useMemo(() => {
    const dates: string[] = [];
    loansResolved.forEach((l) => { if (l.startDate) dates.push(l.startDate); });
    state.income.forEach((t) => { if (t.date) dates.push(t.date); });
    state.expenses.forEach((t) => { if (t.date) dates.push(t.date); });
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : todayISO();
  }, [loansResolved, state.income, state.expenses]);

  // Stage 3: financial aggregates
  const financials = useMemo(() => {
    const { activeLoans, overdueLoans, paidLoans, refinancedLoans } = loanGroups;
    const deployed = [...activeLoans, ...overdueLoans];

    const todayStr = todayISO();

    // Capital invertido: en los atrasados/vencidos la deuda ya capitalizó el interés
    // devengado, así que ese monto entero cuenta como capital realizado. En los activos
    // es el principal prestado, pero acotado a la deuda que aún queda: si ya se cobró más
    // que el interés y se comió principal, el capital baja. En préstamos compartidos se
    // prorratea por `myShare` (0-1): mi capital, mi ganancia, mis pagos. Los números
    // "brutos" (_paid, _remaining, etc.) quedan intactos para la UI del detalle; el share
    // sólo aplica a las métricas globales agregadas.
    //
    // Usa `loanCapitalAt` —la misma función que arma la curva del gráfico— en vez de
    // repetir la fórmula acá. Cuando estaban duplicadas se separaron: esta versión sumaba
    // el monto entero de un préstamo con fecha de inicio futura (todavía no desplegó nada)
    // y la curva no, así que la card y la última barra mostraban números distintos para la
    // misma plata. Compartiendo la función la identidad se cumple por construcción.
    const capitalInvested = loansResolved.reduce(
      (a, l) => a + myShare(l) * loanCapitalAt(l, todayStr),
      0
    );
    // Ganancia esperada (aún no realizada): sólo de los activos. En los vencidos el
    // interés ya se capitalizó dentro de capitalInvested, así que no se vuelve a sumar.
    const expectedProfitTotal = deployed.reduce(
      (a, l) => a + myShare(l) * (l._status === "overdue" ? 0 : Math.max(0, l._remaining - Number(l.amount))),
      0
    );
    // Ganancia que se cobraría en el próximo período de cada préstamo (lo que muestra cada card).
    const nextProfitTotal = deployed.reduce((a, l) => a + myShare(l) * l._nextProfit, 0);
    // "Total generado": lo que produjo la plata prestada, incluidas las refinanciaciones.
    // Un préstamo refinanciado nunca llega a "paid", así que sumando sólo los pagados se
    // perdía el interés de cada eslabón de la cadena: A ($100k) → B ($110k) cobrado en
    // $121k daba $11k de ganancia en vez de $21k. El interés de A no desapareció, se
    // capitalizó dentro del capital de B — y como B mide su ganancia contra SU monto
    // ($110k, que ya lo incluye), sumar el devengado de A cierra la cuenta sin duplicar.
    const accumulatedProfit =
      paidLoans.reduce((a, l) => a + myShare(l) * (l._paid - Number(l.amount)), 0)
      + refinancedLoans.reduce(
        (a, l) => a + myShare(l) * interestAccruals(l).reduce((s, ev) => s + ev.amount, 0),
        0
      );
    const incomeTransactions = state.income.reduce((a, t) => a + Number(t.amount), 0);
    const totalExpense = state.expenses.reduce((a, t) => a + Number(t.amount), 0);
    const totalDisbursed = loansResolved
      .filter((l) => !l.refinancedFromId)
      .reduce((a, l) => a + myShare(l) * Number(l.amount), 0);
    const available = Number(state.settings.cashOnHand || 0);
    const totalAssets = state.assets.reduce((a, asset) => a + Number(asset.value || 0), 0);
    // Deudas propias (ej: plata que le debo a mi papá): lo adeudado es el monto original
    // menos lo ya pagado, nunca negativo. Sólo resta del capital total, no afecta el flujo.
    const totalLiabilities = state.liabilities.reduce((a, l) => {
      const paid = (l.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      return a + Math.max(0, Number(l.amount || 0) - paid);
    }, 0);
    const workingCapital = available + capitalInvested;
    const totalCapital = workingCapital + totalAssets - totalLiabilities;

    const thisMonth = monthKey(todayStr);

    // Sueldo fijo virtual: del mes en curso (para "Ganancia mensual") y total acumulado
    // desde la primera actividad (para los totales de Ingresos/Balance).
    const fixedAmt = Number(state.settings.fixedIncomeAmount || 0);
    const fixedDay = Math.min(31, Math.max(1, Number(state.settings.fixedIncomeDay || 1)));
    const firstMonth = firstActivityISO.slice(0, 7);
    const fixedIncomeThisMonth = salaryForMonth(thisMonth, fixedAmt, fixedDay, firstMonth, todayStr);
    const totalIncome = incomeTransactions + totalSalary(firstMonth, thisMonth, fixedAmt, fixedDay, todayStr);

    const monthlyInterestsCollected = loansResolved.reduce((a, l) => {
      const monthPayments = (l.payments || []).filter((p) => monthKey(p.date) === thisMonth);
      const margin = l._return > 0 ? l._profit / l._return : 0;
      return a + myShare(l) * monthPayments.reduce((s, p) => s + Number(p.amount), 0) * margin;
    }, 0);

    const collectedThisMonth = loansResolved.reduce((a, l) =>
      a + myShare(l) * (l.payments || [])
        .filter((p) => monthKey(p.date) === thisMonth)
        .reduce((s, p) => s + Number(p.amount), 0),
    0);

    // Agenda: lo que hay que ir a cobrar. Los archivados quedan afuera de los avisos
    // —archivar es justamente sacarlos de la vista— pero siguen contando entero en las
    // métricas (capital, devengado, ganancia). Por eso se filtra acá y no en `deployed`.
    const agenda = deployed.filter((l) => !l.archived);

    const upcomingDue = agenda
      .filter((l) => l._daysUntilDue !== null)
      .sort((a, b) => (a._daysUntilDue as number) - (b._daysUntilDue as number))
      .slice(0, UI_LIMITS.UPCOMING_DUE_MAX);

    const dueTodayTomorrow = agenda
      .filter((l) => l._daysUntilDue !== null && l._daysUntilDue >= 0 && l._daysUntilDue <= 1)
      .sort((a, b) => (a._daysUntilDue as number) - (b._daysUntilDue as number));

    type ExpCatKey = keyof typeof EXPENSE_CATEGORIES;
    const expenseByCategory = (Object.keys(EXPENSE_CATEGORIES) as ExpCatKey[])
      .map((k) => ({
        key: k,
        label: EXPENSE_CATEGORIES[k].label as string,
        color: EXPENSE_CATEGORIES[k].color as string,
        value: state.expenses
          .filter((e) => e.category === k)
          .reduce((a, t) => a + Number(t.amount), 0),
      }))
      .filter((c) => c.value > 0);

    const median = (arr: number[]): number => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const rates = activeLoans.map((l) => Number(l.interestRate)).filter(Number.isFinite);
    // Plazo del ciclo, no la distancia cruda entre fechas: un préstamo "30 días" que cae
    // en un mes de 31 debe contar 30 (mismo criterio que getNextRenewalDate y la mora).
    const terms = activeLoans.map((l) => Math.max(1, getLoanCycleDays(l) || BUSINESS_RULES.DEFAULT_LOAN_DAYS));

    const avgRate = rates.length ? rates.reduce((a, r) => a + r, 0) / rates.length : 0;
    const medianRate = median(rates);
    const medianDays = terms.length ? median(terms) : BUSINESS_RULES.DEFAULT_LOAN_DAYS;

    const paidOnTimeCount = paidLoans.filter((l) => {
      const sorted = [...(l.payments || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
      return sorted.length > 0 && sorted[0].date <= l.dueDate;
    }).length;
    const collectabilityRate = paidLoans.length > 0 ? paidOnTimeCount / paidLoans.length : null;

    const avgDaysLate =
      overdueLoans.length > 0
        ? overdueLoans.reduce((s, l) => s + Math.max(0, daysBetween(l.dueDate, todayStr)), 0) /
          overdueLoans.length
        : 0;

    // Flujo de caja de los próximos 30 días. Cada préstamo aporta su deuda en UNA sola
    // fecha (sumarla en dos días distintos contaría la misma plata dos veces): los activos
    // en su vencimiento; los atrasados en su próximo re-vencimiento, salvo que venzan hoy
    // mismo (día 0 de atraso), en cuyo caso se cobra hoy. Sin incluir los re-vencimientos
    // este gráfico contradecía al mapa de vencimientos, que sí los muestra.
    const cashFlow30d = Array.from({ length: 30 }, (_, i) => {
      const dateStr = addDays(todayStr, i);
      return {
        day: i,
        date: dateStr,
        expected: 0,
        count: 0,
        label: i === 0 ? "Hoy" : i % 7 === 0 ? `+${i}d` : "",
      };
    });
    const cashFlowIdx = new Map(cashFlow30d.map((d, i) => [d.date, i]));
    const addInflow = (dateStr: string, loan: ResolvedLoan) => {
      const i = cashFlowIdx.get(dateStr);
      if (i === undefined) return;
      cashFlow30d[i].expected += myShare(loan) * loan._remaining;
      cashFlow30d[i].count += 1;
    };
    // Mismo criterio que el resto de la agenda: un archivado no entra al flujo previsto.
    agenda.filter((l) => l._status === "active").forEach((l) => addInflow(l.dueDate, l));
    agenda.filter((l) => l._status === "overdue")
      .forEach((l) => addInflow(l.dueDate === todayStr ? l.dueDate : getNextRenewalDate(l), l));

    return {
      capitalInvested, expectedProfitTotal, nextProfitTotal, accumulatedProfit,
      totalIncome, totalExpense, totalDisbursed, available, totalAssets,
      totalLiabilities, workingCapital, totalCapital, monthlyInterestsCollected, collectedThisMonth,
      fixedIncomeThisMonth,
      upcomingDue, dueTodayTomorrow, expenseByCategory,
      avgRate, medianRate, medianDays, paidOnTimeCount,
      collectabilityRate, avgDaysLate, cashFlow30d,
    };
  }, [loanGroups, loansResolved, firstActivityISO, state.income, state.expenses, state.settings, state.assets, state.liabilities]);

  // Stage 4: monthly chart data
  const chartData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; income: number; expense: number; capital: number; capitalInvested: number; accrued: number; salary: number; monthGain: number; roi: number }[] = [];
    for (let i = BUSINESS_RULES.CHART_HISTORY_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({ key, label: getMonthLabel(key), income: 0, expense: 0, capital: 0, capitalInvested: 0, accrued: 0, salary: 0, monthGain: 0, roi: 0 });
    }
    const monthIdx: Record<string, number> = Object.fromEntries(months.map((m, i) => [m.key, i]));
    state.income.forEach((t) => {
      const i = monthIdx[monthKey(t.date)];
      if (i !== undefined) months[i].income += Number(t.amount);
    });
    state.expenses.forEach((t) => {
      const i = monthIdx[monthKey(t.date)];
      if (i !== undefined) months[i].expense += Number(t.amount);
    });
    // Sueldo fijo virtual: se suma al ingreso de cada mes (desde la primera actividad y
    // sólo si la fecha de cobro ya pasó). No crea transacción ni afecta el efectivo.
    const fixedAmt = Number(state.settings.fixedIncomeAmount || 0);
    if (fixedAmt > 0) {
      const fixedDay = Math.min(31, Math.max(1, Number(state.settings.fixedIncomeDay || 1)));
      const todayStr = todayISO();
      const firstMonth = firstActivityISO.slice(0, 7);
      months.forEach((m) => {
        // `salary` queda separado (gráfico "Mes actual" = interés + sueldo, sin
        // transacciones); `income` lo sigue incluyendo para el flujo/balance de Finanzas.
        const s = salaryForMonth(m.key, fixedAmt, fixedDay, firstMonth, todayStr);
        m.salary = s;
        m.income += s;
      });
    }
    loansResolved.forEach((l) => {
      // accrued: interés devengado por vencimiento/re-vencimiento, lo paguen o no.
      // Es el rendimiento económico real del mes y alimenta el ROI histórico.
      // Prorrateado por mi share en préstamos compartidos.
      const share = myShare(l);
      interestAccruals(l).forEach((ev) => {
        const i = monthIdx[monthKey(ev.date)];
        if (i !== undefined) months[i].accrued += share * ev.amount;
      });
    });
    const today = todayISO();
    const totalAssets = state.assets.reduce((a, asset) => a + Number(asset.value || 0), 0);
    const totalLiabilities = state.liabilities.reduce((a, l) => {
      const paid = (l.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      return a + Math.max(0, Number(l.amount || 0) - paid);
    }, 0);
    months.forEach((m) => {
      const [yr, mo] = m.key.split("-").map(Number);
      // toISODate y no toISOString: el último día del mes se construye en hora local y
      // convertirlo a UTC lo correría un día en zonas UTC+.
      const monthEnd = toISODate(new Date(yr, mo, 0));
      // Para el mes en curso no proyectamos a fin de mes: cortamos en hoy, así el
      // último punto coincide con el capital invertido actual del header.
      const cutoff = monthEnd > today ? today : monthEnd;
      const investedAtMonth = loansResolved
        .filter((l) => {
          // Mismo criterio que `loanCapitalAt`: la plata puede estar prestada aunque
          // startDate sea futuro (cliente con los intereses pagos por adelantado).
          if (loanDeployedFrom(l) > cutoff) return false;
          const paidUpTo = (l.payments || [])
            .filter((p) => p.date <= cutoff)
            .reduce((s, p) => s + Number(p.amount), 0);
          return paidUpTo < expectedReturn(l);
        })
        .reduce((acc, l) => acc + myShare(l) * Number(l.amount), 0);
      // Capital de la curva: incluye el interés capitalizado por vencimientos y
      // re-vencimientos acumulados a esa fecha (no sólo el principal prestado).
      const capitalAtMonth = loansResolved
        .reduce((acc, l) => acc + myShare(l) * loanCapitalAt(l, cutoff), 0);
      m.capitalInvested = capitalAtMonth;
      // Capital total de la curva: efectivo + invertido + activos - pasivos (igual que
      // totalCapital del header). Activos y pasivos se aplican a todos los meses por igual
      // (no tienen histórico por fecha).
      m.capital = Number(state.settings.cashOnHand || 0) + capitalAtMonth + totalAssets - totalLiabilities;
      // ROI del mes: interés devengado (lo acumulado por vencimientos) sobre el capital
      // desplegado, tomado como base. Refleja el rendimiento real, se cobre o no.
      m.roi = investedAtMonth > 0 ? (m.accrued / investedAtMonth) * 100 : 0;
      // Ganancia del mes para el gráfico "Mes actual": interés devengado + sueldo fijo.
      m.monthGain = m.accrued + m.salary;
    });
    return { months };
  }, [loansResolved, firstActivityISO, state.income, state.expenses, state.settings, state.assets, state.liabilities]);

  // Stage 5: client stats
  const clientStats = useMemo(() =>
    state.clients.map((c) => {
      const cLoans = loansResolved.filter((l) => l.clientId === c.id);
      const active = cLoans.filter((l) => l._status === "active" || l._status === "overdue");
      // La deuda del cliente y las ganancias generadas se prorratean por mi share:
      // reflejan mi exposición y mi ganancia, no la deuda total del cliente.
      const debt = active.reduce((a, l) => a + myShare(l) * l._remaining, 0);
      const totalGenerated = cLoans
        .filter((l) => l._status === "paid")
        .reduce((a, l) => a + myShare(l) * (l._paid - Number(l.amount)), 0);
      const overdueCount = cLoans.filter((l) => l._status === "overdue").length;
      return { ...c, _loans: cLoans, _active: active, _debt: debt, _totalGenerated: totalGenerated, _overdueCount: overdueCount };
    }),
  [state.clients, loansResolved]);

  return useMemo<Derived>(() => ({
    loansResolved,
    ...loanGroups,
    ...financials,
    ...chartData,
    clientStats,
  }), [loansResolved, loanGroups, financials, chartData, clientStats]);
}
