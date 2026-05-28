const BACKUP_VERSION = 1;
const BACKUP_KEYS = ["loans", "clients", "expenses", "income", "history", "assets", "settings"];

// Per-version migrations: each fn receives a payload at version N and must
// return one at version N+1. When you bump BACKUP_VERSION to 2, add an entry
// at key 1 that translates v1 → v2. Old backups stay importable.
const MIGRATIONS = {
  // 1: (p) => ({ ...p, version: 2, /* new fields */ }),
};

// Builds a portable backup payload from the current state.
export function buildBackup(state) {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    loans: state.loans || [],
    clients: state.clients || [],
    expenses: state.expenses || [],
    income: state.income || [],
    history: state.history || [],
    assets: state.assets || [],
    settings: state.settings || {},
  };
}

// Triggers a download of the backup JSON in the browser.
export function downloadBackup(state) {
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

// Reads a File, parses JSON, and validates that it matches the expected backup shape.
// Returns { ok: true, data } or { ok: false, error }.
export async function readBackupFile(file) {
  if (!file) return { ok: false, error: "No se seleccionó ningún archivo." };
  let text;
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, error: "No se pudo leer el archivo." };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
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
  // Run migrations forward until we reach the current version.
  while (parsed.version < BACKUP_VERSION) {
    const migrate = MIGRATIONS[parsed.version];
    if (!migrate) {
      return { ok: false, error: `No hay migración disponible desde v${parsed.version} a v${BACKUP_VERSION}.` };
    }
    parsed = migrate(parsed);
  }
  // Ensure each key is an array and each element is a plain object.
  for (const k of BACKUP_KEYS.filter((k) => k !== "settings")) {
    if (!Array.isArray(parsed[k])) {
      return { ok: false, error: `Campo "${k}" inválido en el respaldo.` };
    }
    for (let i = 0; i < parsed[k].length; i++) {
      const item = parsed[k][i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: `Elemento ${i + 1} de "${k}" inválido.` };
      }
    }
  }
  if (parsed.settings !== undefined && parsed.settings !== null
      && (typeof parsed.settings !== "object" || Array.isArray(parsed.settings))) {
    return { ok: false, error: "Campo \"settings\" inválido." };
  }
  return {
    ok: true,
    data: {
      loans: parsed.loans,
      clients: parsed.clients,
      expenses: parsed.expenses,
      income: parsed.income,
      history: parsed.history,
      assets: parsed.assets,
      settings: parsed.settings || {},
    },
    summary: {
      loans: parsed.loans.length,
      clients: parsed.clients.length,
      expenses: parsed.expenses.length,
      income: parsed.income.length,
      assets: parsed.assets.length,
      exportedAt: parsed.exportedAt,
    },
  };
}
