import React, {
  useReducer,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import {
  Home as HomeIcon,
  Wallet,
  Users,
  TrendingUp,
  User as UserIcon,
  Plus,
  X,
  Search,
  Calendar,
  AlertCircle,
  Check,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Bell,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Car,
  Coins,
  Package,
  Fuel,
  UtensilsCrossed,
  Dumbbell,
  ShoppingBag,
  Wrench,
  MoreHorizontal,
  Clock,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Filter,
  FileText,
  RefreshCw,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Target,
  Banknote,
  Receipt,
  Activity,
  Briefcase,
  Settings as SettingsIcon,
  Phone,
  Hash,
  Tag,
  PieChart as PieChartIcon,
  BarChart3,
  Layers,
  ChevronDown,
  PlusCircle,
  MinusCircle,
  HelpCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@supabase/supabase-js";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Cliente Supabase                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_READY =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR_ANON_KEY");

const supabase = SUPABASE_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Constantes                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEYS = {
  loans: "finance:loans",
  clients: "finance:clients",
  expenses: "finance:expenses",
  income: "finance:income",
  history: "finance:history",
  settings: "finance:settings",
};

const LOAN_STATUSES = {
  active: { label: "Activo", tone: "neutral" },
  paid: { label: "Pagado", tone: "success" },
  overdue: { label: "Atrasado", tone: "danger" },
  refinanced: { label: "Refinanciado", tone: "warning" },
};

const GUARANTY_TYPES = {
  cash: { label: "Efectivo", Icon: Banknote },
  vehicle: { label: "Vehículo", Icon: Car },
  gold: { label: "Oro", Icon: Coins },
  object: { label: "Objeto", Icon: Package },
  other: { label: "Otro", Icon: MoreHorizontal },
};

const PAYMENT_TYPES = {
  "15": { label: "15 días", days: 15 },
  "30": { label: "30 días", days: 30 },
  custom: { label: "Personalizado", days: null },
};

const EXPENSE_CATEGORIES = {
  combustible: { label: "Combustible", Icon: Fuel, color: "#d97706" },
  comida: { label: "Comida", Icon: UtensilsCrossed, color: "#dc2626" },
  gimnasio: { label: "Gimnasio", Icon: Dumbbell, color: "#7c3aed" },
  inversiones: { label: "Inversiones", Icon: TrendingUp, color: "#059669" },
  ocio: { label: "Ocio", Icon: ShoppingBag, color: "#db2777" },
  herramientas: { label: "Herramientas", Icon: Wrench, color: "#4f46e5" },
  transporte: { label: "Transporte", Icon: Car, color: "#0891b2" },
  otros: { label: "Otros", Icon: MoreHorizontal, color: "#71717a" },
};

const INCOME_CATEGORIES = {
  intereses: { label: "Intereses", color: "#10b981" },
  capital: { label: "Capital", color: "#0ea5e9" },
  retorno: { label: "Retorno", color: "#8b5cf6" },
  otros: { label: "Otros", color: "#71717a" },
};

const RISK_LEVELS = {
  low: { label: "Bajo", tone: "success" },
  medium: { label: "Medio", tone: "warning" },
  high: { label: "Alto", tone: "danger" },
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Almacenamiento (window.storage, shared:false)                             */
/* ────────────────────────────────────────────────────────────────────────── */

async function getCurrentUserId() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

const storage = {
  async getAll(keys) {
    if (supabase) {
      try {
        const userId = await getCurrentUserId();
        if (!userId) return {};
        const { data, error } = await supabase
          .from("user_data")
          .select("key, value")
          .eq("user_id", userId)
          .in("key", keys);
        if (error) {
          console.warn("supabase getAll", error);
          return {};
        }
        return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      } catch (e) {
        console.warn("storage.getAll error", e);
        return {};
      }
    }
    if (typeof window !== "undefined" && window.storage?.get) {
      try {
        const entries = await Promise.all(
          keys.map(async (k) => {
            try {
              return [k, await window.storage.get(k, { shared: false })];
            } catch {
              return [k, null];
            }
          })
        );
        return Object.fromEntries(entries);
      } catch {}
    }
    const out = {};
    keys.forEach((k) => {
      try {
        const raw = localStorage.getItem(k);
        out[k] = raw ? JSON.parse(raw) : null;
      } catch {
        out[k] = null;
      }
    });
    return out;
  },

  async set(key, value) {
    if (supabase) {
      try {
        const userId = await getCurrentUserId();
        if (!userId) return;
        const { error } = await supabase.from("user_data").upsert(
          {
            user_id: userId,
            key,
            value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,key" }
        );
        if (error) console.warn(`supabase set ${key}`, error);
      } catch (e) {
        console.warn(`storage.set(${key}) error`, e);
      }
      return;
    }
    if (typeof window !== "undefined" && window.storage?.set) {
      try {
        await window.storage.set(key, value, { shared: false });
        return;
      } catch {}
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Utilidades                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

const addDays = (isoDate, days) => {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const parseISO = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? null : d;
};

const daysBetween = (a, b) => {
  const da = typeof a === "string" ? parseISO(a) : a;
  const db = typeof b === "string" ? parseISO(b) : b;
  if (!da || !db) return 0;
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / 86400000);
};

const monthKey = (iso) => (iso || "").slice(0, 7);

const formatMoney = (value, hidden = false, currency = "$") => {
  if (hidden) return "••••••";
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${sign}${currency}${formatted}`;
};

const formatDate = (iso) => {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatShortDate = (iso) => {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

const getMonthLabel = (iso) => {
  const d = parseISO(iso + "-01");
  if (!d) return iso;
  return d.toLocaleDateString("es-AR", { month: "short" });
};

/* ───── Cálculos de préstamos ───── */

function expectedProfit(loan) {
  return (Number(loan.amount) * Number(loan.interestRate)) / 100;
}

function expectedReturn(loan) {
  return Number(loan.amount) + expectedProfit(loan);
}

function compoundReturn(loan) {
  const rate = Number(loan.interestRate) / 100;
  const base = Number(loan.amount);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (loan.noDueDate) {
    const termDays = loan.paymentType === "custom"
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

function paidAmount(loan) {
  return (loan.payments || []).reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0
  );
}

function remainingDebt(loan) {
  return Math.max(0, compoundReturn(loan) - paidAmount(loan));
}

function loanProgress(loan) {
  const total = expectedReturn(loan);
  if (total <= 0) return 0;
  return Math.min(1, paidAmount(loan) / total);
}

function isOverdue(loan, today = new Date()) {
  if (loan.status === "paid" || loan.status === "refinanced") return false;
  if (loan.noDueDate) return false;
  const due = parseISO(loan.dueDate);
  if (!due) return false;
  return due.getTime() < today.setHours(0, 0, 0, 0);
}

function daysUntilDue(loan) {
  const due = parseISO(loan.dueDate);
  if (!due) return null;
  return daysBetween(new Date(), due);
}

function resolveStatus(loan) {
  if (loan.status === "paid" || loan.status === "refinanced") return loan.status;
  if (remainingDebt(loan) <= 0.001) return "paid";
  if (isOverdue(loan)) return "overdue";
  return "active";
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Estado global                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

const initialState = {
  loaded: false,
  loans: [],
  clients: [],
  expenses: [],
  income: [],
  history: [],
  settings: {
    currency: "$",
    initialCapital: 0,
    hideBalances: false,
    userName: "",
  },
  ui: {
    activeTab: "home",
    modal: null,
  },
};

function reducer(state, action) {
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
        settings: { ...state.settings, ...(action.payload.settings || {}) },
      };

    case "SET_TAB":
      return { ...state, ui: { ...state.ui, activeTab: action.payload } };

    case "OPEN_MODAL":
      return { ...state, ui: { ...state.ui, modal: action.payload } };

    case "CLOSE_MODAL":
      return { ...state, ui: { ...state.ui, modal: null } };

    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };

    /* Loans */
    case "ADD_LOAN":
      return {
        ...state,
        loans: [action.payload, ...state.loans],
        history: [
          {
            id: uid("h"),
            kind: "loan_created",
            ref: action.payload.id,
            label: `Préstamo creado a ${action.payload.clientName}`,
            amount: action.payload.amount,
            date: todayISO(),
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
      return {
        ...state,
        loans: state.loans.filter((l) => l.id !== action.payload),
      };

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
            id: uid("h"),
            kind: "payment_received",
            ref: loanId,
            label: `Pago recibido de ${loan?.clientName ?? "cliente"}`,
            amount: payment.amount,
            date: payment.date,
          },
          ...state.history,
        ].slice(0, 200),
      };
    }

    /* Clients */
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
      return {
        ...state,
        clients: state.clients.filter((c) => c.id !== action.payload),
      };

    /* Income / Expenses */
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

    default:
      return state;
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Contexto                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Derivaciones                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function useDerived(state) {
  return useMemo(() => {
    const loansResolved = state.loans.map((l) => ({
      ...l,
      _status: resolveStatus(l),
      _paid: paidAmount(l),
      _remaining: remainingDebt(l),
      _profit: expectedProfit(l),
      _return: expectedReturn(l),
      _progress: loanProgress(l),
      _daysUntilDue: daysUntilDue(l),
    }));

    const activeLoans = loansResolved.filter((l) => l._status === "active");
    const overdueLoans = loansResolved.filter((l) => l._status === "overdue");
    const paidLoans = loansResolved.filter((l) => l._status === "paid");
    const refinancedLoans = loansResolved.filter(
      (l) => l._status === "refinanced"
    );

    const capitalInvested = [...activeLoans, ...overdueLoans].reduce(
      (a, l) => a + Number(l.amount),
      0
    );

    const expectedProfitTotal = [...activeLoans, ...overdueLoans].reduce(
      (a, l) => a + l._profit,
      0
    );

    const accumulatedProfit = paidLoans.reduce(
      (a, l) => a + (l._paid - Number(l.amount)),
      0
    );

    const totalIncome = state.income.reduce((a, t) => a + Number(t.amount), 0);
    const totalExpense = state.expenses.reduce(
      (a, t) => a + Number(t.amount),
      0
    );

    const collected = loansResolved.reduce((a, l) => a + l._paid, 0);

    const available =
      Number(state.settings.initialCapital || 0) +
      collected +
      totalIncome -
      capitalInvested -
      totalExpense;

    const totalCapital = available + capitalInvested;

    const thisMonth = monthKey(todayISO());
    const monthlyInterestsCollected = loansResolved.reduce((a, l) => {
      const monthPayments = (l.payments || []).filter(
        (p) => monthKey(p.date) === thisMonth
      );
      const margin = l._return > 0 ? l._profit / l._return : 0;
      const paidThisMonth = monthPayments.reduce(
        (s, p) => s + Number(p.amount),
        0
      );
      return a + paidThisMonth * margin;
    }, 0);

    const upcomingDue = [...activeLoans, ...overdueLoans]
      .filter((l) => l._daysUntilDue !== null)
      .sort((a, b) => a._daysUntilDue - b._daysUntilDue)
      .slice(0, 8);

    const expectedInflow30d = activeLoans
      .filter((l) => l._daysUntilDue !== null && l._daysUntilDue <= 30)
      .reduce((a, l) => a + l._remaining, 0);

    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({
        key,
        label: getMonthLabel(key),
        income: 0,
        expense: 0,
        capital: 0,
        profit: 0,
      });
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

    let running = Number(state.settings.initialCapital || 0);
    months.forEach((m) => {
      running += m.profit + m.income - m.expense;
      m.capital = running;
    });

    const expenseByCategory = Object.keys(EXPENSE_CATEGORIES)
      .map((k) => ({
        key: k,
        label: EXPENSE_CATEGORIES[k].label,
        color: EXPENSE_CATEGORIES[k].color,
        value: state.expenses
          .filter((e) => e.category === k)
          .reduce((a, t) => a + Number(t.amount), 0),
      }))
      .filter((c) => c.value > 0);

    const avgRate = activeLoans.length
      ? activeLoans.reduce((a, l) => a + Number(l.interestRate), 0) /
        activeLoans.length
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
      const active = cLoans.filter(
        (l) => l._status === "active" || l._status === "overdue"
      );
      const debt = active.reduce((a, l) => a + l._remaining, 0);
      const totalGenerated = cLoans
        .filter((l) => l._status === "paid")
        .reduce((a, l) => a + (l._paid - Number(l.amount)), 0);
      const overdueCount = cLoans.filter((l) => l._status === "overdue").length;
      return {
        ...c,
        _loans: cLoans,
        _active: active,
        _debt: debt,
        _totalGenerated: totalGenerated,
        _overdueCount: overdueCount,
      };
    });

    return {
      loansResolved,
      activeLoans,
      overdueLoans,
      paidLoans,
      refinancedLoans,
      capitalInvested,
      expectedProfitTotal,
      accumulatedProfit,
      collected,
      available,
      totalCapital,
      totalIncome,
      totalExpense,
      monthlyInterestsCollected,
      upcomingDue,
      expectedInflow30d,
      months,
      expenseByCategory,
      avgRate,
      avgDays,
      projections,
      projectionSeries,
      clientStats,
    };
  }, [state.loans, state.income, state.expenses, state.settings, state.clients]);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Primitivas UI                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

const TONES = {
  neutral: "bg-zinc-800/70 text-zinc-300 border-zinc-700/50",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  bronze: "bg-amber-900/20 text-amber-500 border-amber-800/40",
};

const Badge = ({ tone = "neutral", children, className = "" }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
      TONES[tone] || TONES.neutral
    } ${className}`}
  >
    {children}
  </span>
);

const StatusBadge = ({ status }) => {
  const s = LOAN_STATUSES[status] || LOAN_STATUSES.active;
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

const RiskBadge = ({ risk }) => {
  const r = RISK_LEVELS[risk] || RISK_LEVELS.low;
  return (
    <Badge tone={r.tone}>
      <Shield className="h-2.5 w-2.5" />
      Riesgo {r.label}
    </Badge>
  );
};

const Button = ({
  variant = "primary",
  size = "md",
  Icon,
  children,
  className = "",
  ...rest
}) => {
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-sm",
  };
  const variants = {
    primary:
      "bg-white text-zinc-950 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.985]",
    secondary:
      "border border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800/70 active:scale-[0.985]",
    ghost:
      "text-zinc-300 hover:bg-zinc-800/60 hover:text-white active:scale-[0.985]",
    bronze:
      "bg-gradient-to-b from-amber-700 to-amber-800 text-amber-50 hover:from-amber-600 hover:to-amber-700 active:scale-[0.985] shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset]",
    danger:
      "bg-rose-600/10 text-rose-400 border border-rose-600/30 hover:bg-rose-600/20 active:scale-[0.985]",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
};

const IconButton = ({ Icon, className = "", ...rest }) => (
  <button
    {...rest}
    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-900/70 text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 ${className}`}
  >
    <Icon className="h-4 w-4" />
  </button>
);

const Input = React.forwardRef(function Input(
  { label, hint, error, Icon, className = "", ...rest },
  ref
) {
  return (
    <label className="block">
      {label && (
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </div>
      )}
      <div
        className={`relative flex items-center rounded-xl border transition-colors ${
          error
            ? "border-rose-700/60 bg-rose-950/20"
            : "border-zinc-800 bg-zinc-900/60 focus-within:border-zinc-600 focus-within:bg-zinc-900"
        }`}
      >
        {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-zinc-500" />}
        <input
          ref={ref}
          {...rest}
          className={`w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none ${className}`}
        />
      </div>
      {hint && !error && (
        <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>
      )}
      {error && <div className="mt-1 text-[11px] text-rose-400">{error}</div>}
    </label>
  );
});

const Select = ({ label, value, onChange, options, Icon }) => (
  <label className="block">
    {label && (
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    )}
    <div className="relative flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 transition-colors focus-within:border-zinc-600 focus-within:bg-zinc-900">
      {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-zinc-500" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-transparent px-3 py-2.5 pr-9 text-sm text-zinc-100 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-500" />
    </div>
  </label>
);

const Textarea = ({ label, ...rest }) => (
  <label className="block">
    {label && (
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    )}
    <textarea
      {...rest}
      className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
    />
  </label>
);

const Toggle = ({ checked, onChange, label, hint }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
  >
    <div className="min-w-0">
      <div className="text-sm font-medium text-zinc-100">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </span>
  </button>
);

const Card = ({ children, className = "", as: Tag = "div", ...rest }) => (
  <Tag
    {...rest}
    className={`rounded-2xl border border-zinc-800/70 bg-zinc-900/50 ${className}`}
  >
    {children}
  </Tag>
);

const SectionTitle = ({ children, action }) => (
  <div className="mb-3 flex items-center justify-between px-1">
    <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">
      {children}
    </h3>
    {action}
  </div>
);

const EmptyState = ({ Icon, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-900/30 px-6 py-12 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
      {Icon && <Icon className="h-5 w-5 text-zinc-400" />}
    </div>
    <div className="text-sm font-medium text-zinc-200">{title}</div>
    {hint && (
      <div className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">
        {hint}
      </div>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

const Skeleton = ({ className = "" }) => (
  <div
    className={`animate-pulse rounded-xl bg-gradient-to-r from-zinc-900/80 via-zinc-800/60 to-zinc-900/80 ${className}`}
  />
);

const Money = ({ value, hide, currency = "$", className = "" }) => (
  <span className={`tabular-nums ${className}`}>
    {formatMoney(value, hide, currency)}
  </span>
);

const DeltaPill = ({ value, label }) => {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        up
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {up ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {label}
    </span>
  );
};

const ProgressBar = ({ value, tone = "bronze" }) => {
  const colors = {
    bronze: "bg-gradient-to-r from-amber-700 to-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    zinc: "bg-zinc-400",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colors[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
};

const StatCard = ({ label, value, hint, Icon, tone, delta }) => {
  const toneClass =
    {
      success: "text-emerald-400",
      danger: "text-rose-400",
      warning: "text-amber-400",
    }[tone] || "text-white";
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/70">
          {Icon && <Icon className="h-4 w-4 text-zinc-400" />}
        </div>
        {delta !== undefined && (
          <DeltaPill value={delta.value} label={delta.label} />
        )}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </Card>
  );
};

const ChartTooltip = ({ active, payload, label, hide, currency = "$" }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      {label !== undefined && (
        <div className="mb-1.5 font-medium text-zinc-300">{label}</div>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color || p.stroke || p.fill }}
            />
            <span className="text-zinc-500">{p.name}:</span>
            <span className="font-medium tabular-nums text-zinc-100">
              {formatMoney(p.value, hide, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Sheet (modal)                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function Sheet({ open, onClose, title, subtitle, footer, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: "sm:max-w-md",
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ animation: "fa-fade 180ms ease-out" }}
    >
      <button
        aria-label="cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className={`relative flex h-[92vh] w-full flex-col rounded-t-3xl border border-zinc-800/80 bg-zinc-950 shadow-2xl sm:h-auto sm:max-h-[88vh] sm:rounded-3xl ${widths[size]}`}
        style={{ animation: "fa-sheet 220ms cubic-bezier(.22,1,.36,1)" }}
      >
        <div className="flex items-start justify-between border-b border-zinc-900/80 px-5 py-4">
          <div className="flex-1 pr-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-800 sm:hidden" />
            <h2 className="text-base font-semibold tracking-tight text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
            )}
          </div>
          <IconButton Icon={X} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="border-t border-zinc-900/80 bg-zinc-950/95 px-5 py-3 backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Modales: Préstamos                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function LoanFormSheet({ open, onClose, editingLoan }) {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState(() => emptyLoan());

  function emptyLoan() {
    const start = todayISO();
    return {
      id: "",
      clientId: "",
      clientName: "",
      alias: "",
      amount: "",
      interestRate: "8",
      startDate: start,
      paymentType: "30",
      customDays: 30,
      dueDate: addDays(start, 30),
      guarantyType: "cash",
      guarantyDetail: "",
      status: "active",
      notes: "",
      payments: [],
      compoundInterest: false,
      noDueDate: false,
    };
  }

  useEffect(() => {
    if (open) {
      setForm(editingLoan ? { ...emptyLoan(), ...editingLoan } : emptyLoan());
    }
  }, [open, editingLoan]);

  const updateField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const recalcDueDate = (startDate, paymentType, customDays) => {
    const days =
      paymentType === "custom"
        ? Number(customDays) || 30
        : PAYMENT_TYPES[paymentType].days;
    return addDays(startDate, days);
  };

  const onStartChange = (v) => {
    setForm((f) => ({
      ...f,
      startDate: v,
      dueDate: recalcDueDate(v, f.paymentType, f.customDays),
    }));
  };
  const onPaymentTypeChange = (v) => {
    setForm((f) => ({
      ...f,
      paymentType: v,
      dueDate: recalcDueDate(f.startDate, v, f.customDays),
    }));
  };
  const onCustomDaysChange = (v) => {
    setForm((f) => ({
      ...f,
      customDays: v,
      dueDate: recalcDueDate(f.startDate, "custom", v),
    }));
  };

  const canSubmit =
    form.clientName.trim() &&
    Number(form.amount) > 0 &&
    Number(form.interestRate) >= 0;

  const profit =
    (Number(form.amount || 0) * Number(form.interestRate || 0)) / 100;

  const onSubmit = () => {
    if (!canSubmit) return;
    let clientId = form.clientId;
    if (!clientId) {
      const existing = state.clients.find(
        (c) =>
          c.name.trim().toLowerCase() === form.clientName.trim().toLowerCase()
      );
      if (existing) clientId = existing.id;
      else {
        const newClient = {
          id: uid("client"),
          name: form.clientName.trim(),
          phone: "",
          observations: "",
          riskLevel: "low",
          createdAt: Date.now(),
        };
        dispatch({ type: "ADD_CLIENT", payload: newClient });
        clientId = newClient.id;
      }
    }

    const payload = {
      ...form,
      id: form.id || uid("loan"),
      clientId,
      amount: Number(form.amount),
      interestRate: Number(form.interestRate),
      customDays: Number(form.customDays) || null,
      createdAt: form.createdAt || Date.now(),
    };

    if (editingLoan) dispatch({ type: "UPDATE_LOAN", payload });
    else dispatch({ type: "ADD_LOAN", payload });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editingLoan ? "Editar préstamo" : "Nuevo préstamo"}
      subtitle="Capturá los términos y la garantía"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            Ganancia esperada{" "}
            <span className="font-medium text-emerald-400 tabular-nums">
              {formatMoney(profit, false, state.settings.currency)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>
              {editingLoan ? "Guardar cambios" : "Crear préstamo"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Cliente"
            placeholder="Nombre y apellido"
            value={form.clientName}
            onChange={(e) => updateField("clientName", e.target.value)}
            Icon={UserIcon}
          />
          <Input
            label="Alias / descripción"
            placeholder="Préstamo auto, vacaciones, etc."
            value={form.alias}
            onChange={(e) => updateField("alias", e.target.value)}
            Icon={Tag}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Monto prestado"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={form.amount}
            onChange={(e) => updateField("amount", e.target.value)}
            Icon={Banknote}
          />
          <Input
            label="Interés (%)"
            type="number"
            inputMode="decimal"
            placeholder="8"
            value={form.interestRate}
            onChange={(e) => updateField("interestRate", e.target.value)}
            Icon={TrendingUp}
          />
        </div>

        {!form.noDueDate && (
          <button
            type="button"
            onClick={() => updateField("compoundInterest", !form.compoundInterest)}
            className={`self-start flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              form.compoundInterest
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                : "bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 hover:text-zinc-400"
            }`}
          >
            <TrendingUp className="h-3 w-3" />
            Interés compuesto al vencer
          </button>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Inicio"
            type="date"
            value={form.startDate}
            onChange={(e) => onStartChange(e.target.value)}
            Icon={Calendar}
          />
          <Select
            label="Plazo"
            value={form.paymentType}
            onChange={onPaymentTypeChange}
            Icon={Clock}
            options={Object.entries(PAYMENT_TYPES).map(([k, v]) => ({
              value: k,
              label: v.label,
            }))}
          />
          {form.noDueDate ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">Vencimiento</span>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 text-sm text-zinc-600 italic">
                <CalendarClock className="h-3.5 w-3.5" />
                Sin fecha definida
              </div>
            </div>
          ) : form.paymentType === "custom" ? (
            <Input
              label="Días"
              type="number"
              value={form.customDays}
              onChange={(e) => onCustomDaysChange(e.target.value)}
              Icon={Hash}
            />
          ) : (
            <Input
              label="Vencimiento"
              type="date"
              value={form.dueDate}
              onChange={(e) => updateField("dueDate", e.target.value)}
              Icon={CalendarClock}
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            const next = !form.noDueDate;
            setForm((f) => ({
              ...f,
              noDueDate: next,
              dueDate: next ? "" : recalcDueDate(f.startDate, f.paymentType, f.customDays),
            }));
          }}
          className={`self-start flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            form.noDueDate
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              : "bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 hover:text-zinc-400"
          }`}
        >
          <HelpCircle className="h-3 w-3" />
          Fecha de pago incierta
        </button>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Garantía"
            value={form.guarantyType}
            onChange={(v) => updateField("guarantyType", v)}
            Icon={Shield}
            options={Object.entries(GUARANTY_TYPES).map(([k, v]) => ({
              value: k,
              label: v.label,
            }))}
          />
          <Input
            label="Detalle de garantía"
            placeholder="Marca, modelo, etc."
            value={form.guarantyDetail}
            onChange={(e) => updateField("guarantyDetail", e.target.value)}
            Icon={FileText}
          />
        </div>

        <Textarea
          label="Notas privadas"
          rows={3}
          placeholder="Acuerdos verbales, referencias, etc."
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
        />

        <div className="rounded-2xl border border-amber-900/30 bg-amber-950/20 p-4">
          <div className="text-[11px] uppercase tracking-wider text-amber-500/80">
            Resumen
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-zinc-500 text-xs">Monto</div>
              <div className="font-semibold tracking-tight text-zinc-100 tabular-nums">
                {formatMoney(form.amount, false, state.settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">Ganancia</div>
              <div className="font-semibold tracking-tight text-emerald-400 tabular-nums">
                {formatMoney(profit, false, state.settings.currency)}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 text-xs">A cobrar</div>
              <div className="font-semibold tracking-tight text-zinc-100 tabular-nums">
                {formatMoney(
                  Number(form.amount || 0) + profit,
                  false,
                  state.settings.currency
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Vence el {formatDate(form.dueDate)}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function PaymentSheet({ open, onClose, loan }) {
  const { state, dispatch } = useApp();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setDate(todayISO());
      setNote("");
    }
  }, [open]);

  if (!loan) return null;

  const remaining = remainingDebt(loan);
  const onSubmit = () => {
    const value = Number(amount);
    if (!(value > 0)) return;
    dispatch({
      type: "ADD_PAYMENT",
      payload: {
        loanId: loan.id,
        payment: {
          id: uid("pay"),
          amount: value,
          date,
          note,
          createdAt: Date.now(),
        },
      },
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar pago"
      subtitle={`${loan.clientName} · resta ${formatMoney(
        remaining,
        false,
        state.settings.currency
      )}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="bronze"
            onClick={onSubmit}
            disabled={!(Number(amount) > 0)}
          >
            Confirmar pago
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          Icon={Banknote}
        />
        <div className="grid grid-cols-3 gap-2">
          {[0.25, 0.5, 1].map((f) => (
            <button
              key={f}
              onClick={() => setAmount(String(Math.round(remaining * f)))}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {f === 1 ? "Total" : `${Math.round(f * 100)}%`}
            </button>
          ))}
        </div>
        <Input
          label="Fecha"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          Icon={Calendar}
        />
        <Textarea
          label="Nota"
          rows={2}
          placeholder="Opcional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Sheet>
  );
}

function LoanDetailSheet({ open, onClose, loanId }) {
  const { state, dispatch, derived } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loan = useMemo(
    () => derived.loansResolved.find((l) => l.id === loanId),
    [derived.loansResolved, loanId]
  );

  if (!loan) return null;

  const onRefinance = () => {
    const newDue = addDays(todayISO(), 30);
    dispatch({
      type: "UPDATE_LOAN",
      payload: {
        id: loan.id,
        status: "refinanced",
        notes:
          (loan.notes || "") +
          `\n[${todayISO()}] Refinanciado a 30 días desde ${loan.dueDate}.`,
      },
    });
    const newLoan = {
      ...loan,
      id: uid("loan"),
      startDate: todayISO(),
      dueDate: newDue,
      paymentType: "30",
      payments: [],
      status: "active",
      amount: loan._remaining,
      notes: `Refinanciación del préstamo previo (${formatDate(loan.dueDate)}).`,
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_LOAN", payload: newLoan });
    onClose();
  };

  const onExtend = () => {
    const days = Number(prompt("¿Cuántos días extender?", "15"));
    if (!Number.isFinite(days) || days <= 0) return;
    dispatch({
      type: "UPDATE_LOAN",
      payload: {
        id: loan.id,
        dueDate: addDays(loan.dueDate, days),
      },
    });
  };

  const onMarkPaid = () => {
    const r = loan._remaining;
    if (r > 0) {
      dispatch({
        type: "ADD_PAYMENT",
        payload: {
          loanId: loan.id,
          payment: {
            id: uid("pay"),
            amount: r,
            date: todayISO(),
            note: "Pago final",
            createdAt: Date.now(),
          },
        },
      });
    }
  };

  const onDelete = () => {
    dispatch({ type: "DELETE_LOAN", payload: loan.id });
    onClose();
  };

  const G = GUARANTY_TYPES[loan.guarantyType] || GUARANTY_TYPES.other;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={loan.clientName}
        subtitle={loan.alias || `Préstamo · ${formatDate(loan.startDate)}`}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" Icon={Edit2} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" Icon={RefreshCw} onClick={onExtend}>
                Extender
              </Button>
              <Button
                variant="secondary"
                Icon={Layers}
                onClick={onRefinance}
                disabled={loan._status === "paid" || loan._status === "refinanced"}
              >
                Refinanciar
              </Button>
              <Button
                variant="bronze"
                Icon={Banknote}
                onClick={() => setPaymentOpen(true)}
                disabled={loan._remaining <= 0}
              >
                Registrar pago
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/60 to-zinc-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <StatusBadge status={loan._status} />
              <Badge tone="bronze">
                <G.Icon className="h-3 w-3" />
                {G.label}
              </Badge>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Deuda restante
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
              <Money
                value={loan._remaining}
                hide={state.settings.hideBalances}
                currency={state.settings.currency}
              />
            </div>
            <div className="mt-3">
              <ProgressBar
                value={loan._progress}
                tone={loan._status === "overdue" ? "rose" : "bronze"}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Cobrado{" "}
                  <Money
                    value={loan._paid}
                    hide={state.settings.hideBalances}
                    currency={state.settings.currency}
                    className="text-zinc-300"
                  />
                </span>
                <span>
                  Total{" "}
                  <Money
                    value={loan._return}
                    hide={state.settings.hideBalances}
                    currency={state.settings.currency}
                    className="text-zinc-300"
                  />
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Capital
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100 tabular-nums">
                <Money
                  value={loan.amount}
                  hide={state.settings.hideBalances}
                  currency={state.settings.currency}
                />
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Ganancia
              </div>
              <div className="mt-1 text-sm font-semibold text-emerald-400 tabular-nums">
                <Money
                  value={loan._profit}
                  hide={state.settings.hideBalances}
                  currency={state.settings.currency}
                />
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Interés
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100 tabular-nums">
                {Number(loan.interestRate).toFixed(1)}%
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Vence
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {formatShortDate(loan.dueDate)}
              </div>
            </Card>
          </div>

          <div>
            <SectionTitle
              action={
                loan._remaining > 0 && (
                  <button
                    onClick={onMarkPaid}
                    className="text-[11px] font-medium uppercase tracking-wider text-emerald-400 hover:text-emerald-300"
                  >
                    Marcar como pagado
                  </button>
                )
              }
            >
              Historial de pagos
            </SectionTitle>
            {loan.payments?.length ? (
              <Card className="divide-y divide-zinc-800/70">
                {[...loan.payments]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                          <ArrowDown className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-100 tabular-nums">
                            <Money
                              value={p.amount}
                              hide={state.settings.hideBalances}
                              currency={state.settings.currency}
                            />
                          </div>
                          <div className="text-xs text-zinc-500">
                            {formatDate(p.date)}
                            {p.note ? ` · ${p.note}` : ""}
                          </div>
                        </div>
                      </div>
                      <Check className="h-4 w-4 text-zinc-600" />
                    </div>
                  ))}
              </Card>
            ) : (
              <EmptyState
                Icon={Receipt}
                title="Sin pagos registrados"
                hint="Cuando registres un pago aparecerá acá con su fecha y nota."
              />
            )}
          </div>

          {loan.notes ? (
            <div>
              <SectionTitle>Notas</SectionTitle>
              <Card className="whitespace-pre-wrap p-4 text-sm text-zinc-300">
                {loan.notes}
              </Card>
            </div>
          ) : null}

          <div className="pt-2">
            {confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-rose-900/40 bg-rose-950/20 px-4 py-3">
                <div className="text-sm text-rose-200">
                  ¿Eliminar definitivamente?
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" size="sm" Icon={Trash2} onClick={onDelete}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-1 text-xs text-zinc-500 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar préstamo
              </button>
            )}
          </div>
        </div>
      </Sheet>
      <PaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        loan={loan}
      />
      <LoanFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editingLoan={editOpen ? loan : null}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Modales: Clientes                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function ClientFormSheet({ open, onClose, editingClient }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    observations: "",
    riskLevel: "low",
  });

  useEffect(() => {
    if (open) {
      setForm(
        editingClient
          ? { ...editingClient }
          : { name: "", phone: "", observations: "", riskLevel: "low" }
      );
    }
  }, [open, editingClient]);

  const canSubmit = form.name.trim().length > 0;
  const onSubmit = () => {
    if (!canSubmit) return;
    if (editingClient) {
      dispatch({
        type: "UPDATE_CLIENT",
        payload: { ...editingClient, ...form },
      });
    } else {
      dispatch({
        type: "ADD_CLIENT",
        payload: {
          id: uid("client"),
          ...form,
          createdAt: Date.now(),
        },
      });
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editingClient ? "Editar cliente" : "Nuevo cliente"}
      subtitle="Información mínima y observaciones privadas"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nombre"
          placeholder="Nombre y apellido"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          Icon={UserIcon}
        />
        <Input
          label="Teléfono"
          placeholder="Opcional"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          Icon={Phone}
        />
        <Select
          label="Nivel de riesgo"
          value={form.riskLevel}
          onChange={(v) => setForm((f) => ({ ...f, riskLevel: v }))}
          Icon={Shield}
          options={Object.entries(RISK_LEVELS).map(([k, v]) => ({
            value: k,
            label: v.label,
          }))}
        />
        <Textarea
          label="Observaciones privadas"
          rows={4}
          placeholder="Antecedentes, referencias, comentarios..."
          value={form.observations}
          onChange={(e) =>
            setForm((f) => ({ ...f, observations: e.target.value }))
          }
        />
      </div>
    </Sheet>
  );
}

function ClientDetailSheet({ open, onClose, clientId, onOpenLoan }) {
  const { state, dispatch, derived } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const client = useMemo(
    () => derived.clientStats.find((c) => c.id === clientId),
    [derived.clientStats, clientId]
  );

  if (!client) return null;

  const paid = client._loans.filter((l) => l._status === "paid");
  const onTime = paid.filter((l) => {
    const last = (l.payments || []).slice(-1)[0];
    return last && last.date <= l.dueDate;
  }).length;
  const punctuality = paid.length ? Math.round((onTime / paid.length) * 100) : null;

  const totalLent = client._loans.reduce((a, l) => a + Number(l.amount), 0);

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={client.name}
        subtitle={
          client.phone ? client.phone : "Perfil del cliente"
        }
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" Icon={Edit2} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
            <Button
              variant="bronze"
              Icon={Plus}
              onClick={() => {
                dispatch({
                  type: "OPEN_MODAL",
                  payload: {
                    type: "loan-form",
                    payload: { clientId: client.id, clientName: client.name },
                  },
                });
                onClose();
              }}
            >
              Nuevo préstamo
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <RiskBadge risk={client.riskLevel} />
            {client._overdueCount > 0 && (
              <Badge tone="danger">
                <AlertTriangle className="h-3 w-3" />
                {client._overdueCount} atrasos
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Préstamos
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100 tabular-nums">
                {client._loans.length}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Activos
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100 tabular-nums">
                {client._active.length}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Deuda
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100 tabular-nums">
                <Money
                  value={client._debt}
                  hide={state.settings.hideBalances}
                  currency={state.settings.currency}
                />
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Generado
              </div>
              <div className="mt-1 text-lg font-semibold text-emerald-400 tabular-nums">
                <Money
                  value={client._totalGenerated}
                  hide={state.settings.hideBalances}
                  currency={state.settings.currency}
                />
              </div>
            </Card>
          </div>

          {punctuality !== null && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-200">
                  Puntualidad histórica
                </div>
                <div className="text-lg font-semibold tabular-nums text-zinc-100">
                  {punctuality}%
                </div>
              </div>
              <ProgressBar
                value={punctuality / 100}
                tone={
                  punctuality >= 80
                    ? "emerald"
                    : punctuality >= 50
                    ? "bronze"
                    : "rose"
                }
              />
              <div className="mt-2 text-xs text-zinc-500">
                {onTime} de {paid.length} préstamos cerrados antes del
                vencimiento.
              </div>
            </Card>
          )}

          <div>
            <SectionTitle>Préstamos</SectionTitle>
            {client._loans.length ? (
              <div className="space-y-2">
                {client._loans
                  .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
                  .map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onOpenLoan(l.id)}
                      className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">
                            {l.alias || formatDate(l.startDate)}
                          </span>
                          <StatusBadge status={l._status} />
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {formatDate(l.startDate)} → {formatDate(l.dueDate)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-zinc-100 tabular-nums">
                          <Money
                            value={l.amount}
                            hide={state.settings.hideBalances}
                            currency={state.settings.currency}
                          />
                        </div>
                        <div className="text-xs text-zinc-500 tabular-nums">
                          {Number(l.interestRate).toFixed(1)}%
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            ) : (
              <EmptyState
                Icon={Wallet}
                title="Sin préstamos todavía"
                hint="Este cliente aún no tiene operaciones registradas."
              />
            )}
          </div>

          <div>
            <SectionTitle>Observaciones</SectionTitle>
            {client.observations ? (
              <Card className="whitespace-pre-wrap p-4 text-sm text-zinc-300">
                {client.observations}
              </Card>
            ) : (
              <Card className="p-4 text-sm text-zinc-500">
                Sin observaciones registradas.
              </Card>
            )}
          </div>

          <div className="pt-1">
            {confirmDelete ? (
              <div className="flex items-center justify-between rounded-2xl border border-rose-900/40 bg-rose-950/20 px-4 py-3">
                <div className="text-sm text-rose-200">
                  ¿Eliminar este cliente?
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    Icon={Trash2}
                    onClick={() => {
                      dispatch({ type: "DELETE_CLIENT", payload: client.id });
                      onClose();
                    }}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-1 text-xs text-zinc-500 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar cliente
              </button>
            )}
          </div>
        </div>
      </Sheet>
      <ClientFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editingClient={editOpen ? client : null}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Modal: Transacciones                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────── */
/*  Cards                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

function LoanCard({ loan, onOpen }) {
  const { state } = useApp();
  const G = GUARANTY_TYPES[loan.guarantyType] || GUARANTY_TYPES.other;
  const dueIn = loan._daysUntilDue;
  const overdue = loan._status === "overdue";
  const upcoming =
    loan._status === "active" && dueIn !== null && dueIn <= 3;

  const dueText = (() => {
    if (loan._status === "paid") return "Cerrado";
    if (loan._status === "refinanced") return "Refinanciado";
    if (dueIn === null) return "";
    if (dueIn < 0) return `Vencido hace ${Math.abs(dueIn)}d`;
    if (dueIn === 0) return "Vence hoy";
    if (dueIn === 1) return "Vence mañana";
    return `Vence en ${dueIn}d`;
  })();

  return (
    <button
      onClick={() => onOpen(loan.id)}
      className={`group relative w-full overflow-hidden rounded-2xl border bg-zinc-900/50 px-4 py-4 text-left transition-all hover:bg-zinc-900 ${
        overdue
          ? "border-rose-900/40"
          : upcoming
          ? "border-amber-800/40"
          : "border-zinc-800/70"
      }`}
    >
      {(overdue || upcoming) && (
        <span
          className={`absolute left-0 top-0 h-full w-0.5 ${
            overdue ? "bg-rose-500" : "bg-amber-500"
          }`}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">
              {loan.clientName}
            </span>
            <StatusBadge status={loan._status} />
          </div>
          {loan.alias && (
            <div className="mt-0.5 truncate text-xs text-zinc-500">
              {loan.alias}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tracking-tight text-zinc-100 tabular-nums">
            <Money
              value={loan.amount}
              hide={state.settings.hideBalances}
              currency={state.settings.currency}
            />
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
            {Number(loan.interestRate).toFixed(1)}% ·{" "}
            <span className="text-emerald-400">
              <Money
                value={loan._profit}
                hide={state.settings.hideBalances}
                currency={state.settings.currency}
              />
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar
          value={loan._progress}
          tone={overdue ? "rose" : "bronze"}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-zinc-500">
          <G.Icon className="h-3.5 w-3.5" />
          {G.label}
        </span>
        <span
          className={`flex items-center gap-1.5 ${
            overdue
              ? "text-rose-400"
              : upcoming
              ? "text-amber-400"
              : "text-zinc-500"
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {dueText}
        </span>
      </div>
    </button>
  );
}

function ClientCard({ client, onOpen }) {
  const { state } = useApp();
  const initials = client.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <button
      onClick={() => onOpen(client.id)}
      className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3.5 text-left transition-all hover:bg-zinc-900"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800 to-amber-950 text-sm font-semibold text-amber-100">
        {initials || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-100">
            {client.name}
          </span>
          {client._overdueCount > 0 && (
            <Badge tone="danger">
              {client._overdueCount} atraso{client._overdueCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
          <RiskBadge risk={client.riskLevel} />
          <span>
            {client._active.length} activo
            {client._active.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums text-zinc-100">
          <Money
            value={client._debt}
            hide={state.settings.hideBalances}
            currency={state.settings.currency}
          />
        </div>
        <div className="text-[11px] text-emerald-400 tabular-nums">
          +
          <Money
            value={client._totalGenerated}
            hide={state.settings.hideBalances}
            currency={state.settings.currency}
          />
        </div>
      </div>
    </button>
  );
}

function TxRow({ tx, onDelete }) {
  const { state } = useApp();
  const isIncome = tx.type === "income";
  const cat = isIncome
    ? INCOME_CATEGORIES[tx.category] || INCOME_CATEGORIES.otros
    : EXPENSE_CATEGORIES[tx.category] || EXPENSE_CATEGORIES.otros;
  const Icon = cat.Icon || (isIncome ? ArrowUp : ArrowDown);
  return (
    <div className="group flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${cat.color}22`, color: cat.color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">
            {tx.description || cat.label}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {cat.label} · {formatShortDate(tx.date)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`text-sm font-semibold tabular-nums ${
            isIncome ? "text-emerald-400" : "text-zinc-100"
          }`}
        >
          {isIncome ? "+" : "−"}
          <Money
            value={tx.amount}
            hide={state.settings.hideBalances}
            currency={state.settings.currency}
          />
        </div>
        <button
          onClick={() => onDelete(tx)}
          className="ml-1 hidden h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-all hover:bg-zinc-800 hover:text-rose-400 group-hover:flex"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TransactionSheet({ open, onClose }) {
  const { dispatch } = useApp();
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("comida");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (open) {
      setType("expense");
      setAmount("");
      setCategory("comida");
      setDescription("");
      setDate(todayISO());
    }
  }, [open]);

  const cats =
    type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  useEffect(() => {
    setCategory(Object.keys(cats)[0]);
  }, [type]); // eslint-disable-line

  const canSubmit = Number(amount) > 0;
  const onSubmit = () => {
    if (!canSubmit) return;
    dispatch({
      type: "ADD_TX",
      payload: {
        id: uid("tx"),
        type,
        amount: Number(amount),
        category,
        description,
        date,
        createdAt: Date.now(),
      },
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo movimiento"
      subtitle="Registrá un ingreso o un gasto personal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>
            Guardar movimiento
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-1">
          {[
            { v: "expense", l: "Gasto", Icon: MinusCircle },
            { v: "income", l: "Ingreso", Icon: PlusCircle },
          ].map((o) => {
            const active = type === o.v;
            return (
              <button
                key={o.v}
                onClick={() => setType(o.v)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? o.v === "expense"
                      ? "bg-rose-500/10 text-rose-300"
                      : "bg-emerald-500/10 text-emerald-300"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <o.Icon className="h-4 w-4" />
                {o.l}
              </button>
            );
          })}
        </div>

        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          Icon={Banknote}
        />

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Categoría
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Object.entries(cats).map(([k, v]) => {
              const active = category === k;
              const Icon = v.Icon || Tag;
              return (
                <button
                  key={k}
                  onClick={() => setCategory(k)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] transition-all ${
                    active
                      ? "border-amber-600/60 bg-amber-900/20 text-amber-200"
                      : "border-zinc-800/70 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        <Input
          label="Descripción"
          placeholder="Opcional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          Icon={FileText}
        />
        <Input
          label="Fecha"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          Icon={Calendar}
        />
      </div>
    </Sheet>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pantalla: Inicio                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function HomeScreen() {
  const { state, dispatch, derived } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const greet = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Buenas noches";
    if (h < 13) return "Buen día";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const userName = state.settings.userName?.trim();
  const hasAnyData =
    state.loans.length > 0 ||
    state.clients.length > 0 ||
    state.expenses.length > 0 ||
    state.income.length > 0;

  const allocationPct =
    derived.totalCapital > 0
      ? derived.capitalInvested / derived.totalCapital
      : 0;

  const monthIncome =
    derived.months[derived.months.length - 1]?.income +
      derived.months[derived.months.length - 1]?.profit || 0;
  const monthExpense = derived.months[derived.months.length - 1]?.expense || 0;
  const monthDelta = monthIncome - monthExpense;

  return (
    <div className="space-y-6 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            {greet}
          </div>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-white">
            {userName || "Panel financiero"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            Icon={hide ? EyeOff : Eye}
            onClick={() =>
              dispatch({
                type: "UPDATE_SETTINGS",
                payload: { hideBalances: !hide },
              })
            }
          />
          <button
            onClick={() => dispatch({ type: "SET_TAB", payload: "loans" })}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-900/70 text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
          >
            <Bell className="h-4 w-4" />
            {derived.overdueLoans.length + derived.upcomingDue.filter((l) => l._daysUntilDue !== null && l._daysUntilDue <= 3 && l._daysUntilDue >= 0).length > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>
      </div>

      {/* Hero capital */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-900/30 bg-gradient-to-br from-zinc-900 via-zinc-950 to-amber-950/30 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-700/10 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-amber-900/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-500/80">
            <Sparkles className="h-3 w-3" />
            Capital total
          </div>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-white">
            <Money value={derived.totalCapital} hide={hide} currency={cur} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Invertido{" "}
              <Money
                value={derived.capitalInvested}
                hide={hide}
                currency={cur}
                className="text-zinc-200"
              />
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              Disponible{" "}
              <Money
                value={derived.available}
                hide={hide}
                currency={cur}
                className="text-zinc-200"
              />
            </span>
          </div>
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-amber-700 to-amber-500 transition-all duration-700"
                style={{ width: `${Math.max(0, Math.min(100, allocationPct * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
              <span>{Math.round(allocationPct * 100)}% asignado</span>
              <span>
                Próx. 30d{" "}
                <span className="text-zinc-300 tabular-nums">
                  <Money
                    value={derived.expectedInflow30d}
                    hide={hide}
                    currency={cur}
                  />
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding */}
      {!hasAnyData && derived.totalCapital === 0 && (
        <Card className="overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500/80">
              <Target className="h-3 w-3" />
              Empezá por acá
            </div>
            <h3 className="mt-1.5 text-base font-semibold tracking-tight text-zinc-100">
              Configurá tu capital y tu primer préstamo
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Cargá el capital con el que arrancás y registrá la primera
              operación. Todo se calcula y proyecta automáticamente.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="bronze"
                Icon={Plus}
                onClick={() =>
                  dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })
                }
              >
                Nuevo préstamo
              </Button>
              <Button
                variant="secondary"
                Icon={Wallet}
                onClick={() => dispatch({ type: "SET_TAB", payload: "profile" })}
              >
                Capital inicial
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Ganancia mensual"
          Icon={TrendingUp}
          tone="success"
          value={
            <Money
              value={derived.monthlyInterestsCollected}
              hide={hide}
              currency={cur}
            />
          }
          hint="Intereses cobrados este mes"
        />
        <StatCard
          label="Ganancia acumulada"
          Icon={Briefcase}
          value={
            <Money
              value={derived.accumulatedProfit}
              hide={hide}
              currency={cur}
            />
          }
          hint={`${derived.paidLoans.length} préstamos cerrados`}
        />
        <StatCard
          label="Préstamos activos"
          Icon={Activity}
          value={derived.activeLoans.length + derived.overdueLoans.length}
          hint={
            derived.overdueLoans.length > 0
              ? `${derived.overdueLoans.length} atrasado${
                  derived.overdueLoans.length > 1 ? "s" : ""
                }`
              : "Todo al día"
          }
          tone={derived.overdueLoans.length > 0 ? "danger" : undefined}
        />
        <StatCard
          label="Por cobrar"
          Icon={CalendarClock}
          value={
            <Money
              value={derived.expectedProfitTotal + derived.capitalInvested}
              hide={hide}
              currency={cur}
            />
          }
          hint={`Próximos: ${derived.upcomingDue.length}`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Evolución del capital
              </div>
              <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                <Money value={derived.totalCapital} hide={hide} currency={cur} />
              </div>
            </div>
            <Badge tone="bronze">Últimos 6 meses</Badge>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={derived.months}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="capitalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b45309" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#b45309" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ stroke: "#3f3f46", strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltip hide={hide} currency={cur} />
                  }
                />
                <Area
                  type="monotone"
                  name="Capital"
                  dataKey="capital"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#capitalFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Mes actual
              </div>
              <div className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                <Money value={monthDelta} hide={hide} currency={cur} />
              </div>
            </div>
            <DeltaPill
              value={monthDelta}
              label={monthDelta >= 0 ? "Positivo" : "Negativo"}
            />
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={derived.months}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                barCategoryGap="28%"
              >
                <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "#27272a55" }}
                  content={<ChartTooltip hide={hide} currency={cur} />}
                />
                <Bar
                  name="Ingresos"
                  dataKey={(d) => d.income + d.profit}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  name="Gastos"
                  dataKey="expense"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Próximos vencimientos */}
      <div>
        <SectionTitle
          action={
            <button
              onClick={() => dispatch({ type: "SET_TAB", payload: "loans" })}
              className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              Ver todos
            </button>
          }
        >
          Próximos vencimientos
        </SectionTitle>
        {derived.upcomingDue.length === 0 ? (
          <EmptyState
            Icon={CheckCircle2}
            title="No hay vencimientos próximos"
            hint="Todos los préstamos están al día o sin fecha próxima."
          />
        ) : (
          <Card className="divide-y divide-zinc-800/70">
            {derived.upcomingDue.map((l) => (
              <button
                key={l.id}
                onClick={() =>
                  dispatch({
                    type: "OPEN_MODAL",
                    payload: { type: "loan-detail", payload: { id: l.id } },
                  })
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      l._status === "overdue"
                        ? "bg-rose-500/10 text-rose-400"
                        : l._daysUntilDue !== null && l._daysUntilDue <= 3
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {l.clientName}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {l._status === "overdue"
                        ? `Atrasado ${Math.abs(l._daysUntilDue)}d · ${formatShortDate(
                            l.dueDate
                          )}`
                        : l._daysUntilDue === 0
                        ? `Vence hoy · ${formatShortDate(l.dueDate)}`
                        : `En ${l._daysUntilDue}d · ${formatShortDate(l.dueDate)}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-zinc-100">
                      <Money
                        value={l._remaining}
                        hide={hide}
                        currency={cur}
                      />
                    </div>
                    <div className="text-[11px] text-zinc-500 tabular-nums">
                      {Number(l.interestRate).toFixed(1)}%
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600" />
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>

      {/* Actividad reciente */}
      {state.history.length > 0 && (
        <div>
          <SectionTitle>Actividad reciente</SectionTitle>
          <Card className="divide-y divide-zinc-800/70">
            {state.history.slice(0, 5).map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/70">
                    {h.kind === "loan_created" ? (
                      <Plus className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ArrowDown className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">
                      {h.label}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {formatDate(h.date)}
                    </div>
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums text-zinc-100">
                  <Money value={h.amount} hide={hide} currency={cur} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pantalla: Préstamos                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function LoansScreen() {
  const { state, dispatch, derived } = useApp();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filters = [
    { v: "all", l: "Todos", n: derived.loansResolved.length },
    { v: "active", l: "Activos", n: derived.activeLoans.length },
    { v: "overdue", l: "Atrasados", n: derived.overdueLoans.length },
    { v: "paid", l: "Pagados", n: derived.paidLoans.length },
    { v: "refinanced", l: "Refinanciados", n: derived.refinancedLoans.length },
  ];

  const filtered = useMemo(() => {
    let arr = derived.loansResolved;
    if (filter !== "all") arr = arr.filter((l) => l._status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (l) =>
          l.clientName.toLowerCase().includes(q) ||
          (l.alias || "").toLowerCase().includes(q)
      );
    }
    return arr.sort((a, b) => {
      const order = { overdue: 0, active: 1, refinanced: 2, paid: 3 };
      const oa = order[a._status] ?? 9;
      const ob = order[b._status] ?? 9;
      if (oa !== ob) return oa - ob;
      const da = a._daysUntilDue ?? 9999;
      const db = b._daysUntilDue ?? 9999;
      return da - db;
    });
  }, [derived.loansResolved, filter, query]);

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Préstamos
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {derived.activeLoans.length + derived.overdueLoans.length} operaciones
            activas
          </p>
        </div>
        <Button
          variant="bronze"
          Icon={Plus}
          onClick={() =>
            dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })
          }
        >
          Nuevo
        </Button>
      </div>

      <Input
        placeholder="Buscar cliente o alias..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        Icon={Search}
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => {
          const active = filter === f.v;
          return (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                  : "border-zinc-800/70 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              {f.l}
              <span
                className={`tabular-nums ${
                  active ? "text-amber-300/80" : "text-zinc-500"
                }`}
              >
                {f.n}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          Icon={Wallet}
          title={
            query
              ? "Sin resultados"
              : filter === "all"
              ? "Aún no hay préstamos"
              : "Sin préstamos en esta categoría"
          }
          hint={
            query
              ? "Probá con otro nombre o alias."
              : "Creá tu primer préstamo para comenzar a gestionar capital y ganancias."
          }
          action={
            !query &&
            filter === "all" && (
              <Button
                variant="bronze"
                Icon={Plus}
                onClick={() =>
                  dispatch({
                    type: "OPEN_MODAL",
                    payload: { type: "loan-form" },
                  })
                }
              >
                Registrar préstamo
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((l) => (
            <LoanCard
              key={l.id}
              loan={l}
              onOpen={(id) =>
                dispatch({
                  type: "OPEN_MODAL",
                  payload: { type: "loan-detail", payload: { id } },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pantalla: Clientes                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function ClientsScreen() {
  const { state, dispatch, derived } = useApp();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let arr = derived.clientStats;
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((c) => c.name.toLowerCase().includes(q));
    }
    return arr.sort((a, b) => {
      if (b._active.length !== a._active.length)
        return b._active.length - a._active.length;
      return b._debt - a._debt;
    });
  }, [derived.clientStats, query]);

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Clientes
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {state.clients.length} perfil
            {state.clients.length === 1 ? "" : "es"} registrado
            {state.clients.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant="bronze"
          Icon={Plus}
          onClick={() =>
            dispatch({ type: "OPEN_MODAL", payload: { type: "client-form" } })
          }
        >
          Nuevo
        </Button>
      </div>

      <Input
        placeholder="Buscar por nombre..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        Icon={Search}
      />

      {filtered.length === 0 ? (
        <EmptyState
          Icon={Users}
          title={query ? "Sin resultados" : "No tenés clientes todavía"}
          hint={
            query
              ? "Probá con otro nombre."
              : "Cargá un cliente para llevar un historial detallado por persona."
          }
          action={
            !query && (
              <Button
                variant="bronze"
                Icon={Plus}
                onClick={() =>
                  dispatch({
                    type: "OPEN_MODAL",
                    payload: { type: "client-form" },
                  })
                }
              >
                Agregar cliente
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              onOpen={(id) =>
                dispatch({
                  type: "OPEN_MODAL",
                  payload: { type: "client-detail", payload: { id } },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pantalla: Finanzas                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function FinanceScreen() {
  const { state, dispatch, derived } = useApp();
  const [sub, setSub] = useState("flow");
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const txAll = useMemo(() => {
    const merged = [
      ...state.income.map((t) => ({ ...t, type: "income" })),
      ...state.expenses.map((t) => ({ ...t, type: "expense" })),
    ];
    return merged.sort((a, b) =>
      a.date === b.date
        ? (b.createdAt || 0) - (a.createdAt || 0)
        : a.date < b.date
        ? 1
        : -1
    );
  }, [state.income, state.expenses]);

  const monthlyBalance =
    derived.months[derived.months.length - 1]?.income -
      derived.months[derived.months.length - 1]?.expense || 0;
  const cumulativeSaving = derived.months.reduce(
    (a, m) => a + (m.income - m.expense),
    0
  );

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Finanzas
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Flujo personal, categorías y proyecciones
          </p>
        </div>
        <Button
          variant="bronze"
          Icon={Plus}
          onClick={() =>
            dispatch({ type: "OPEN_MODAL", payload: { type: "tx-form" } })
          }
        >
          Movimiento
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-1">
        {[
          { v: "flow", l: "Movimientos" },
          { v: "categories", l: "Categorías" },
          { v: "projection", l: "Proyección" },
        ].map((s) => {
          const active = sub === s.v;
          return (
            <button
              key={s.v}
              onClick={() => setSub(s.v)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                active
                  ? "bg-zinc-800/80 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s.l}
            </button>
          );
        })}
      </div>

      {sub === "flow" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Ingresos
              </div>
              <div className="mt-1 text-lg font-semibold text-emerald-400 tabular-nums">
                <Money value={derived.totalIncome} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Gastos
              </div>
              <div className="mt-1 text-lg font-semibold text-rose-400 tabular-nums">
                <Money
                  value={derived.totalExpense}
                  hide={hide}
                  currency={cur}
                />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Balance
              </div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums ${
                  derived.totalIncome - derived.totalExpense >= 0
                    ? "text-zinc-100"
                    : "text-rose-400"
                }`}
              >
                <Money
                  value={derived.totalIncome - derived.totalExpense}
                  hide={hide}
                  currency={cur}
                />
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Flujo mensual
              </div>
              <Badge tone="neutral">Últimos 6 meses</Badge>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={derived.months}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#71717a", fontSize: 11 }}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "#27272a55" }}
                    content={<ChartTooltip hide={hide} currency={cur} />}
                  />
                  <Bar name="Ingresos" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar name="Gastos" dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div>
            <SectionTitle>Movimientos</SectionTitle>
            {txAll.length === 0 ? (
              <EmptyState
                Icon={Receipt}
                title="Aún no cargaste movimientos"
                hint="Registrá ingresos y gastos personales para visualizar tu flujo de caja real."
                action={
                  <Button
                    variant="bronze"
                    Icon={Plus}
                    onClick={() =>
                      dispatch({
                        type: "OPEN_MODAL",
                        payload: { type: "tx-form" },
                      })
                    }
                  >
                    Cargar movimiento
                  </Button>
                }
              />
            ) : (
              <Card className="divide-y divide-zinc-800/70">
                {txAll.slice(0, 40).map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    onDelete={(t) =>
                      dispatch({
                        type: "DELETE_TX",
                        payload: { id: t.id, type: t.type },
                      })
                    }
                  />
                ))}
              </Card>
            )}
          </div>
        </>
      )}

      {sub === "categories" && (
        <>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Gastos por categoría
              </div>
              <Badge tone="neutral">
                <PieChartIcon className="h-3 w-3" />
                Total {formatMoney(derived.totalExpense, hide, cur)}
              </Badge>
            </div>
            {derived.expenseByCategory.length === 0 ? (
              <EmptyState
                Icon={PieChartIcon}
                title="Sin gastos cargados"
                hint="Cuando registres gastos vas a ver la distribución por categoría acá."
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-5">
                <div className="sm:col-span-2 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={derived.expenseByCategory}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="60%"
                        outerRadius="92%"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {derived.expenseByCategory.map((c) => (
                          <Cell key={c.key} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip hide={hide} currency={cur} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="sm:col-span-3 space-y-2">
                  {derived.expenseByCategory
                    .sort((a, b) => b.value - a.value)
                    .map((c) => {
                      const pct = derived.totalExpense
                        ? (c.value / derived.totalExpense) * 100
                        : 0;
                      const Icon = EXPENSE_CATEGORIES[c.key]?.Icon || Tag;
                      return (
                        <div
                          key={c.key}
                          className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5"
                        >
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-lg"
                            style={{
                              background: `${c.color}22`,
                              color: c.color,
                            }}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-zinc-200">
                                {c.label}
                              </span>
                              <span className="text-sm font-medium tabular-nums text-zinc-100">
                                <Money value={c.value} hide={hide} currency={cur} />
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  background: c.color,
                                }}
                              />
                            </div>
                          </div>
                          <span className="w-12 text-right text-[11px] tabular-nums text-zinc-500">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Balance mes
              </div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums ${
                  monthlyBalance >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                <Money value={monthlyBalance} hide={hide} currency={cur} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Ahorro acumulado
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                <Money value={cumulativeSaving} hide={hide} currency={cur} />
              </div>
            </Card>
          </div>
        </>
      )}

      {sub === "projection" && (
        <>
          <Card className="overflow-hidden p-5">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-500/80">
              <Target className="h-3 w-3" />
              Proyección
            </div>
            <div className="text-sm text-zinc-300">
              Asumiendo interés promedio de{" "}
              <span className="font-medium text-zinc-100 tabular-nums">
                {derived.avgRate.toFixed(1)}%
              </span>{" "}
              y plazo de{" "}
              <span className="font-medium text-zinc-100 tabular-nums">
                {Math.round(derived.avgDays)} días
              </span>
              .
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: "1 mes", v: derived.projections.m1 },
                { l: "3 meses", v: derived.projections.m3 },
                { l: "6 meses", v: derived.projections.m6 },
                { l: "1 año", v: derived.projections.y1 },
              ].map((p) => (
                <div
                  key={p.l}
                  className="rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-3"
                >
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                    {p.l}
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    <Money value={p.v} hide={hide} currency={cur} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-400 tabular-nums">
                    +
                    <Money
                      value={p.v - derived.totalCapital}
                      hide={hide}
                      currency={cur}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Crecimiento estimado · 12 meses
              </div>
              <Badge tone="bronze">Reinversión continua</Badge>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={derived.projectionSeries}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="projLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#b45309" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f1f22" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#71717a", fontSize: 11 }}
                  />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip hide={hide} currency={cur} />} />
                  <Line
                    type="monotone"
                    name="Capital proyectado"
                    dataKey="value"
                    stroke="url(#projLine)"
                    strokeWidth={2.5}
                    dot={{ r: 0 }}
                    activeDot={{ r: 4, fill: "#f59e0b", stroke: "#0a0a0b", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-[11px] text-zinc-500">
              Estimación informativa, no garantiza rendimiento real. Se recalcula
              según tus operaciones activas.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pantalla: Perfil                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function ProfileScreen() {
  const { state, dispatch, derived, userEmail, signOut } = useApp();
  const [name, setName] = useState(state.settings.userName || "");
  const [capital, setCapital] = useState(
    String(state.settings.initialCapital || "")
  );
  const [currency, setCurrency] = useState(state.settings.currency || "$");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setName(state.settings.userName || "");
    setCapital(String(state.settings.initialCapital || ""));
    setCurrency(state.settings.currency || "$");
  }, [state.settings]);

  const saveName = () =>
    dispatch({ type: "UPDATE_SETTINGS", payload: { userName: name } });
  const saveCapital = () =>
    dispatch({
      type: "UPDATE_SETTINGS",
      payload: { initialCapital: Number(capital) || 0 },
    });
  const saveCurrency = (v) => {
    setCurrency(v);
    dispatch({ type: "UPDATE_SETTINGS", payload: { currency: v } });
  };

  const totalLent = state.loans.reduce((a, l) => a + Number(l.amount), 0);
  const totalEarned = derived.accumulatedProfit;

  const onReset = () => {
    dispatch({
      type: "HYDRATE",
      payload: {
        loans: [],
        clients: [],
        expenses: [],
        income: [],
        history: [],
        settings: initialState.settings,
      },
    });
    setConfirmReset(false);
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Perfil
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Ajustes generales y datos del usuario
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-800 to-amber-950 text-base font-semibold text-amber-100">
            {(name || "·")
              .split(" ")
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join("") || "·"}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-zinc-100">
              {name || "Sin nombre"}
            </div>
            <div className="text-xs text-zinc-500">
              {state.clients.length} clientes · {state.loans.length} préstamos
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <SectionTitle>Información</SectionTitle>
        <Input
          label="Nombre"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          Icon={UserIcon}
        />
        <Input
          label="Capital inicial"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          onBlur={saveCapital}
          Icon={Banknote}
          hint="Punto de partida del cálculo de capital total."
        />
        <Select
          label="Moneda"
          value={currency}
          onChange={saveCurrency}
          Icon={Hash}
          options={[
            { value: "$", label: "$ (Peso)" },
            { value: "US$", label: "US$ (Dólar)" },
            { value: "€", label: "€ (Euro)" },
          ]}
        />
      </div>

      <div className="space-y-3">
        <SectionTitle>Privacidad</SectionTitle>
        <Toggle
          label="Ocultar saldos"
          hint="Muestra los montos como ••••• en toda la app."
          checked={state.settings.hideBalances}
          onChange={(v) =>
            dispatch({ type: "UPDATE_SETTINGS", payload: { hideBalances: v } })
          }
        />
      </div>

      {userEmail && (
        <div className="space-y-3">
          <SectionTitle>Sesión</SectionTitle>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Conectado como
                </div>
                <div className="mt-0.5 truncate text-sm font-medium text-zinc-100">
                  {userEmail}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={signOut}>
                Cerrar sesión
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle>Resumen</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Total prestado
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
              <Money
                value={totalLent}
                hide={state.settings.hideBalances}
                currency={state.settings.currency}
              />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Total generado
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
              <Money
                value={totalEarned}
                hide={state.settings.hideBalances}
                currency={state.settings.currency}
              />
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Datos</SectionTitle>
        {confirmReset ? (
          <Card className="border-rose-900/40 bg-rose-950/20 p-4">
            <div className="text-sm font-medium text-rose-200">
              Vas a eliminar todos los datos.
            </div>
            <div className="mt-1 text-xs text-rose-300/70">
              Esta acción no se puede deshacer. Préstamos, clientes, gastos e
              ingresos se borrarán.
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" Icon={Trash2} onClick={onReset}>
                Borrar todo
              </Button>
            </div>
          </Card>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
          >
            <div>
              <div className="text-sm font-medium text-zinc-100">
                Borrar todos los datos
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                Restablece la aplicación a su estado inicial.
              </div>
            </div>
            <Trash2 className="h-4 w-4 text-zinc-500" />
          </button>
        )}
      </div>

      <div className="px-1 pt-2 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-700">
        Datos privados · sincronizados entre dispositivos
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Bottom Tab Bar                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

const TABS = [
  { id: "home", label: "Inicio", Icon: HomeIcon },
  { id: "loans", label: "Préstamos", Icon: Wallet },
  { id: "clients", label: "Clientes", Icon: Users },
  { id: "finance", label: "Finanzas", Icon: TrendingUp },
  { id: "profile", label: "Perfil", Icon: UserIcon },
];

function BottomTabBar() {
  const { state, dispatch } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      <nav className="pointer-events-auto mx-3 flex w-full max-w-md items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-950/85 px-1 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        {TABS.map((t) => {
          const active = state.ui.activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => dispatch({ type: "SET_TAB", payload: t.id })}
              className="relative flex flex-1 flex-col items-center justify-center rounded-xl py-2 transition-all"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  active
                    ? "bg-amber-700/20 text-amber-300"
                    : "text-zinc-500"
                }`}
              >
                <t.Icon
                  className="h-[18px] w-[18px]"
                  strokeWidth={active ? 2.2 : 1.8}
                />
              </span>
              <span
                className={`mt-0.5 text-[10px] font-medium tracking-wide transition-colors ${
                  active ? "text-amber-200" : "text-zinc-500"
                }`}
              >
                {t.label}
              </span>
              {active && (
                <span className="absolute -bottom-0.5 h-0.5 w-6 rounded-full bg-amber-500/80" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Skeleton (carga inicial)                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-6 pb-24 pt-1">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-9 w-9" />
      </div>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Modal Root                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

function ModalRoot() {
  const { state, dispatch } = useApp();
  const close = () => dispatch({ type: "CLOSE_MODAL" });
  const m = state.ui.modal;

  if (!m) return null;
  if (m.type === "loan-form")
    return (
      <LoanFormSheet
        open
        onClose={close}
        editingLoan={m.payload?.editingLoan}
      />
    );
  if (m.type === "loan-detail")
    return <LoanDetailSheet open onClose={close} loanId={m.payload?.id} />;
  if (m.type === "client-form")
    return (
      <ClientFormSheet
        open
        onClose={close}
        editingClient={m.payload?.editingClient}
      />
    );
  if (m.type === "client-detail")
    return (
      <ClientDetailSheet
        open
        onClose={close}
        clientId={m.payload?.id}
        onOpenLoan={(id) =>
          dispatch({
            type: "OPEN_MODAL",
            payload: { type: "loan-detail", payload: { id } },
          })
        }
      />
    );
  if (m.type === "tx-form") return <TransactionSheet open onClose={close} />;
  return null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  App                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function GlobalStyles() {
  return (
    <style>{`
      @keyframes fa-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes fa-sheet {
        from { opacity: 0; transform: translateY(24px) }
        to   { opacity: 1; transform: translateY(0) }
      }
      @keyframes fa-rise {
        from { opacity: 0; transform: translateY(8px) }
        to   { opacity: 1; transform: translateY(0) }
      }
      .fa-rise > * { animation: fa-rise 320ms cubic-bezier(.22,1,.36,1) both }
      .fa-rise > *:nth-child(2) { animation-delay: 40ms }
      .fa-rise > *:nth-child(3) { animation-delay: 80ms }
      .fa-rise > *:nth-child(4) { animation-delay: 120ms }
      .fa-rise > *:nth-child(5) { animation-delay: 160ms }
      .fa-rise > *:nth-child(6) { animation-delay: 200ms }
    `}</style>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Auth                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

function SetupScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-3xl border border-amber-900/30 bg-gradient-to-br from-zinc-900 to-amber-950/30 p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-500/80">
            <Sparkles className="h-3 w-3" />
            Configuración requerida
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Conectá Supabase para empezar
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Falta cargar las credenciales de tu proyecto. Editá el archivo{" "}
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-200">
              .env
            </span>{" "}
            en la raíz del proyecto y pegá tu{" "}
            <span className="text-zinc-200">Project URL</span> y tu{" "}
            <span className="text-zinc-200">anon public key</span> de Supabase.
            Después reiniciá el servidor de desarrollo.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/70 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    if (!email.includes("@")) {
      setStatus("error");
      setErrorMsg("Ingresá un email válido.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e?.message || "No se pudo enviar el link.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 text-amber-100">
            <Briefcase className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Acceder al panel
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Te enviamos un link al email para iniciar sesión sin contraseña.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "sending" || status === "sent"}
          />
          {status === "error" && (
            <div className="rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
          {status === "sent" ? (
            <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
              <div className="text-sm font-medium text-emerald-200">
                Link enviado
              </div>
              <div className="mt-1 text-xs text-emerald-300/70">
                Revisá <span className="font-medium">{email}</span> y hacé click
                en el link para entrar. Podés cerrar esta pantalla.
              </div>
            </div>
          ) : (
            <Button
              type="submit"
              variant="bronze"
              className="w-full"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Enviando..." : "Enviar link de acceso"}
            </Button>
          )}
        </form>

        <div className="mt-8 text-center text-[11px] uppercase tracking-[0.18em] text-zinc-700">
          Datos privados · sincronización segura
        </div>
      </div>
    </div>
  );
}

export default function FinanceApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!mounted) return;
      setSession(sess);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!SUPABASE_READY) return <SetupScreen />;
  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
          <LoadingSkeletonGate />
        </div>
      </div>
    );
  }
  if (!session) return <LoginScreen />;
  return <AuthedApp sessionUserId={session.user.id} userEmail={session.user.email} />;
}

function LoadingSkeletonGate() {
  return (
    <div className="space-y-6 pb-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-9 w-9" />
      </div>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function AuthedApp({ sessionUserId, userEmail }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const derived = useDerived(state);

  /* ── Hidratación inicial / al cambiar de usuario ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await storage.getAll(Object.values(STORAGE_KEYS));
      if (cancelled) return;
      dispatch({
        type: "HYDRATE",
        payload: {
          loans: Array.isArray(data[STORAGE_KEYS.loans])
            ? data[STORAGE_KEYS.loans]
            : [],
          clients: Array.isArray(data[STORAGE_KEYS.clients])
            ? data[STORAGE_KEYS.clients]
            : [],
          expenses: Array.isArray(data[STORAGE_KEYS.expenses])
            ? data[STORAGE_KEYS.expenses]
            : [],
          income: Array.isArray(data[STORAGE_KEYS.income])
            ? data[STORAGE_KEYS.income]
            : [],
          history: Array.isArray(data[STORAGE_KEYS.history])
            ? data[STORAGE_KEYS.history]
            : [],
          settings:
            data[STORAGE_KEYS.settings] &&
            typeof data[STORAGE_KEYS.settings] === "object"
              ? data[STORAGE_KEYS.settings]
              : {},
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  /* ── Persistencia debounced por slice ── */
  const persistSlice = (key, value) => {
    storage.set(key, value);
  };

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(
      () => persistSlice(STORAGE_KEYS.loans, state.loans),
      300
    );
    return () => clearTimeout(t);
  }, [state.loans, state.loaded]);

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(
      () => persistSlice(STORAGE_KEYS.clients, state.clients),
      300
    );
    return () => clearTimeout(t);
  }, [state.clients, state.loaded]);

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(
      () => persistSlice(STORAGE_KEYS.expenses, state.expenses),
      300
    );
    return () => clearTimeout(t);
  }, [state.expenses, state.loaded]);

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(
      () => persistSlice(STORAGE_KEYS.income, state.income),
      300
    );
    return () => clearTimeout(t);
  }, [state.income, state.loaded]);

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(
      () => persistSlice(STORAGE_KEYS.history, state.history),
      300
    );
    return () => clearTimeout(t);
  }, [state.history, state.loaded]);

  useEffect(() => {
    if (!state.loaded) return;
    const t = setTimeout(
      () => persistSlice(STORAGE_KEYS.settings, state.settings),
      300
    );
    return () => clearTimeout(t);
  }, [state.settings, state.loaded]);

  const signOut = useCallback(async () => {
    try {
      await supabase?.auth.signOut();
    } catch (e) {
      console.warn("signOut", e);
    }
  }, []);

  const ctx = useMemo(
    () => ({ state, dispatch, derived, userEmail, signOut }),
    [state, derived, userEmail, signOut]
  );

  const activeTab = state.ui.activeTab;

  return (
    <AppContext.Provider value={ctx}>
      <GlobalStyles />
      <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased [font-feature-settings:'cv11','ss01']">
        <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
          {!state.loaded ? (
            <LoadingSkeleton />
          ) : (
            <div className="fa-rise">
              {activeTab === "home" && <HomeScreen />}
              {activeTab === "loans" && <LoansScreen />}
              {activeTab === "clients" && <ClientsScreen />}
              {activeTab === "finance" && <FinanceScreen />}
              {activeTab === "profile" && <ProfileScreen />}
            </div>
          )}
        </div>
        <BottomTabBar />
        <ModalRoot />
      </div>
    </AppContext.Provider>
  );
}

