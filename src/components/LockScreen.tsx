// Pantalla de bloqueo que aparece sobre la app cuando el lock está habilitado.
// Permite desbloquear con PIN (4 dígitos) o con biométrico si está registrado.
import { useState, useEffect, useCallback } from "react";
import { Fingerprint, Delete, Sparkles } from "lucide-react";
import { getLockConfig, verifyBiometric, checkPin } from "../lib/lock.js";

const PIN_LENGTH = 4;

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const cfg = getLockConfig();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const hasBiometric = !!cfg.credentialId;

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
      const ok = await checkPin(pin, cfg.pinHash);
      if (ok) {
        onUnlock();
      } else {
        setFlash(true);
        setError("PIN incorrecto");
        setPin("");
        setTimeout(() => { setFlash(false); setError(""); }, 700);
      }
    })();
  }, [pin]); // eslint-disable-line

  const addDigit = (d: string) => {
    if (pin.length >= PIN_LENGTH) return;
    setError("");
    setPin((p) => p + d);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-[#06060a] px-8 text-zinc-100"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 2.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 2.5rem)",
      }}
    >
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-[0_0_40px_rgba(180,83,9,0.35)]">
          <Sparkles className="h-7 w-7 text-amber-100" />
        </div>
        <p className="text-xl font-semibold tracking-tight">Finance App</p>
        <p className="text-sm text-zinc-500">
          {hasBiometric ? "Usá tu huella o ingresá tu PIN" : "Ingresá tu PIN para acceder"}
        </p>
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
          {[1,2,3,4,5,6,7,8,9].map((d) => (
            <button key={d} onClick={() => addDigit(String(d))}
              className="flex h-[70px] w-full items-center justify-center rounded-2xl border border-zinc-800/60 bg-zinc-900/80 text-2xl font-light text-zinc-100 transition-colors active:bg-zinc-700/80 select-none">
              {d}
            </button>
          ))}
          <div className="flex h-[70px] items-center justify-center">
            {hasBiometric && (
              <button onClick={tryBiometric}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 transition-colors active:bg-amber-500/20 select-none">
                <Fingerprint className="h-7 w-7" />
              </button>
            )}
          </div>
          <button onClick={() => addDigit("0")}
            className="flex h-[70px] w-full items-center justify-center rounded-2xl border border-zinc-800/60 bg-zinc-900/80 text-2xl font-light text-zinc-100 transition-colors active:bg-zinc-700/80 select-none">
            0
          </button>
          <button onClick={() => setPin((p) => p.slice(0, -1))}
            className="flex h-[70px] items-center justify-center text-zinc-500 transition-colors active:text-zinc-200 select-none">
            <Delete className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
