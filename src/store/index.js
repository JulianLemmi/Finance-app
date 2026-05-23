import { createContext, useContext, useMemo } from "react";
import { EXPENSE_CATEGORIES, UI_LIMITS, BUSINESS_RULES } from "../lib/constants.js";
import { uid, todayISO, monthKey, getMonthLabel, daysBetween, addDays } from "../lib/utils.js";
import {
  resolveStatus, paidAmount, remainingDebt, loanProgress,
  expectedProfit, expectedReturn, compoundReturn, daysUntilDue,
  loanIntegrityErrors,
} from "../lib/calcs.js";

export const initialState = {
  loaded: false,
  loans: [],
  clients: [],
  expenses: [],
  income: [],
  history: [],
  assets: [],
  settings: {
    currency: "$", cashOnHand: 0, hideBalances: false, userName: "", theme: "dark",
    defaultRate: 8, defaultDays: 30,
  },
  ui: { activeTab: "home", modal: null },
};

export function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        loaded: true,
        loans: action.payload.loans ?? state.loans,
        clients: action.payload.clients ?? state.clients,
        expenses: action.payload.expenses ?? state.expenses,
        income: action.payload.income ?? state.income,
        history: action.payload.history ?? state.history,
        assets: action.payload.assets ?? state.assets,
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
    case "ADD_LOAN":
      return {
        ...state,
        loans: [action.payload, ...state.loans],
        history: [
          {
            id: uid("h"), kind: "loan_created", ref: action.payload.id,
            label: `Préstamo creado a ${action.payload.clientName}`,
            amount: action.payload.amount, date: todayISO(),
          },
          ...state.history,
        ].slice(0, UI_LIMITS.HISTORY_STORE_MAX),
      };
    case "UPDATE_LOAN":
      return {
        ...state,
        loans: state.loans.map((l) => {
          if (l.id !== action.payload.id) return l;
          const merged = { ...l, ...action.payload };
          // Reject corrupting updates: dueDate must not precede startDate
          if (merged.startDate && merged.dueDate && merged.dueDate < merged.startDate) {
            console.warn("[UPDATE_LOAN] dueDate < startDate — update rejected", merged.id);
            return l;
          }
          return merged;
        }),
      };
    case "DELETE_LOAN":
      return { ...state, loans: state.loans.filter((l) => l.id !== action.payload) };
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
        const next = { ...l, payments };
        next.status = resolveStatus(next);
        return next;
      });
      const loan = newLoans.find((l) => l.id === loanId);
      return {
        ...state,
        loans: newLoans,
        history: [
          {
            id: uid("h"), kind: "payment_received", ref: loanId,
            label: `Pago recibido de ${loan?.clientName ?? "cliente"}`,
            amount: payment.amount, date: payment.date,
          },
          ...state.history,
        ].slice(0, UI_LIMITS.HISTORY_STORE_MAX),
      };
    }
    case "ADD_CLIENT":
      return { ...state, clients: [action.payload, ...state.clients] };
    case "UPDATE_CLIENT":
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      };
    case "DELETE_CLIENT":
      return { ...state, clients: state.clients.filter((c) => c.id !== action.payload) };
    case "ADD_TX": {
      const tx = action.payload;
      const key = tx.type === "income" ? "income" : "expenses";
      return { ...state, [key]: [tx, ...state[key]] };
    }
    case "DELETE_TX": {
      const { id, type } = action.payload;
      const key = type === "income" ? "income" : "expenses";
      return { ...state, [key]: state[key].filter((t) => t.id !== id) };
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
    default:
      return state;
  }
}

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function useDerived(state) {
  // Stage 1: resolve each loan's computed fields — reruns only when loans change
  const loansResolved = useMemo(() =>
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
        _progress: loanProgress(l),
        _daysUntilDue: daysUntilDue(l),
        _invalid: integrityErrors.length > 0,
        _integrityErrors: integrityErrors,
      };
    }),
  [state.loans]);

  // Stage 2: group loans by status — reruns only when loansResolved changes
  const loanGroups = useMemo(() => ({
    activeLoans: loansResolved.filter((l) => l._status === "active"),
    overdueLoans: loansResolved.filter((l) => l._status === "overdue"),
    paidLoans: loansResolved.filter((l) => l._status === "paid"),
    refinancedLoans: loansResolved.filter((l) => l._status === "refinanced"),
  }), [loansResolved]);

  // Stage 3: financial aggregates — reruns when loans/income/expenses/settings/assets change
  const financials = useMemo(() => {
    const { activeLoans, overdueLoans, paidLoans } = loanGroups;
    const deployed = [...activeLoans, ...overdueLoans];

    const capitalInvested = deployed.reduce((a, l) => a + Number(l.amount), 0);
    const expectedProfitTotal = deployed.reduce((a, l) => a + l._profit, 0);
    const totalExpectedProfit = loansResolved.reduce((a, l) => a + l._profit, 0);
    const accumulatedProfit = paidLoans.reduce((a, l) => a + (l._paid - Number(l.amount)), 0);
    const totalIncome = state.income.reduce((a, t) => a + Number(t.amount), 0);
    const totalExpense = state.expenses.reduce((a, t) => a + Number(t.amount), 0);
    const collected = loansResolved.reduce((a, l) => a + l._paid, 0);
    const totalDisbursed = loansResolved.filter((l) => !l.refinancedFromId).reduce((a, l) => a + Number(l.amount), 0);
    const available = Number(state.settings.cashOnHand || 0);
    const totalAssets = state.assets.reduce((a, asset) => a + Number(asset.value || 0), 0);
    const workingCapital = available + capitalInvested;
    const totalCapital = workingCapital + totalAssets;

    const thisMonth = monthKey(todayISO());
    const monthlyInterestsCollected = loansResolved.reduce((a, l) => {
      const monthPayments = (l.payments || []).filter((p) => monthKey(p.date) === thisMonth);
      const margin = l._return > 0 ? l._profit / l._return : 0;
      return a + monthPayments.reduce((s, p) => s + Number(p.amount), 0) * margin;
    }, 0);

    const upcomingDue = deployed
      .filter((l) => l._daysUntilDue !== null)
      .sort((a, b) => a._daysUntilDue - b._daysUntilDue)
      .slice(0, UI_LIMITS.UPCOMING_DUE_MAX);

    const expectedInflow30d = activeLoans
      .filter((l) => l._daysUntilDue !== null && l._daysUntilDue <= 30)
      .reduce((a, l) => a + l._remaining, 0);

    const expectedMonthlyProfit = activeLoans
      .filter((l) => l._daysUntilDue !== null && l._daysUntilDue <= 30 && l._daysUntilDue >= 0)
      .reduce((a, l) => {
        const profitRatio = l._return > 0 ? l._profit / l._return : 0;
        return a + l._remaining * profitRatio;
      }, 0);

    const monthlyReturnPct = totalCapital > 0 ? (expectedMonthlyProfit / totalCapital) * 100 : 0;

    const expenseByCategory = Object.keys(EXPENSE_CATEGORIES)
      .map((k) => ({
        key: k,
        label: EXPENSE_CATEGORIES[k].label,
        color: EXPENSE_CATEGORIES[k].color,
        value: state.expenses.filter((e) => e.category === k).reduce((a, t) => a + Number(t.amount), 0),
      }))
      .filter((c) => c.value > 0);

    const median = (arr) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const rates = activeLoans.map((l) => Number(l.interestRate)).filter(Number.isFinite);
    const terms = activeLoans
      .map((l) => Math.max(1, daysBetween(l.startDate, l.dueDate) || BUSINESS_RULES.DEFAULT_LOAN_DAYS));

    // avgRate falls back to 0 (not 7) when no active loans; UI should treat 0 as "no data"
    const avgRate = rates.length ? rates.reduce((a, r) => a + r, 0) / rates.length : 0;
    const medianRate = median(rates);
    const avgDays = terms.length ? terms.reduce((a, t) => a + t, 0) / terms.length : BUSINESS_RULES.DEFAULT_LOAN_DAYS;
    const medianDays = terms.length ? median(terms) : BUSINESS_RULES.DEFAULT_LOAN_DAYS;

    const reinvestmentFactor = (m) => {
      const cycles = avgDays > 0 ? (m * 30) / avgDays : 0;
      return Math.pow(1 + avgRate / 100, cycles);
    };
    const baseCapital = Math.max(0, totalCapital);
    const now = new Date();
    const projections = {
      m1: baseCapital * reinvestmentFactor(1),
      m3: baseCapital * reinvestmentFactor(3),
      m6: baseCapital * reinvestmentFactor(6),
      y1: baseCapital * reinvestmentFactor(12),
    };
    const projectionSeries = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return {
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("es-AR", { month: "short" }),
        value: baseCapital * reinvestmentFactor(i),
      };
    });

    const todayStr = todayISO();
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

    const cashFlow30d = Array.from({ length: 30 }, (_, i) => {
      const dateStr = addDays(todayStr, i);
      const dueLoans = deployed.filter((l) => l.dueDate === dateStr);
      return {
        day: i,
        date: dateStr,
        expected: dueLoans.reduce((a, l) => a + l._remaining, 0),
        count: dueLoans.length,
        label: i === 0 ? "Hoy" : i % 7 === 0 ? `+${i}d` : "",
      };
    });

    return {
      capitalInvested, expectedProfitTotal, totalExpectedProfit, accumulatedProfit,
      totalIncome, totalExpense, collected, totalDisbursed, available, totalAssets,
      workingCapital, totalCapital, monthlyInterestsCollected, upcomingDue,
      expectedInflow30d, expectedMonthlyProfit, monthlyReturnPct, expenseByCategory,
      avgRate, avgDays, medianRate, medianDays,
      projections, projectionSeries, paidOnTimeCount,
      collectabilityRate, avgDaysLate, cashFlow30d,
    };
  }, [loanGroups, loansResolved, state.income, state.expenses, state.settings, state.assets]);

  // Stage 4: monthly chart data — reruns when loans, income or expenses change
  const chartData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = BUSINESS_RULES.CHART_HISTORY_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({ key, label: getMonthLabel(key), income: 0, expense: 0, capital: 0, profit: 0, roi: 0 });
    }
    const monthIdx = Object.fromEntries(months.map((m, i) => [m.key, i]));
    state.income.forEach((t) => {
      const i = monthIdx[monthKey(t.date)];
      if (i !== undefined) months[i].income += Number(t.amount);
    });
    state.expenses.forEach((t) => {
      const i = monthIdx[monthKey(t.date)];
      if (i !== undefined) months[i].expense += Number(t.amount);
    });
    loansResolved.forEach((l) => {
      const margin = l._return > 0 ? l._profit / l._return : 0;
      (l.payments || []).forEach((p) => {
        const i = monthIdx[monthKey(p.date)];
        if (i !== undefined) months[i].profit += Number(p.amount) * margin;
      });
    });
    months.forEach((m) => {
      const [yr, mo] = m.key.split("-").map(Number);
      const cutoff = new Date(yr, mo, 0).toISOString().slice(0, 10);
      const investedAtMonth = loansResolved
        .filter((l) => {
          if (l.startDate > cutoff) return false;
          const paidUpTo = (l.payments || [])
            .filter((p) => p.date <= cutoff)
            .reduce((s, p) => s + Number(p.amount), 0);
          return paidUpTo < expectedReturn(l);
        })
        .reduce((acc, l) => acc + Number(l.amount), 0);
      m.capital = Number(state.settings.cashOnHand || 0) + investedAtMonth;
      // ROI % = monthly profit / capital deployed that month
      m.roi = investedAtMonth > 0 ? (m.profit / investedAtMonth) * 100 : 0;
    });
    return { months };
  }, [loansResolved, state.income, state.expenses, state.settings]);

  // Stage 5: client stats — reruns only when clients or loans change
  const clientStats = useMemo(() =>
    state.clients.map((c) => {
      const cLoans = loansResolved.filter((l) => l.clientId === c.id);
      const active = cLoans.filter((l) => l._status === "active" || l._status === "overdue");
      const debt = active.reduce((a, l) => a + l._remaining, 0);
      const totalGenerated = cLoans
        .filter((l) => l._status === "paid")
        .reduce((a, l) => a + (l._paid - Number(l.amount)), 0);
      const overdueCount = cLoans.filter((l) => l._status === "overdue").length;
      return { ...c, _loans: cLoans, _active: active, _debt: debt, _totalGenerated: totalGenerated, _overdueCount: overdueCount };
    }),
  [state.clients, loansResolved]);

  return useMemo(() => ({
    loansResolved,
    ...loanGroups,
    ...financials,
    ...chartData,
    clientStats,
  }), [loansResolved, loanGroups, financials, chartData, clientStats]);
}
