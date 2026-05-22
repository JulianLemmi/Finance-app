import {
  Banknote, Car, Coins, Package, MoreHorizontal,
  Fuel, UtensilsCrossed, Dumbbell, TrendingUp, ShoppingBag, Wrench,
  Building2,
} from "lucide-react";

export const STORAGE_KEYS = {
  loans: "finance:loans",
  clients: "finance:clients",
  expenses: "finance:expenses",
  income: "finance:income",
  history: "finance:history",
  settings: "finance:settings",
  assets: "finance:assets",
};

export const LOAN_STATUSES = {
  active: { label: "Activo", tone: "neutral" },
  paid: { label: "Pagado", tone: "success" },
  overdue: { label: "Atrasado", tone: "danger" },
  refinanced: { label: "Refinanciado", tone: "warning" },
};

export const GUARANTY_TYPES = {
  cash: { label: "Efectivo", Icon: Banknote },
  vehicle: { label: "Vehículo", Icon: Car },
  gold: { label: "Oro", Icon: Coins },
  object: { label: "Objeto", Icon: Package },
  other: { label: "Otro", Icon: MoreHorizontal },
};

export const PAYMENT_TYPES = {
  "15": { label: "15 días", days: 15 },
  "30": { label: "30 días", days: 30 },
  custom: { label: "Personalizado", days: null },
};

export const EXPENSE_CATEGORIES = {
  combustible: { label: "Combustible", Icon: Fuel, color: "#d97706" },
  comida: { label: "Comida", Icon: UtensilsCrossed, color: "#dc2626" },
  gimnasio: { label: "Gimnasio", Icon: Dumbbell, color: "#7c3aed" },
  inversiones: { label: "Inversiones", Icon: TrendingUp, color: "#059669" },
  ocio: { label: "Ocio", Icon: ShoppingBag, color: "#db2777" },
  herramientas: { label: "Herramientas", Icon: Wrench, color: "#4f46e5" },
  transporte: { label: "Transporte", Icon: Car, color: "#0891b2" },
  otros: { label: "Otros", Icon: MoreHorizontal, color: "#71717a" },
};

export const INCOME_CATEGORIES = {
  intereses: { label: "Intereses", color: "#10b981" },
  capital: { label: "Capital", color: "#0ea5e9" },
  retorno: { label: "Retorno", color: "#8b5cf6" },
  otros: { label: "Otros", color: "#71717a" },
};

export const RISK_LEVELS = {
  low: { label: "Bajo", tone: "success" },
  medium: { label: "Medio", tone: "warning" },
  high: { label: "Alto", tone: "danger" },
};

export const ASSET_CATEGORIES = {
  vehicle: { label: "Vehículo", Icon: Car, color: "#d97706" },
  property: { label: "Propiedad", Icon: Building2, color: "#0891b2" },
  investment: { label: "Inversión", Icon: TrendingUp, color: "#059669" },
  savings: { label: "Ahorro", Icon: Banknote, color: "#10b981" },
  gold: { label: "Oro", Icon: Coins, color: "#f59e0b" },
  equipment: { label: "Equipamiento", Icon: Wrench, color: "#7c3aed" },
  other: { label: "Otro", Icon: Package, color: "#71717a" },
};

export const TONES = {
  neutral: "bg-zinc-800/70 text-zinc-300 border-zinc-700/50",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  bronze: "bg-amber-900/20 text-amber-500 border-amber-800/40",
};
