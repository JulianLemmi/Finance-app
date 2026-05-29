import type { AppState } from "../types";

const BACKUP_VERSION = 1;
const BACKUP_KEYS = ["loans", "clients", "expenses", "income", "history", "assets", "settings"];

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
  settings: Record<string, unknown>;
}

export interface BackupSummary {
  loans: number;
  clients: number;
  expenses: number;
  income: number;
  assets: number;
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
    const migrate = MIGRATIONS[parsed.version as number];
    if (!migrate) {
      return { ok: false, error: `No hay migración disponible desde v${parsed.version} a v${BACKUP_VERSION}.` };
    }
    parsed = migrate(parsed);
  }
  for (const k of BACKUP_KEYS.filter((k) => k !== "settings")) {
    if (!Array.isArray(parsed[k])) {
      return { ok: false, error: `Campo "${k}" inválido en el respaldo.` };
    }
    const arr = parsed[k] as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: `Elemento ${i + 1} de "${k}" inválido.` };
      }
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
  return {
    ok: true,
    data: {
      loans: loans as AppState["loans"],
      clients: clients as AppState["clients"],
      expenses: expenses as AppState["expenses"],
      income: income as AppState["income"],
      history: (parsed.history as AppState["history"]) ?? [],
      assets: assets as AppState["assets"],
      settings: (parsed.settings as AppState["settings"]) || {},
    },
    summary: {
      loans: loans.length,
      clients: clients.length,
      expenses: expenses.length,
      income: income.length,
      assets: assets.length,
      exportedAt: parsed.exportedAt as string | undefined,
    },
  };
}
