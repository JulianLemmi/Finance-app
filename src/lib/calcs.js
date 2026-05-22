import { PAYMENT_TYPES } from "./constants.js";
import { daysBetween, parseISO, addDays } from "./utils.js";

export function expectedProfit(loan) {
  return (Number(loan.amount) * Number(loan.interestRate)) / 100;
}

export function expectedReturn(loan) {
  return Number(loan.amount) + expectedProfit(loan);
}

export function compoundReturn(loan) {
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (loan.noDueDate) {
    const termDays =
      loan.paymentType === "custom"
        ? Number(loan.customDays) || 30
        : Number(PAYMENT_TYPES[loan.paymentType]?.days) || 30;
    const daysElapsed = Math.max(0, daysBetween(loan.startDate, today));
    const periods = Math.floor(daysElapsed / termDays) + 1;
    return base * Math.pow(1 + rate, periods);
  }

  if (!loan.compoundInterest || !loan.dueDate) return expectedReturn(loan);
  const daysOverdue = daysBetween(loan.dueDate, today);
  if (daysOverdue <= 0) return expectedReturn(loan);
  const termDays = Math.max(1, daysBetween(loan.startDate, loan.dueDate) || 30);
  const overduePeriods = Math.floor(daysOverdue / termDays);
  if (overduePeriods === 0) return expectedReturn(loan);
  return base * Math.pow(1 + rate, 1 + overduePeriods);
}

export function paidAmount(loan) {
  return (loan.payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
}

export function remainingDebt(loan) {
  return Math.max(0, compoundReturn(loan) - paidAmount(loan));
}

export function loanProgress(loan) {
  const total = expectedReturn(loan);
  if (total <= 0) return 0;
  return Math.min(1, paidAmount(loan) / total);
}

export function isOverdue(loan, today = new Date()) {
  if (loan.status === "paid" || loan.status === "refinanced") return false;
  if (loan.noDueDate) return false;
  const due = parseISO(loan.dueDate);
  if (!due) return false;
  return due.getTime() < today.setHours(0, 0, 0, 0);
}

export function daysUntilDue(loan) {
  const due = parseISO(loan.dueDate);
  if (!due) return null;
  return daysBetween(new Date(), due);
}

export function resolveStatus(loan) {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  if (remainingDebt(loan) <= 0.001) return "paid";
  if (isOverdue(loan)) return "overdue";
  return "active";
}

export function compoundPeriods(loan) {
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const periods = [];

  if (loan.noDueDate) {
    const termDays =
      loan.paymentType === "custom"
        ? Number(loan.customDays) || 30
        : Number(PAYMENT_TYPES[loan.paymentType]?.days) || 30;
    const daysElapsed = Math.max(0, daysBetween(loan.startDate, today));
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
  const daysOverdue = daysBetween(loan.dueDate, today);
  if (daysOverdue <= 0) return [];
  const loanTermDays = Math.max(1, daysBetween(loan.startDate, loan.dueDate) || 30);
  const numOverduePeriods = Math.floor(daysOverdue / loanTermDays);
  if (numOverduePeriods === 0) return [];

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
