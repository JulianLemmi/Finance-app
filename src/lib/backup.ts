import type { AppState } from "../types";

const BACKUP_VERSION = 1;
/** Claves que un respaldo SIEMPRE trae. */
const BACKUP_KEYS = ["loans", "clients", "expenses", "income", "history", "assets", "settings"];
/**
 * Claves que se agregaron después: un respaldo viejo no las trae y tiene que seguir
 * importando, y un respaldo nuevo las trae. Por eso son opcionales y no suben la versión.
 * Faltaban `cars` y `liabilities`: el respaldo no incluía los autos ni los pasivos, así que
 * restaurarlo (o "Borrar todo" y después restaurar) dejaba la app sin ellos — y los pasivos
 * restan del capital total, así que el capital salía mal sin que nada avisara.
 */
const OPTIONAL_ARRAY_KEYS = ["cars", "liabilities"] as const;

type MigrationFn = (payload: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, MigrationFn> = {
  // 1: (p) => ({ ...p, version: 2 }),
};

export interface BackupPayload {
  version: number;
  exportedAt: string;
  loans: unknown[];
  clients: unknown[];
  expenses: unknown[];
  income: unknown[];
  history: unknown[];
  assets: unknown[];
  cars: unknown[];
  liabilities: unknown[];
  settings: Record<string, unknown>;
}

export interface BackupSummary {
  loans: number;
  clients: number;
  expenses: number;
  income: number;
  assets: number;
  /** `undefined` = el respaldo es anterior a esta clave: al importar se conservan los actuales. */
  cars?: number;
  liabilities?: number;
  exportedAt?: string;
}

export type BackupResult =
  | { ok: false; error: string }
  | { ok: true; data: Partial<Omit<AppState, "loaded" | "ui">>; summary: BackupSummary };

export function buildBackup(state: AppState): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    loans: state.loans ?? [],
    clients: state.clients ?? [],
    expenses: state.expenses ?? [],
    income: state.income ?? [],
    history: state.history ?? [],
    assets: state.assets ?? [],
    cars: state.cars ?? [],
    liabilities: state.liabilities ?? [],
    settings: (state.settings as unknown as Record<string, unknown>) ?? {},
  };
}

export function downloadBackup(state: AppState): void {
  const data = buildBackup(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance-backup-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** ¿Es un número finito (o algo que se convierta en uno)? Tolera los montos guardados como texto. */
const esNumero = (v: unknown): boolean => v !== null && v !== "" && Number.isFinite(Number(v));

/**
 * Un monto que no es un número rompe las cuentas sin avisar: `Number("abc")` es NaN, y NaN
 * recorre la deuda, el capital y los gráficos hasta llegar a la pantalla como "$NaN". El
 * respaldo sólo validaba que cada elemento fuera un objeto. Acá se rechaza lo que ninguna
 * versión de la app pudo haber generado (un respaldo editado a mano o corrupto).
 */
function montoInvalido(clave: string, item: Record<string, unknown>, n: number): string | null {
  const donde = `Elemento ${n} de "${clave}"`;
  if (clave === "loans") {
    if (!esNumero(item.amount)) return `${donde}: monto inválido.`;
    const pagos = item.payments;
    if (pagos !== undefined && !Array.isArray(pagos)) return `${donde}: "payments" inválido.`;
    for (const p of (pagos as Record<string, unknown>[] | undefined) ?? []) {
      if (!p || typeof p !== "object" || !esNumero(p.amount)) return `${donde}: un pago tiene el monto inválido.`;
    }
  }
  if ((clave === "expenses" || clave === "income") && !esNumero(item.amount)) return `${donde}: monto inválido.`;
  if (clave === "assets" && !esNumero(item.value)) return `${donde}: valor inválido.`;
  if (clave === "liabilities" && !esNumero(item.amount)) return `${donde}: monto inválido.`;
  return null;
}

export async function readBackupFile(file: File): Promise<BackupResult> {
  if (!file) return { ok: false, error: "No se seleccionó ningún archivo." };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "No se pudo leer el archivo." };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "El archivo no tiene la estructura esperada." };
  }
  if (typeof parsed.version !== "number") {
    return { ok: false, error: "El archivo no tiene una versión válida." };
  }
  if (parsed.version > BACKUP_VERSION) {
    return { ok: false, error: `El respaldo es de una versión más nueva (${parsed.version}) que esta app (${BACKUP_VERSION}). Actualizá la app.` };
  }
  while ((parsed.version as number) < BACKUP_VERSION) {
    const desde = parsed.version as number;
    const migrate = MIGRATIONS[desde];
    if (!migrate) {
      return { ok: false, error: `No hay migración disponible desde v${desde} a v${BACKUP_VERSION}.` };
    }
    parsed = migrate(parsed);
    // Una migración que no sube la versión deja el bucle girando para siempre.
    if (typeof parsed.version !== "number" || parsed.version <= desde) {
      return { ok: false, error: `La migración desde v${desde} no avanzó la versión del respaldo.` };
    }
  }

  const claves = [
    ...BACKUP_KEYS.filter((k) => k !== "settings"),
    ...OPTIONAL_ARRAY_KEYS.filter((k) => parsed[k] !== undefined),
  ];
  for (const k of claves) {
    if (!Array.isArray(parsed[k])) {
      return { ok: false, error: `Campo "${k}" inválido en el respaldo.` };
    }
    const arr = parsed[k] as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: `Elemento ${i + 1} de "${k}" inválido.` };
      }
      const problema = montoInvalido(k, item as Record<string, unknown>, i + 1);
      if (problema) return { ok: false, error: problema };
    }
  }
  if (parsed.settings !== undefined && parsed.settings !== null
      && (typeof parsed.settings !== "object" || Array.isArray(parsed.settings))) {
    return { ok: false, error: "Campo \"settings\" inválido." };
  }

  const loans = parsed.loans as unknown[];
  const clients = parsed.clients as unknown[];
  const expenses = parsed.expenses as unknown[];
  const income = parsed.income as unknown[];
  const assets = parsed.assets as unknown[];
  const cars = Array.isArray(parsed.cars) ? (parsed.cars as AppState["cars"]) : undefined;
  const liabilities = Array.isArray(parsed.liabilities) ? (parsed.liabilities as AppState["liabilities"]) : undefined;
  return {
    ok: true,
    data: {
      loans: loans as AppState["loans"],
      clients: clients as AppState["clients"],
      expenses: expenses as AppState["expenses"],
      income: income as AppState["income"],
      history: (parsed.history as AppState["history"]) ?? [],
      assets: assets as AppState["assets"],
      // Un respaldo viejo no trae estas dos: se omiten (y no se pisan con vacío) para que
      // HYDRATE conserve las actuales en vez de borrarlas.
      ...(cars ? { cars } : {}),
      ...(liabilities ? { liabilities } : {}),
      settings: (parsed.settings as AppState["settings"]) || {},
    },
    summary: {
      loans: loans.length,
      clients: clients.length,
      expenses: expenses.length,
      income: income.length,
      assets: assets.length,
      cars: cars?.length,
      liabilities: liabilities?.length,
      exportedAt: parsed.exportedAt as string | undefined,
    },
  };
}
