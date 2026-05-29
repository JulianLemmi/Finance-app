// Pantalla de perfil: configuración general, seguridad (PIN/biométrico),
// apariencia, privacidad, Telegram bot, notificaciones push y respaldo de datos.
import { useState, useEffect, useRef } from "react";
import {
  User as UserIcon, Banknote, Hash, Trash2, TrendingUp, Clock, Download, Upload,
  AlertTriangle, CheckCircle2, Wallet, Send, Lock, Fingerprint, Delete, Bell, BellOff,
} from "lucide-react";
import { useApp } from "../store/index.js";
import { initialState } from "../store/index.js";
import { BUSINESS_RULES } from "../lib/constants.js";
import { downloadBackup, readBackupFile, type BackupResult } from "../lib/backup.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import {
  PUSH_SUPPORTED, PUSH_CONFIGURED,
  getSubscriptionState, subscribePush, unsubscribePush, sendTestPush,
  type SubscriptionState,
} from "../lib/push.js";
import {
  getLockConfig, saveLockConfig, clearLockConfig,
  isBiometricAvailable, registerBiometric, hashPin, checkPin,
} from "../lib/lock.js";
import { Card, SectionTitle, Input, Select, Toggle, Button, Money } from "../components/ui.jsx";

type LockSetup = "pin1" | "pin2" | "disable" | "add-biometric" | null;
type TelegramStatus = "" | "sending" | "sent" | "error";
type PushStatusKind = { kind: "" | "ok" | "error"; msg: string };

export default function ProfileScreen() {
  const { state, dispatch, derived, userEmail, signOut } = useApp();
  const [name, setName] = useState(state.settings.userName || "");
  const [capital, setCapital] = useState(String(state.settings.cashOnHand || ""));
  const [mpBalance, setMpBalance] = useState(String(state.settings.mpBalance || ""));
  const [monthlyTarget, setMonthlyTarget] = useState(String(state.settings.monthlyTarget || ""));
  const [currency, setCurrency] = useState(state.settings.currency || "$");
  const [defaultRate, setDefaultRate] = useState(String(state.settings.defaultRate ?? 8));
  const [defaultDays, setDefaultDays] = useState(String(state.settings.defaultDays ?? 30));
  const [telegramChatId, setTelegramChatId] = useState(state.settings.telegramChatId || "");
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus>("");

  const [lockEnabled, setLockEnabled] = useState(() => getLockConfig().enabled);
  const [lockHasBiometric, setLockHasBiometric] = useState(() => !!getLockConfig().credentialId);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [lockSetup, setLockSetup] = useState<LockSetup>(null);
  const [setupPin, setSetupPin] = useState("");
  const [setupPin2, setSetupPin2] = useState("");
  const [lockError, setLockError] = useState("");

  useEffect(() => { isBiometricAvailable().then(setBiometricSupported); }, []);

  const [pushState, setPushState] = useState<SubscriptionState>({ supported: false, permission: "default", subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatusKind>({ kind: "", msg: "" });
  const refreshPushState = async () => setPushState(await getSubscriptionState());
  useEffect(() => { refreshPushState(); }, []);

  const togglePush = async () => {
    setPushStatus({ kind: "", msg: "" });
    setPushBusy(true);
    try {
      if (pushState.subscribed) await unsubscribePush();
      else await subscribePush();
      await refreshPushState();
    } catch (e) { setPushStatus({ kind: "error", msg: (e as Error)?.message || "Error" }); }
    finally { setPushBusy(false); }
  };
  const testPush = async () => {
    setPushStatus({ kind: "", msg: "" });
    setPushBusy(true);
    try {
      await sendTestPush();
      setPushStatus({ kind: "ok", msg: "Enviada — revisá las notificaciones" });
    } catch (e) { setPushStatus({ kind: "error", msg: (e as Error)?.message || "Error" }); }
    finally { setPushBusy(false); setTimeout(() => setPushStatus({ kind: "", msg: "" }), 4000); }
  };

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [importPreview, setImportPreview] = useState<BackupResult | null>(null);
  const [importError, setImportError] = useState("");
  const [exportFeedback, setExportFeedback] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevSettingsRef = useRef(state.settings);
  useEffect(() => {
    const prev = prevSettingsRef.current;
    const curr = state.settings;
    if (prev.userName !== curr.userName) setName(curr.userName || "");
    if (prev.cashOnHand !== curr.cashOnHand) setCapital(String(curr.cashOnHand || ""));
    if (prev.mpBalance !== curr.mpBalance) setMpBalance(String(curr.mpBalance || ""));
    if (prev.monthlyTarget !== curr.monthlyTarget) setMonthlyTarget(String(curr.monthlyTarget || ""));
    if (prev.currency !== curr.currency) setCurrency(curr.currency || "$");
    if (prev.defaultRate !== curr.defaultRate) setDefaultRate(String(curr.defaultRate ?? 8));
    if (prev.defaultDays !== curr.defaultDays) setDefaultDays(String(curr.defaultDays ?? 30));
    if (prev.telegramChatId !== curr.telegramChatId) setTelegramChatId(curr.telegramChatId || "");
    prevSettingsRef.current = curr;
  }, [state.settings]);

  useEffect(() => {
    if (!confirmReset) return;
    setResetCountdown(BUSINESS_RULES.RESET_COOLDOWN_SECS);
    const t = setInterval(() => setResetCountdown((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [confirmReset]);

  const saveName = () => dispatch({ type: "UPDATE_SETTINGS", payload: { userName: name } });
  const saveCapital = () => dispatch({ type: "UPDATE_SETTINGS", payload: { cashOnHand: Number(capital) || 0 } });
  const saveMpBalance = () => dispatch({ type: "UPDATE_SETTINGS", payload: { mpBalance: Number(mpBalance) || 0 } });
  const saveMonthlyTarget = () => dispatch({ type: "UPDATE_SETTINGS", payload: { monthlyTarget: Number(monthlyTarget) || 0 } });
  const saveTelegramChatId = () => dispatch({ type: "UPDATE_SETTINGS", payload: { telegramChatId: telegramChatId.trim() } });

  const testTelegramNotification = async () => {
    const id = telegramChatId.trim();
    if (!id) { setTelegramStatus("error"); return; }
    setTelegramStatus("sending");
    const ok = await sendTelegramNotification(id, "✅ Finance App conectada correctamente.\n\nYa podés usar los comandos:\n/resumen /vencimientos /gasto /ingreso");
    setTelegramStatus(ok ? "sent" : "error");
    setTimeout(() => setTelegramStatus(""), 3000);
  };

  const saveCurrency = (v: string) => {
    setCurrency(v);
    dispatch({ type: "UPDATE_SETTINGS", payload: { currency: v } });
  };
  const saveDefaultRate = () => {
    const r = Number(defaultRate);
    if (Number.isFinite(r) && r >= 0 && r <= 100) dispatch({ type: "UPDATE_SETTINGS", payload: { defaultRate: r } });
    else setDefaultRate(String(state.settings.defaultRate ?? 8));
  };
  const saveDefaultDays = () => {
    const d = Number(defaultDays);
    if (Number.isInteger(d) && d > 0) dispatch({ type: "UPDATE_SETTINGS", payload: { defaultDays: d } });
    else setDefaultDays(String(state.settings.defaultDays ?? 30));
  };

  const PIN_LEN = 4;
  const handleLockDigit = (d: string) => {
    setLockError("");
    if (lockSetup === "pin1") {
      const next = setupPin + d;
      setSetupPin(next);
      if (next.length === PIN_LEN) setLockSetup("pin2");
    } else if (lockSetup === "pin2") {
      const next = setupPin2 + d;
      setSetupPin2(next);
      if (next.length === PIN_LEN) {
        if (next !== setupPin) {
          setLockError("Los PINs no coinciden. Intentá de nuevo.");
          setSetupPin(""); setSetupPin2(""); setLockSetup("pin1");
        } else {
          (async () => {
            const pinHash = await hashPin(next);
            saveLockConfig({ enabled: true, pinHash });
            setLockEnabled(true);
            setSetupPin(""); setSetupPin2("");
            setLockSetup(biometricSupported ? "add-biometric" : null);
          })();
        }
      }
    } else if (lockSetup === "disable") {
      const next = setupPin + d;
      setSetupPin(next);
      if (next.length === PIN_LEN) {
        (async () => {
          const ok = await checkPin(next, getLockConfig().pinHash);
          if (ok) {
            clearLockConfig();
            setLockEnabled(false); setLockHasBiometric(false);
            setSetupPin(""); setLockSetup(null);
          } else {
            setLockError("PIN incorrecto");
            setSetupPin("");
          }
        })();
      }
    }
  };
  const handleLockDel = () => {
    if (lockSetup === "pin1") setSetupPin((p) => p.slice(0, -1));
    else if (lockSetup === "pin2") setSetupPin2((p) => p.slice(0, -1));
    else if (lockSetup === "disable") setSetupPin((p) => p.slice(0, -1));
  };
  const handleAddBiometric = async () => {
    try {
      const credentialId = await registerBiometric();
      const cfg = getLockConfig();
      saveLockConfig({ ...cfg, credentialId });
      setLockHasBiometric(true);
      setLockSetup(null);
    } catch (e) {
      if ((e as { name?: string })?.name !== "NotAllowedError") setLockError("No se pudo registrar la huella.");
    }
  };
  const lockPinDisplay = lockSetup === "pin1" ? setupPin
    : lockSetup === "pin2" ? setupPin2
    : lockSetup === "disable" ? setupPin : "";

  const totalLent = state.loans.reduce((a, l) => a + Number(l.amount), 0);
  const totalEarned = derived.accumulatedProfit;

  const onExport = () => {
    try { downloadBackup(state); setExportFeedback("Respaldo descargado"); setTimeout(() => setExportFeedback(""), 2500); }
    catch (e) { console.warn("export error", e); setExportFeedback("Error al descargar"); }
  };
  const onPickFile = () => { setImportError(""); setImportPreview(null); fileInputRef.current?.click(); };
  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = await readBackupFile(file);
    if (!result.ok) { setImportError(result.error); setImportPreview(null); return; }
    setImportError(""); setImportPreview(result);
  };
  const onConfirmImport = () => {
    if (!importPreview?.ok) return;
    try { downloadBackup(state); } catch (e) { console.warn("pre-import backup failed", e); }
    dispatch({ type: "HYDRATE", payload: importPreview.data });
    setImportPreview(null);
  };
  const onReset = () => {
    dispatch({ type: "HYDRATE", payload: { loans: [], clients: [], expenses: [], income: [], history: [], assets: [], settings: initialState.settings } });
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
            <div className="text-xs text-zinc-500">{state.clients.length} clientes · {state.loans.length} préstamos</div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <SectionTitle>Información</SectionTitle>
        <Input label="Nombre" placeholder="Tu nombre" value={name}
          onChange={(e) => setName(e.target.value)} onBlur={saveName} Icon={UserIcon} />
        <Input label="Efectivo a mano" type="number" inputMode="decimal" placeholder="0"
          value={capital} onChange={(e) => setCapital(e.target.value)} onBlur={saveCapital} Icon={Banknote}
          hint="Dinero en efectivo disponible actualmente, fuera de los préstamos." />
        <Input label="Saldo Mercado Pago" type="number" inputMode="decimal" placeholder="0"
          value={mpBalance} onChange={(e) => setMpBalance(e.target.value)} onBlur={saveMpBalance} Icon={Wallet}
          hint="Tu saldo actual en la cuenta de Mercado Pago. Se muestra en el inicio." />
        <Input label="Objetivo mensual de cobranza" type="number" inputMode="decimal" placeholder="0"
          value={monthlyTarget} onChange={(e) => setMonthlyTarget(e.target.value)} onBlur={saveMonthlyTarget} Icon={TrendingUp}
          hint="Meta de cobros mensuales. Aparece como barra de progreso en el inicio." />
        <Select label="Moneda" value={currency} onChange={saveCurrency} Icon={Hash}
          options={[{ value: "$", label: "$ (Peso)" }, { value: "US$", label: "US$ (Dólar)" }, { value: "€", label: "€ (Euro)" }]} />
      </div>

      <div className="space-y-3">
        <SectionTitle>Préstamos por defecto</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tasa por defecto (%)" type="number" inputMode="decimal" placeholder="8"
            value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)} onBlur={saveDefaultRate} Icon={TrendingUp}
            hint="Se usa al crear un préstamo nuevo." />
          <Input label="Plazo por defecto (días)" type="number" inputMode="numeric" placeholder="30"
            value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} onBlur={saveDefaultDays} Icon={Clock}
            hint="Determina el vencimiento sugerido." />
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Seguridad</SectionTitle>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><Lock className="h-4 w-4" /></div>
              <div>
                <div className="text-sm font-medium text-zinc-100">Bloqueo con PIN</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {lockEnabled ? (lockHasBiometric ? "PIN + huella activados" : "PIN activado") : "Se pide al abrir la app instalada"}
                </div>
              </div>
            </div>
            <Toggle checked={lockEnabled} onChange={(v) => {
              if (v) { setLockSetup("pin1"); setSetupPin(""); setSetupPin2(""); setLockError(""); }
              else { setLockSetup("disable"); setSetupPin(""); setLockError(""); }
            }} />
          </div>

          {lockSetup && lockSetup !== "add-biometric" && (
            <div className="mt-4 border-t border-zinc-800/70 pt-4">
              <div className="mb-3 text-center text-sm text-zinc-400">
                {lockSetup === "pin1" && "Elegí un PIN de 4 dígitos"}
                {lockSetup === "pin2" && "Confirmá tu PIN"}
                {lockSetup === "disable" && "Ingresá tu PIN actual para desactivar"}
              </div>
              <div className="mb-4 flex justify-center gap-4">
                {Array.from({ length: PIN_LEN }, (_, i) => (
                  <div key={i} className={`h-3.5 w-3.5 rounded-full border-2 transition-all ${
                    i < lockPinDisplay.length ? "border-amber-500 bg-amber-500" : "border-zinc-600 bg-transparent"
                  }`} />
                ))}
              </div>
              {lockError && <p className="mb-3 text-center text-xs text-rose-400">{lockError}</p>}
              <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
                {[1,2,3,4,5,6,7,8,9].map((d) => (
                  <button key={d} onClick={() => handleLockDigit(String(d))}
                    className="flex h-14 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-900/80 text-xl font-light text-zinc-100 transition-colors active:bg-zinc-700 select-none">
                    {d}
                  </button>
                ))}
                <div />
                <button onClick={() => handleLockDigit("0")}
                  className="flex h-14 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-900/80 text-xl font-light text-zinc-100 transition-colors active:bg-zinc-700 select-none">0</button>
                <button onClick={handleLockDel}
                  className="flex h-14 items-center justify-center text-zinc-500 transition-colors active:text-zinc-200 select-none">
                  <Delete className="h-5 w-5" />
                </button>
              </div>
              <button onClick={() => { setLockSetup(null); setSetupPin(""); setSetupPin2(""); setLockError(""); }}
                className="mt-3 w-full text-center text-xs text-zinc-600 hover:text-zinc-400">Cancelar</button>
            </div>
          )}

          {lockSetup === "add-biometric" && (
            <div className="mt-4 border-t border-zinc-800/70 pt-4">
              <div className="mb-3 text-center text-sm text-zinc-300">✅ PIN configurado. ¿Agregás tu huella?</div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" Icon={Fingerprint} onClick={handleAddBiometric}>Agregar huella</Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => setLockSetup(null)}>Ahora no</Button>
              </div>
              {lockError && <p className="mt-2 text-center text-xs text-rose-400">{lockError}</p>}
            </div>
          )}

          {lockEnabled && !lockSetup && biometricSupported && (
            <div className="mt-3 border-t border-zinc-800/70 pt-3">
              {lockHasBiometric ? (
                <button onClick={() => {
                  const cfg = getLockConfig();
                  const { credentialId: _, ...rest } = cfg;
                  saveLockConfig(rest);
                  setLockHasBiometric(false);
                }} className="text-xs text-zinc-500 hover:text-rose-400 transition-colors">
                  Quitar huella dactilar
                </button>
              ) : (
                <Button variant="secondary" size="sm" Icon={Fingerprint} onClick={handleAddBiometric}>Agregar huella dactilar</Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <SectionTitle>Apariencia</SectionTitle>
        <Toggle label="Modo claro" hint="Cambia el tema de oscuro a claro en toda la app."
          checked={state.settings.theme === "light"}
          onChange={(v) => dispatch({ type: "UPDATE_SETTINGS", payload: { theme: v ? "light" : "dark" } })} />
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
        <SectionTitle>Telegram Bot</SectionTitle>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400"><Send className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">Vincular Telegram</div>
                <div className="mt-0.5 text-xs text-zinc-500">Conectá tu cuenta para recibir alertas y registrar gastos desde Telegram.</div>
              </div>
              <ol className="space-y-1 text-xs text-zinc-400">
                <li>1. Buscá tu bot en Telegram y enviá <code className="rounded bg-zinc-800 px-1 text-zinc-200">/chatid</code></li>
                <li>2. Copiá el número que te responde</li>
                <li>3. Pegalo acá y guardá</li>
              </ol>
              <Input label="Chat ID" type="text" inputMode="numeric" placeholder="Ej: 123456789"
                value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} onBlur={saveTelegramChatId} />
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" Icon={Send} onClick={testTelegramNotification}
                  disabled={telegramStatus === "sending" || !telegramChatId.trim()}>
                  {telegramStatus === "sending" ? "Enviando..." : "Probar notificación"}
                </Button>
                {telegramStatus === "sent" && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Enviado</span>}
                {telegramStatus === "error" && <span className="flex items-center gap-1.5 text-xs text-rose-400"><AlertTriangle className="h-3.5 w-3.5" />Error — verificá el Chat ID</span>}
              </div>
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-3 text-xs text-zinc-400">
                <div className="mb-1 font-medium text-zinc-300">Comandos disponibles</div>
                <div className="space-y-0.5 font-mono text-[11px]">
                  <div><span className="text-sky-400">/resumen</span> — Capital y préstamos</div>
                  <div><span className="text-sky-400">/vencimientos</span> — Próximos 7 días</div>
                  <div><span className="text-sky-400">/gasto 5000 nafta</span> — Registrar gasto</div>
                  <div><span className="text-sky-400">/ingreso 10000 cuota</span> — Registrar ingreso</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionTitle>Notificaciones push</SectionTitle>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${pushState.subscribed ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800/70 text-zinc-400"}`}>
              {pushState.subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">Alertas en el dispositivo</div>
                <div className="mt-0.5 text-xs text-zinc-500">Recibí avisos de vencimientos aunque la app esté cerrada.</div>
              </div>
              {!PUSH_SUPPORTED && <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">Tu navegador no soporta notificaciones push.</div>}
              {PUSH_SUPPORTED && !PUSH_CONFIGURED && (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
                  Falta <code className="rounded bg-zinc-800 px-1 text-zinc-200">VITE_VAPID_PUBLIC_KEY</code> en el <code>.env</code>.
                </div>
              )}
              {PUSH_SUPPORTED && pushState.permission === "denied" && (
                <div className="rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">Permiso bloqueado por el navegador.</div>
              )}
              {PUSH_SUPPORTED && PUSH_CONFIGURED && pushState.permission !== "denied" && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant={pushState.subscribed ? "secondary" : "bronze"} size="sm"
                    Icon={pushState.subscribed ? BellOff : Bell} onClick={togglePush} disabled={pushBusy}>
                    {pushBusy ? "..." : pushState.subscribed ? "Desactivar" : "Activar"}
                  </Button>
                  {pushState.subscribed && <Button variant="secondary" size="sm" Icon={Send} onClick={testPush} disabled={pushBusy}>Probar</Button>}
                  {pushStatus.msg && (
                    <span className={`flex items-center gap-1.5 text-xs ${pushStatus.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
                      {pushStatus.kind === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {pushStatus.msg}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <SectionTitle>Respaldo</SectionTitle>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><Download className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-100">Descargar respaldo</div>
              <div className="mt-0.5 text-xs text-zinc-500">Guardá un JSON con todos tus préstamos, clientes, movimientos y configuración.</div>
              <div className="mt-3 flex items-center gap-3">
                <Button variant="secondary" size="sm" Icon={Download} onClick={onExport}>Exportar JSON</Button>
                {exportFeedback && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />{exportFeedback}</span>}
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400"><Upload className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-100">Restaurar respaldo</div>
              <div className="mt-0.5 text-xs text-zinc-500">Reemplaza todos los datos actuales con los del archivo seleccionado.</div>
              <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onFileSelected} />
              <div className="mt-3"><Button variant="secondary" size="sm" Icon={Upload} onClick={onPickFile}>Elegir archivo JSON</Button></div>
              {importError && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{importError}</span>
                </div>
              )}
              {importPreview?.ok && (
                <div className="mt-3 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-3">
                  <div className="text-xs font-medium text-amber-200">Listo para importar</div>
                  <div className="mt-1 text-[11px] text-amber-300/70">
                    {importPreview.summary.loans} préstamos · {importPreview.summary.clients} clientes ·{" "}
                    {importPreview.summary.income} ingresos · {importPreview.summary.expenses} gastos · {importPreview.summary.assets} activos
                  </div>
                  <div className="mt-1 text-[11px] text-amber-300/60">Exportado el {importPreview.summary.exportedAt?.slice(0, 10) || "—"}</div>
                  <div className="mt-2 text-[11px] text-amber-300/80">Antes de reemplazar, se descarga un respaldo automático.</div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setImportPreview(null)}>Cancelar</Button>
                    <Button variant="bronze" size="sm" onClick={onConfirmImport}>Reemplazar datos</Button>
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
            <div className="mt-1 text-xs text-rose-300/70">Esta acción no se puede deshacer.</div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" Icon={Trash2} onClick={onReset} disabled={resetCountdown > 0}>
                {resetCountdown > 0 ? `Esperá ${resetCountdown}s` : "Borrar todo"}
              </Button>
            </div>
          </Card>
        ) : (
          <button onClick={() => setConfirmReset(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900">
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
