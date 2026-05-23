import { useState, useEffect, useRef } from "react";
import { User as UserIcon, Banknote, Hash, Trash2, TrendingUp, Clock, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useApp } from "../store/index.js";
import { initialState } from "../store/index.js";
import { BUSINESS_RULES } from "../lib/constants.js";
import { downloadBackup, readBackupFile } from "../lib/backup.js";
import {
  Card, SectionTitle, Input, Select, Toggle, Button, Money,
} from "../components/ui.jsx";

export default function ProfileScreen() {
  const { state, dispatch, derived, userEmail, signOut } = useApp();
  const [name, setName] = useState(state.settings.userName || "");
  const [capital, setCapital] = useState(String(state.settings.cashOnHand || ""));
  const [currency, setCurrency] = useState(state.settings.currency || "$");
  const [defaultRate, setDefaultRate] = useState(String(state.settings.defaultRate ?? 8));
  const [defaultDays, setDefaultDays] = useState(String(state.settings.defaultDays ?? 30));
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [exportFeedback, setExportFeedback] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setName(state.settings.userName || "");
    setCapital(String(state.settings.cashOnHand || ""));
    setCurrency(state.settings.currency || "$");
    setDefaultRate(String(state.settings.defaultRate ?? 8));
    setDefaultDays(String(state.settings.defaultDays ?? 30));
  }, [state.settings]);

  // Tick down the cooldown counter when confirm dialog opens
  useEffect(() => {
    if (!confirmReset) return;
    setResetCountdown(BUSINESS_RULES.RESET_COOLDOWN_SECS);
    const t = setInterval(() => {
      setResetCountdown((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [confirmReset]);

  const saveName = () => dispatch({ type: "UPDATE_SETTINGS", payload: { userName: name } });
  const saveCapital = () =>
    dispatch({ type: "UPDATE_SETTINGS", payload: { cashOnHand: Number(capital) || 0 } });
  const saveCurrency = (v) => {
    setCurrency(v);
    dispatch({ type: "UPDATE_SETTINGS", payload: { currency: v } });
  };
  const saveDefaultRate = () => {
    const r = Number(defaultRate);
    if (Number.isFinite(r) && r >= 0 && r <= 100) {
      dispatch({ type: "UPDATE_SETTINGS", payload: { defaultRate: r } });
    }
  };
  const saveDefaultDays = () => {
    const d = Number(defaultDays);
    if (Number.isFinite(d) && d > 0) {
      dispatch({ type: "UPDATE_SETTINGS", payload: { defaultDays: d } });
    }
  };

  const totalLent = state.loans.reduce((a, l) => a + Number(l.amount), 0);
  const totalEarned = derived.accumulatedProfit;

  const onExport = () => {
    try {
      downloadBackup(state);
      setExportFeedback("Respaldo descargado");
      setTimeout(() => setExportFeedback(""), 2500);
    } catch (e) {
      console.warn("export error", e);
      setExportFeedback("Error al descargar");
    }
  };

  const onPickFile = () => {
    setImportError("");
    setImportPreview(null);
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = await readBackupFile(file);
    if (!result.ok) {
      setImportError(result.error);
      setImportPreview(null);
      return;
    }
    setImportError("");
    setImportPreview(result);
  };

  const onConfirmImport = () => {
    if (!importPreview?.ok) return;
    dispatch({ type: "HYDRATE", payload: importPreview.data });
    setImportPreview(null);
  };

  const onReset = () => {
    dispatch({
      type: "HYDRATE",
      payload: {
        loans: [], clients: [], expenses: [], income: [], history: [], assets: [],
        settings: initialState.settings,
      },
    });
    setConfirmReset(false);
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Perfil</h1>
        <p className="mt-0.5 text-xs text-zinc-500">Ajustes generales y datos del usuario</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-800 to-amber-950 text-base font-semibold text-amber-100">
            {(name || "·").split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "·"}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-zinc-100">{name || "Sin nombre"}</div>
            <div className="text-xs text-zinc-500">
              {state.clients.length} clientes · {state.loans.length} préstamos
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <SectionTitle>Información</SectionTitle>
        <Input label="Nombre" placeholder="Tu nombre" value={name}
          onChange={(e) => setName(e.target.value)} onBlur={saveName} Icon={UserIcon} />
        <Input label="Efectivo a mano" type="number" inputMode="decimal" placeholder="0"
          value={capital} onChange={(e) => setCapital(e.target.value)} onBlur={saveCapital}
          Icon={Banknote}
          hint="Dinero en efectivo que tenés disponible actualmente, fuera de los préstamos." />
        <Select label="Moneda" value={currency} onChange={saveCurrency} Icon={Hash}
          options={[
            { value: "$", label: "$ (Peso)" },
            { value: "US$", label: "US$ (Dólar)" },
            { value: "€", label: "€ (Euro)" },
          ]} />
      </div>

      <div className="space-y-3">
        <SectionTitle>Préstamos por defecto</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tasa por defecto (%)" type="number" inputMode="decimal" placeholder="8"
            value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)}
            onBlur={saveDefaultRate} Icon={TrendingUp}
            hint="Se usa al crear un préstamo nuevo." />
          <Input label="Plazo por defecto (días)" type="number" inputMode="numeric" placeholder="30"
            value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)}
            onBlur={saveDefaultDays} Icon={Clock}
            hint="Determina el vencimiento sugerido." />
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Apariencia</SectionTitle>
        <Toggle
          label="Modo claro"
          hint="Cambia el tema de oscuro a claro en toda la app."
          checked={state.settings.theme === "light"}
          onChange={(v) =>
            dispatch({ type: "UPDATE_SETTINGS", payload: { theme: v ? "light" : "dark" } })
          }
        />
      </div>

      <div className="space-y-3">
        <SectionTitle>Privacidad</SectionTitle>
        <Toggle label="Ocultar saldos" hint="Muestra los montos como ••••• en toda la app."
          checked={state.settings.hideBalances}
          onChange={(v) => dispatch({ type: "UPDATE_SETTINGS", payload: { hideBalances: v } })} />
      </div>

      {userEmail && (
        <div className="space-y-3">
          <SectionTitle>Sesión</SectionTitle>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Conectado como</div>
                <div className="mt-0.5 truncate text-sm font-medium text-zinc-100">{userEmail}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={signOut}>Cerrar sesión</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle>Resumen</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total prestado</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
              <Money value={totalLent} hide={state.settings.hideBalances} currency={state.settings.currency} />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total generado</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
              <Money value={totalEarned} hide={state.settings.hideBalances} currency={state.settings.currency} />
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Respaldo</SectionTitle>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-100">Descargar respaldo</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                Guardá un archivo JSON con todos tus préstamos, clientes, movimientos y configuración.
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button variant="secondary" size="sm" Icon={Download} onClick={onExport}>
                  Exportar JSON
                </Button>
                {exportFeedback && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {exportFeedback}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Upload className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-100">Restaurar respaldo</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                Reemplaza todos los datos actuales con los del archivo seleccionado.
              </div>
              <input ref={fileInputRef} type="file" accept="application/json,.json"
                className="hidden" onChange={onFileSelected} />
              <div className="mt-3">
                <Button variant="secondary" size="sm" Icon={Upload} onClick={onPickFile}>
                  Elegir archivo JSON
                </Button>
              </div>
              {importError && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}
              {importPreview?.ok && (
                <div className="mt-3 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-3">
                  <div className="text-xs font-medium text-amber-200">Listo para importar</div>
                  <div className="mt-1 text-[11px] text-amber-300/70">
                    {importPreview.summary.loans} préstamos · {importPreview.summary.clients} clientes ·{" "}
                    {importPreview.summary.income} ingresos · {importPreview.summary.expenses} gastos ·{" "}
                    {importPreview.summary.assets} activos
                  </div>
                  <div className="mt-1 text-[11px] text-amber-300/60">
                    Exportado el {importPreview.summary.exportedAt?.slice(0, 10) || "—"}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setImportPreview(null)}>
                      Cancelar
                    </Button>
                    <Button variant="bronze" size="sm" onClick={onConfirmImport}>
                      Reemplazar datos
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionTitle>Datos</SectionTitle>
        {confirmReset ? (
          <Card className="border-rose-900/40 bg-rose-950/20 p-4">
            <div className="text-sm font-medium text-rose-200">Vas a eliminar todos los datos.</div>
            <div className="mt-1 text-xs text-rose-300/70">
              Esta acción no se puede deshacer. Préstamos, clientes, gastos e ingresos se borrarán.
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" Icon={Trash2} onClick={onReset} disabled={resetCountdown > 0}>
                {resetCountdown > 0 ? `Esperá ${resetCountdown}s` : "Borrar todo"}
              </Button>
            </div>
          </Card>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
          >
            <div>
              <div className="text-sm font-medium text-zinc-100">Borrar todos los datos</div>
              <div className="mt-0.5 text-xs text-zinc-500">Restablece la aplicación a su estado inicial.</div>
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
