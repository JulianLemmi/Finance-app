// Pantalla de bloqueo que se monta sobre la app. Dos situaciones, según `mode`:
//   - "setup": este navegador todavía no tiene PIN. Se crea acá, antes de ver nada.
//   - "pin":   hay PIN y venció la ventana de acceso de 5 minutos (ver `lib/lock.ts`).
// Desbloquea con PIN de 4 dígitos o con biométrico, si está registrado.
import { useState, useEffect, useCallback } from "react";
import { Fingerprint, Delete, Sparkles, Keyboard } from "lucide-react";
import { getLockConfig, verifyBiometric, verifyAndUpgradePin, savePin, LOCK_GRACE_MS } from "../lib/lock.js";

const PIN_LENGTH = 4;
const GRACE_MIN = Math.round(LOCK_GRACE_MS / 60000);

interface LockScreenProps {
  mode: "pin" | "setup";
  onUnlock: () => void;
  onForgot: () => void;
}

export default function LockScreen({ mode, onUnlock, onForgot }: LockScreenProps) {
  const cfg = getLockConfig();
  const [pin, setPin] = useState("");
  // Primer intento del alta: mientras tenga valor, lo que se está pidiendo es la confirmación.
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const [askForgot, setAskForgot] = useState(false);
  const hasBiometric = mode === "pin" && !!cfg.credentialId;
  const confirming = mode === "setup" && firstPin.length === PIN_LENGTH;

  const fail = useCallback((msg: string) => {
    setFlash(true);
    setError(msg);
    setPin("");
    setTimeout(() => { setFlash(false); setError(""); }, 900);
  }, []);

  const tryBiometric = useCallback(async () => {
    if (!cfg.credentialId) return;
    try {
      setError("");
      await verifyBiometric(cfg.credentialId);
      onUnlock();
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name !== "NotAllowedError") {
        setError("Autenticación fallida. Usá el PIN.");
      }
    }
  }, [cfg.credentialId, onUnlock]);

  useEffect(() => {
    if (hasBiometric) {
      const t = setTimeout(tryBiometric, 400);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    (async () => {
      if (mode === "setup") {
        if (!confirming) {
          setFirstPin(pin);
          setPin("");
          return;
        }
        if (pin !== firstPin) {
          setFirstPin("");
          fail("No coinciden. Empezá de nuevo.");
          return;
        }
        await savePin(pin);
        onUnlock();
        return;
      }
      if (await verifyAndUpgradePin(pin)) onUnlock();
      else fail("PIN incorrecto");
    })();
  }, [pin]); // eslint-disable-line

  const addDigit = useCallback((d: string) => {
    setError("");
    setPin((p) => (p.length >= PIN_LENGTH ? p : p + d));
  }, []);
  const delDigit = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // En la computadora nadie tipea un PIN con el mouse: el teclado numérico entra igual.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); addDigit(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); delDigit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addDigit, delDigit]);

  const titulo = mode === "setup"
    ? (confirming ? "Repetí el PIN" : "Creá tu PIN")
    : (hasBiometric ? "Usá tu huella o ingresá tu PIN" : "Ingresá tu PIN para acceder");
  const bajada = mode === "setup"
    ? `4 dígitos. Te lo vamos a pedir al entrar, y de nuevo pasados ${GRACE_MIN} minutos.`
    : `Tu acceso dura ${GRACE_MIN} minutos.`;

  const keyCls = "flex h-[70px] w-full items-center justify-center rounded-2xl border border-zinc-800/60 "
    + "bg-zinc-900/80 text-2xl font-light text-zinc-100 transition-colors hover:bg-zinc-800/80 "
    + "active:bg-zinc-700/80 select-none";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-between gap-6 bg-[#06060a] px-8 text-zinc-100 sm:justify-center sm:gap-10"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 2.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 2.5rem)",
      }}
    >
      <div className="flex flex-col items-center gap-3 pt-4 sm:pt-0">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-[0_0_40px_rgba(180,83,9,0.35)]">
          <Sparkles className="h-7 w-7 text-amber-100" />
        </div>
        <p className="text-xl font-semibold tracking-tight">Finance App</p>
        <p className="text-sm text-zinc-500">{titulo}</p>
        <p className="max-w-[18rem] text-center text-xs text-zinc-600">{bajada}</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-5">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <div key={i} className={`h-4 w-4 rounded-full border-2 transition-all duration-100 ${
              flash ? "border-rose-400 bg-rose-400 scale-110"
              : i < pin.length ? "border-amber-500 bg-amber-500 scale-110"
              : "border-zinc-700 bg-transparent"
            }`} />
          ))}
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>

      <div className="w-full max-w-[288px]">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => addDigit(String(d))} className={keyCls}>{d}</button>
          ))}
          <div className="flex h-[70px] items-center justify-center">
            {hasBiometric && (
              <button onClick={tryBiometric} aria-label="Usar huella"
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 transition-colors hover:bg-amber-500/20 active:bg-amber-500/20 select-none">
                <Fingerprint className="h-7 w-7" />
              </button>
            )}
          </div>
          <button onClick={() => addDigit("0")} className={keyCls}>0</button>
          <button onClick={delDigit} aria-label="Borrar"
            className="flex h-[70px] items-center justify-center text-zinc-500 transition-colors hover:text-zinc-300 active:text-zinc-200 select-none">
            <Delete className="h-6 w-6" />
          </button>
        </div>

        <p className="mt-4 hidden items-center justify-center gap-1.5 text-[11px] text-zinc-700 sm:flex">
          <Keyboard className="h-3.5 w-3.5" /> También podés escribirlo con el teclado
        </p>

        {mode === "pin" && (
          <div className="mt-4 text-center">
            {askForgot ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Se cierra tu sesión. Vas a tener que entrar de nuevo con tu mail y crear un PIN nuevo.
                </p>
                <div className="flex justify-center gap-4 text-xs">
                  <button onClick={onForgot} className="font-medium text-rose-400 hover:text-rose-300">Cerrar sesión</button>
                  <button onClick={() => setAskForgot(false)} className="text-zinc-600 hover:text-zinc-400">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAskForgot(true)} className="text-xs text-zinc-700 transition-colors hover:text-zinc-500">
                Olvidé mi PIN
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
