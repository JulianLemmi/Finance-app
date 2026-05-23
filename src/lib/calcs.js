import { PAYMENT_TYPES } from "./constants.js";
import { daysBetween, parseISO, addDays, todayDate } from "./utils.js";

export function expectedProfit(loan) {
  return (Number(loan.amount) * Number(loan.interestRate)) / 100;
}

export function expectedReturn(loan) {
  return Number(loan.amount) + expectedProfit(loan);
}

// Returns overdue metadata for a loan, or null if not yet overdue / no dueDate.
function getOverdueMeta(loan) {
  if (!loan.dueDate) return null;
  const daysOverdue = daysBetween(loan.dueDate, todayDate());
  if (daysOverdue <= 0) return null;
  const termDays = Math.max(1, daysBetween(loan.startDate, loan.dueDate) || 30);
  const overduePeriods = Math.floor(daysOverdue / termDays);
  return { daysOverdue, termDays, overduePeriods, rate: Number(loan.interestRate) / 100 };
}

// Resolves a payment's effective timeline position.
// Explicit timelinePos (set by user via ▲▼ controls) takes absolute priority;
// otherwise inferred from payment date vs mora period cutoffs.
export function resolvePaymentPos(p, overduePeriods, termDays, dueDate) {
  if (typeof p.timelinePos === "number") return p.timelinePos;
  for (let i = 1; i <= overduePeriods; i++) {
    if (p.date < addDays(dueDate, i * termDays)) return i - 1;
  }
  return overduePeriods;
}

export function compoundReturn(loan) {
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

export function paidAmount(loan) {
  return (loan.payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
}

export function remainingDebt(loan) {
  const payments = loan.payments || [];
  const meta = getOverdueMeta(loan);

  if (!meta || meta.overduePeriods === 0) {
    return Math.max(0, expectedReturn(loan) - paidAmount(loan));
  }

  const { overduePeriods, termDays, rate } = meta;
  const getPos = (p) => resolvePaymentPos(p, overduePeriods, termDays, loan.dueDate);

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

export function loanProgress(loan) {
  const total = expectedReturn(loan);
  if (total <= 0) return 0;
  return Math.min(1, paidAmount(loan) / total);
}

export function isOverdue(loan, today = todayDate()) {
  if (loan.status === "paid" || loan.status === "refinanced") return false;
  if (loan.noDueDate) return false;
  const due = parseISO(loan.dueDate);
  if (!due) return false;
  return due.getTime() < today.getTime();
}

export function daysUntilDue(loan) {
  const due = parseISO(loan.dueDate);
  if (!due) return null;
  return daysBetween(todayDate(), due);
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
  const periods = [];

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
