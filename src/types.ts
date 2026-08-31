import type { Dispatch } from "react";

// ── Primitive aliases ──────────────────────────────────────────────────────────
export type ISODate = string; // "YYYY-MM-DD"

// ── Unions ────────────────────────────────────────────────────────────────────
export type LoanStatus = "active" | "overdue" | "paid" | "refinanced";
export type PaymentType = "15" | "30" | "custom";
export type GuarantyType = "cash" | "vehicle" | "gold" | "object" | "other";
export type RiskLevel = "low" | "medium" | "high";
export type AssetCategory =
  | "vehicle" | "property" | "investment" | "savings"
  | "gold" | "equipment" | "other";
export type CarStatus = "available" | "negotiating" | "sold" | "delivered";
export type CarFuelType = "nafta" | "diesel" | "gnc" | "hibrido" | "electrico";
export type TabName = "home" | "loans" | "clients" | "cars" | "finance" | "profile";
export type TxType = "income" | "expense";
export type HistoryKind = "loan_created" | "payment_received";
export type ModalType =
  | "loan-form" | "loan-detail"
  | "client-form" | "client-detail"
  | "tx-form" | "asset-form"
  | "car-form" | "car-detail"
  | "liability-form";

// ── Core entities ─────────────────────────────────────────────────────────────
export interface Photo {
  id: string;
  url?: string;
  data?: string;
  name?: string;
  path?: string;
  createdAt?: number;
}

export interface Payment {
  id?: string;
  amount: number;
  date: ISODate;
  timelinePos?: number;
  note?: string;
  createdAt?: number;
}

export interface Contact {
  id: string;
  date: ISODate;
  note: string;
  createdAt?: number;
}

export type InterestMode = "percent" | "fixed";

export interface Loan {
  id: string;
  clientId: string;
  clientName: string;
  alias?: string;
  amount: number;
  interestRate: number;
  /** Modo de cálculo del interés. Default: "percent" (usa `interestRate`).
   *  "fixed" ignora la tasa y cobra `fixedInterest` por período. */
  interestMode?: InterestMode;
  /** Monto fijo por período cuando `interestMode === "fixed"`. La mora suma otro
   *  `fixedInterest` por cada ciclo vencido (no capitaliza sobre sí mismo). */
  fixedInterest?: number;
  /** Socio con quien se comparte el préstamo (ej: "Papá"). Sin valor → 100% mío. */
  sharedWith?: string;
  /** Mi porcentaje del préstamo (0-100). Todo (capital, ganancia, pagos) se prorratea
   *  por este valor en las métricas globales. Ausente o ≥100 → todo mío. */
  myPercent?: number;
  /** Cargo mensual de estacionamiento (para autos). No entra en las métricas del préstamo. */
  parkingFee?: number;
  /** Quién cobra el estacionamiento (ej: "Papá"). Informativo. */
  parkingRecipient?: string;
  /** Cobros del estacionamiento, separados de los pagos del préstamo. */
  parkingPayments?: Payment[];
  startDate: ISODate;
  dueDate: ISODate;
  paymentType: PaymentType;
  customDays?: number;
  payments: Payment[];
  contacts: Contact[];
  guarantyType: GuarantyType;
  guarantyDetail: string;
  status: LoanStatus;
  compoundInterest: boolean;
  noDueDate: boolean;
  refinancedFromId?: string;
  notes: string;
  photos?: Photo[];
  /** Fechas ISO en las que el usuario adelantó manualmente un ciclo de mora (ej: el cliente
   *  quiere pagar por adelantado un vencimiento futuro). Cada entrada suma un ciclo de
   *  capitalización a la deuda y corre `getNextRenewalDate` un ciclo hacia adelante,
   *  como si el vencimiento hubiera caído en esa fecha. Vacío/ausente = comportamiento normal. */
  advancedAt?: ISODate[];
  /** Archivado por el usuario para sacarlo del listado de Préstamos (mantenido apretado
   *  sobre la card). No afecta ningún cálculo: sigue contando en Finanzas/Inicio como
   *  fuente de datos, sólo desaparece de la vista principal. Se restaura desde Historial. */
  archived?: boolean;
  createdAt: number;
}

export interface LoanComputed {
  _status: LoanStatus;
  _paid: number;
  _remaining: number;
  _profit: number;
  _return: number;
  _compoundReturn: number;
  _nextProfit: number;
  _progress: number;
  _daysUntilDue: number | null;
  _invalid: boolean;
  _integrityErrors: string[];
}

export type ResolvedLoan = Loan & LoanComputed;

export interface Client {
  id: string;
  name: string;
  phone?: string;
  observations?: string;
  riskLevel: RiskLevel;
  createdAt: number;
}

export interface ClientComputed {
  _loans: ResolvedLoan[];
  _active: ResolvedLoan[];
  _debt: number;
  _totalGenerated: number;
  _overdueCount: number;
}

export type ResolvedClient = Client & ClientComputed;

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  description: string;
  date: ISODate;
  createdAt: number;
}

export interface PrepCost {
  id: string;
  description: string;
  amount: number;
}

export interface AssetPayment {
  id: string;
  amount: number;
  date: ISODate;
  note?: string;
}

export interface Asset {
  id: string;
  name?: string;
  category: AssetCategory;
  description: string;
  value: number;
  /** Cuotas pagadas si el activo se financia. Cada cuota suma al `value` (equity). */
  installments?: AssetPayment[];
  /** Cantidad total de cuotas del plan, para mostrar progreso "X de Y" (opcional). */
  totalCuotas?: number;
}

export interface Liability {
  id: string;
  /** A quién se le debe (ej: "Papá"). */
  name: string;
  /** Monto total original de la deuda. */
  amount: number;
  startDate: ISODate;
  /** Pagos hechos contra la deuda; `amount - suma(payments)` es lo que queda adeudado. */
  payments: AssetPayment[];
  notes?: string;
  createdAt: number;
}

export interface Car {
  id: string;
  status: CarStatus;
  brand: string;
  model: string;
  year: number;
  fuelType: CarFuelType;
  km?: number;
  color?: string;
  plate?: string;
  vin?: string;
  purchasePrice?: number;
  prepCosts?: PrepCost[];
  salePrice?: number;
  buyerName?: string;
  saleDate?: string;
  notes?: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  ref: string;
  label: string;
  amount: number;
  date: ISODate;
}

export interface Settings {
  currency: string;
  cashOnHand: number;
  hideBalances: boolean;
  userName: string;
  theme: "dark" | "light";
  defaultRate: number;
  defaultDays: number;
  mpBalance: number;
  telegramChatId: string;
  monthlyTarget: number;
  /** Sueldo fijo mensual (virtual): se suma al ingreso de cada mes en los gráficos y el
   *  balance, pero no crea transacción ni afecta el efectivo. 0 = desactivado. */
  fixedIncomeAmount: number;
  /** Día del mes en que se cobra el sueldo fijo (1-31). */
  fixedIncomeDay: number;
  /** Recibir push cuando el dólar blue se mueve (lo procesa el edge function dollar-watch). */
  dollarAlerts: boolean;
  /** Umbral en pesos: avisa cuando el blue venta se movió más que esto desde el último aviso. */
  dollarThreshold: number;
}

export interface ModalPayload {
  id?: string;
  clientId?: string;
  clientName?: string;
  editingLoan?: Loan;
  editingClient?: Client;
  editingAsset?: Asset;
  editingCar?: Car;
  editingLiability?: Liability;
}

export interface ModalState {
  type: ModalType;
  payload?: ModalPayload;
}

export interface UIState {
  activeTab: TabName;
  modal: ModalState | null;
}

export interface AppState {
  loaded: boolean;
  loans: Loan[];
  clients: Client[];
  expenses: Transaction[];
  income: Transaction[];
  history: HistoryEntry[];
  assets: Asset[];
  cars: Car[];
  liabilities: Liability[];
  settings: Settings;
  ui: UIState;
}

// ── Reducer actions ───────────────────────────────────────────────────────────
export type AppAction =
  | { type: "HYDRATE"; payload: Partial<Omit<AppState, "loaded" | "ui">> }
  | { type: "SET_TAB"; payload: TabName }
  | { type: "OPEN_MODAL"; payload: ModalState }
  | { type: "CLOSE_MODAL" }
  | { type: "UPDATE_SETTINGS"; payload: Partial<Settings> }
  | {
      type: "ADD_LOAN";
      payload: Omit<Loan, "id" | "payments" | "contacts" | "createdAt" | "status"> &
        Partial<Pick<Loan, "id" | "payments" | "contacts" | "status" | "createdAt">>;
    }
  | { type: "UPDATE_LOAN"; payload: { id: string } & Partial<Loan> }
  | { type: "DELETE_LOAN"; payload: string }
  | { type: "ADD_CONTACT"; payload: { loanId: string; contact: Contact } }
  | { type: "DELETE_CONTACT"; payload: { loanId: string; contactId: string } }
  | { type: "ADD_PAYMENT"; payload: { loanId: string; payment: Payment } }
  | { type: "ADVANCE_CYCLE"; payload: { loanId: string; date: ISODate } }
  | { type: "UNDO_ADVANCE_CYCLE"; payload: { loanId: string } }
  | { type: "ADD_PARKING_PAYMENT"; payload: { loanId: string; payment: Payment } }
  | { type: "DELETE_PARKING_PAYMENT"; payload: { loanId: string; paymentId: string } }
  | {
      type: "ADD_CLIENT";
      payload: Omit<Client, "id" | "createdAt" | "riskLevel"> &
        Partial<Pick<Client, "id" | "riskLevel" | "createdAt">>;
    }
  | { type: "UPDATE_CLIENT"; payload: { id: string } & Partial<Client> }
  | { type: "DELETE_CLIENT"; payload: string }
  | {
      type: "ADD_TX";
      payload: {
        type: TxType;
        amount: number | string;
        id?: string;
        category?: string;
        description?: string;
        date?: ISODate;
        createdAt?: number;
      };
    }
  | { type: "DELETE_TX"; payload: { id: string; type: TxType } }
  | { type: "ADD_ASSET"; payload: Asset }
  | { type: "UPDATE_ASSET"; payload: { id: string } & Partial<Asset> }
  | { type: "DELETE_ASSET"; payload: string }
  | { type: "ADD_CAR"; payload: Car }
  | { type: "UPDATE_CAR"; payload: { id: string } & Partial<Car> }
  | { type: "DELETE_CAR"; payload: string }
  | { type: "ADD_LIABILITY"; payload: Liability }
  | { type: "UPDATE_LIABILITY"; payload: { id: string } & Partial<Liability> }
  | { type: "DELETE_LIABILITY"; payload: string };

// ── Derived (output of useDerived) ────────────────────────────────────────────
export interface ExpenseByCategoryItem {
  key: string;
  label: string;
  color: string;
  value: number;
}

export interface CashFlowPoint {
  day: number;
  date: ISODate;
  expected: number;
  count: number;
  label: string;
}

export interface MonthData {
  key: string;
  label: string;
  income: number;
  expense: number;
  capital: number;
  /** Capital desplegado en préstamos a esa fecha (sin el efectivo). Curva "Capital invertido". */
  capitalInvested: number;
  /** Interés devengado en el mes: lo que se le acumuló a la deuda de los clientes
   *  por vencimiento + re-vencimientos, lo paguen o no. Base del ROI histórico. */
  accrued: number;
  /** Sueldo fijo virtual del mes (ya incluido dentro de `income`). Separado para el
   *  gráfico "Mes actual", que muestra interés + sueldo sin las transacciones manuales. */
  salary: number;
  /** Ganancia del mes para el gráfico "Mes actual": `accrued + salary`. */
  monthGain: number;
  roi: number;
}

export interface Derived {
  loansResolved: ResolvedLoan[];
  activeLoans: ResolvedLoan[];
  overdueLoans: ResolvedLoan[];
  paidLoans: ResolvedLoan[];
  refinancedLoans: ResolvedLoan[];
  capitalInvested: number;
  expectedProfitTotal: number;
  nextProfitTotal: number;
  accumulatedProfit: number;
  totalIncome: number;
  totalExpense: number;
  totalDisbursed: number;
  available: number;
  totalAssets: number;
  /** Suma de lo que queda adeudado en `state.liabilities` (amount - pagos). Resta de `totalCapital`. */
  totalLiabilities: number;
  workingCapital: number;
  totalCapital: number;
  monthlyInterestsCollected: number;
  collectedThisMonth: number;
  /** Sueldo fijo virtual del mes en curso (0 si está desactivado o aún no es el día de cobro). */
  fixedIncomeThisMonth: number;
  upcomingDue: ResolvedLoan[];
  dueTodayTomorrow: ResolvedLoan[];
  expenseByCategory: ExpenseByCategoryItem[];
  /** Tasa promedio de los préstamos activos; alimenta la proyección cuando no hay capital desplegado. */
  avgRate: number;
  medianRate: number;
  /** Plazo mediano de los préstamos activos: el ciclo con el que se proyecta (TEA, duplicación). */
  medianDays: number;
  paidOnTimeCount: number;
  collectabilityRate: number | null;
  avgDaysLate: number;
  cashFlow30d: CashFlowPoint[];
  months: MonthData[];
  clientStats: ResolvedClient[];
}

// ── Context ───────────────────────────────────────────────────────────────────
export interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  derived: Derived;
  userEmail: string;
  signOut: () => Promise<void>;
  userId: string;
  setSearchOpen: (open: boolean) => void;
}
