import { createContext, useContext, useMemo } from "react";
import { EXPENSE_CATEGORIES } from "../lib/constants.js";
import { uid, todayISO, monthKey, getMonthLabel, daysBetween } from "../lib/utils.js";
import {
  resolveStatus, paidAmount, remainingDebt, loanProgress,
  expectedProfit, expectedReturn, compoundReturn, daysUntilDue,
} from "../lib/calcs.js";

export const initialState = {
  loaded: false,
  loans: [],
  clients: [],
  expenses: [],
  income: [],
  history: [],
  assets: [],
  settings: { currency: "$", cashOnHand: 0, hideBalances: false, userName: "" },
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
        ].slice(0, 200),
      };
    case "UPDATE_LOAN":
      return {
        ...state,
        loans: state.loans.map((l) =>
          l.id === action.payload.id ? { ...l, ...action.payload } : l
        ),
      };
    case "DELETE_LOAN":
      return { ...state, loans: state.loans.filter((l) => l.id !== action.payload) };
    case "ADD_PAYMENT": {
      const { loanId, payment } = action.payload;
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
        ].slice(0, 200),
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
  return useMemo(() => {
    const loansResolved = state.loans.map((l) => ({
      ...l,
      _status: resolveStatus(l),
      _paid: paidAmount(l),
      _remaining: remainingDebt(l),
      _profit: expectedProfit(l),
      _return: expectedReturn(l),
      _compoundReturn: compoundReturn(l),
      _progress: loanProgress(l),
      _daysUntilDue: daysUntilDue(l),
    }));

    const activeLoans = loansResolved.filter((l) => l._status === "active");
    const overdueLoans = loansResolved.filter((l) => l._status === "overdue");
    const paidLoans = loansResolved.filter((l) => l._status === "paid");
    const refinancedLoans = loansResolved.filter((l) => l._status === "refinanced");

    const capitalInvested = [...activeLoans, ...overdueLoans].reduce((a, l) => a + Number(l.amount), 0);
    const expectedProfitTotal = [...activeLoans, ...overdueLoans].reduce((a, l) => a + l._profit, 0);
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

    const upcomingDue = [...activeLoans, ...overdueLoans]
      .filter((l) => l._daysUntilDue !== null)
      .sort((a, b) => a._daysUntilDue - b._daysUntilDue)
      .slice(0, 8);

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

    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({ key, label: getMonthLabel(key), income: 0, expense: 0, capital: 0, profit: 0 });
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
    });

    const expenseByCategory = Object.keys(EXPENSE_CATEGORIES)
      .map((k) => ({
        key: k,
        label: EXPENSE_CATEGORIES[k].label,
        color: EXPENSE_CATEGORIES[k].color,
        value: state.expenses.filter((e) => e.category === k).reduce((a, t) => a + Number(t.amount), 0),
      }))
      .filter((c) => c.value > 0);

    const avgRate = activeLoans.length
      ? activeLoans.reduce((a, l) => a + Number(l.interestRate), 0) / activeLoans.length
      : 7;

    const avgDays = activeLoans.length
      ? activeLoans.reduce((a, l) => {
          const days = Math.max(1, daysBetween(l.startDate, l.dueDate) || 30);
          return a + days;
        }, 0) / activeLoans.length
      : 30;

    const reinvestmentFactor = (m) => {
      const cycles = avgDays > 0 ? (m * 30) / avgDays : 0;
      return Math.pow(1 + avgRate / 100, cycles);
    };
    const baseCapital = Math.max(0, totalCapital);
    const projections = {
      m1: baseCapital * reinvestmentFactor(1),
      m3: baseCapital * reinvestmentFactor(3),
      m6: baseCapital * reinvestmentFactor(6),
      y1: baseCapital * reinvestmentFactor(12),
    };

    const projectionSeries = [];
    for (let i = 0; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      projectionSeries.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("es-AR", { month: "short" }),
        value: baseCapital * reinvestmentFactor(i),
      });
    }

    const clientStats = state.clients.map((c) => {
      const cLoans = loansResolved.filter((l) => l.clientId === c.id);
      const active = cLoans.filter((l) => l._status === "active" || l._status === "overdue");
      const debt = active.reduce((a, l) => a + l._remaining, 0);
      const totalGenerated = cLoans
        .filter((l) => l._status === "paid")
        .reduce((a, l) => a + (l._paid - Number(l.amount)), 0);
      const overdueCount = cLoans.filter((l) => l._status === "overdue").length;
      return { ...c, _loans: cLoans, _active: active, _debt: debt, _totalGenerated: totalGenerated, _overdueCount: overdueCount };
    });

    return {
      loansResolved, activeLoans, overdueLoans, paidLoans, refinancedLoans,
      capitalInvested, expectedProfitTotal, accumulatedProfit, collected, available,
      totalCapital, workingCapital, totalAssets, totalIncome, totalExpense,
      monthlyInterestsCollected, upcomingDue, expectedInflow30d, months,
      expenseByCategory, avgRate, avgDays, projections, projectionSeries, clientStats,
      totalExpectedProfit, totalDisbursed, expectedMonthlyProfit, monthlyReturnPct,
    };
  }, [state.loans, state.income, state.expenses, state.settings, state.clients, state.assets]);
}
