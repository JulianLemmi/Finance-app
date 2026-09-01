import {
  Banknote, Car, Coins, Package, MoreHorizontal,
  Fuel, UtensilsCrossed, Dumbbell, TrendingUp, ShoppingBag, Wrench,
  Building2, ArrowUpRight,
} from "lucide-react";

export const STORAGE_KEYS = {
  loans: "finance:loans",
  clients: "finance:clients",
  expenses: "finance:expenses",
  income: "finance:income",
  history: "finance:history",
  settings: "finance:settings",
  assets: "finance:assets",
  cars: "finance:cars",
  liabilities: "finance:liabilities",
};

export const CAR_STATUSES = {
  available:   { label: "Disponible",  color: "#10b981" },
  negotiating: { label: "Negociación", color: "#f59e0b" },
  sold:        { label: "Vendido",     color: "#3b82f6" },
  delivered:   { label: "Entregado",   color: "#8b5cf6" },
};

export const CAR_FUEL_TYPES = {
  nafta:     { label: "Nafta" },
  diesel:    { label: "Diesel" },
  gnc:       { label: "GNC" },
  hibrido:   { label: "Híbrido" },
  electrico: { label: "Eléctrico" },
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
  intereses: { label: "Intereses", color: "#10b981", Icon: TrendingUp },
  capital: { label: "Capital", color: "#0ea5e9", Icon: Banknote },
  retorno: { label: "Retorno", color: "#8b5cf6", Icon: ArrowUpRight },
  otros: { label: "Otros", color: "#71717a", Icon: MoreHorizontal },
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

export const UI_LIMITS = {
  UPCOMING_DUE_MAX: 8,
  HISTORY_HOME_MAX: 5,
  HISTORY_STORE_MAX: 200,
  ALERT_DAYS_THRESHOLD: 3,
};

export const CALC = {
  PAID_THRESHOLD: 0.001,
};

export const BUSINESS_RULES = {
  DEFAULT_LOAN_DAYS: 30,
  UPCOMING_DUE_DAYS: 3,
  PUNCTUALITY_GOOD_THRESHOLD: 0.8,
  PROJECTION_MONTHS: 13,
  CHART_HISTORY_MONTHS: 6,
  TX_LIST_MAX: 40,
  MAX_INTEREST_RATE: 100,
  RESET_COOLDOWN_SECS: 3,
};

// Paleta de graficos. Los tonos de serie salen de una validacion de contraste y
// daltonismo (OKLab): caen en la banda de luminosidad del tema oscuro (L 0.48-0.67) y
// el par ingreso/gasto separa dE 8.6 en deuteranopia. El par anterior (#10b981 /
// #f43f5e) separaba solo 5.6: un daltonico rojo-verde no distinguia un ingreso de un
// gasto. Si tocas estos valores, revalidalos antes de commitear.
export const CHART_COLORS = {
  capital: "#d97706",
  capitalStroke: "#f59e0b",
  income: "#059669",
  expense: "#dc2626",
  gain: "#d97706",
  gainStroke: "#f59e0b",
  cashflow: "#d97706",
  // Serie de contexto, no una categoria mas: es la referencia "capital total"
  // detras del invertido. Neutra a proposito, para no competir con los tonos de serie.
  reference: "#52525b",
  grid: "#27272a",
  axis: "#71717a",
  cursor: "#27272a55",
  cursorLine: "#3f3f46",
};

// Un color por mes para los graficos de barras. Los meses son una categoria ORDENADA y
// ademas van rotulados en el eje y con su valor encima, asi que el tono es decorativo:
// la informacion la llevan la altura y la etiqueta. Aun asi el set esta validado (banda
// de luminosidad del tema oscuro + separacion entre barras contiguas, tambien en
// daltonismo), y evita a proposito el verde y el rojo, que en esta app significan
// Ingreso y Gasto.
export const MONTH_COLORS = ["#0d9488", "#d97706", "#2563eb", "#db2777", "#7c3aed", "#ea580c"];

export const TONES = {
  neutral: "bg-zinc-800/70 text-zinc-300 border-zinc-700/50",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  bronze: "bg-amber-900/20 text-amber-500 border-amber-800/40",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};
