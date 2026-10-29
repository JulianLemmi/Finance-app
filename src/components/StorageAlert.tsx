// Aviso fijo cuando algo no se está guardando. Escucha los dos eventos que dispara
// `lib/storage.ts` y se encarga de mostrarlos, así que FinanceApp no tiene que saber
// qué claves fallaron.
//
//  - Cuota: el almacenamiento local se llenó.
//  - Guardado fallido: Supabase rechazó o no pudo escribir (red, permisos, sin sesión).
//
// Antes el segundo sólo dejaba un `console.warn`, y el usuario cerraba la app creyendo que
// su cambio estaba a salvo.
import { useEffect, useState } from "react";
import { STORAGE_QUOTA_EVENT, STORAGE_SAVE_FAILED_EVENT } from "../lib/storage.js";

/** Un Set que sólo cambia de referencia si la clave es nueva (evita renders de más). */
const conClave = (prev: Set<string>, key: string) => (prev.has(key) ? prev : new Set([...prev, key]));

export default function StorageAlert() {
  const [quota, setQuota] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const clave = (e: Event) => (e as CustomEvent<{ key: string }>)?.detail?.key || "datos";
    const onQuota = (e: Event) => setQuota((p) => conClave(p, clave(e)));
    const onFailed = (e: Event) => setFailed((p) => conClave(p, clave(e)));
    window.addEventListener(STORAGE_QUOTA_EVENT, onQuota);
    window.addEventListener(STORAGE_SAVE_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener(STORAGE_QUOTA_EVENT, onQuota);
      window.removeEventListener(STORAGE_SAVE_FAILED_EVENT, onFailed);
    };
  }, []);

  if (quota.size === 0 && failed.size === 0) return null;

  const avisos = [
    quota.size > 0 && {
      titulo: "Sin espacio para guardar localmente",
      detalle: "Estas slices no se están sincronizando:",
      claves: quota,
    },
    failed.size > 0 && {
      titulo: "No se pudo guardar tu último cambio",
      detalle: "Revisá tu conexión. Se reintenta con el próximo cambio:",
      claves: failed,
    },
  ].filter((a): a is { titulo: string; detalle: string; claves: Set<string> } => !!a);

  const cerrar = () => { setQuota(new Set()); setFailed(new Set()); };

  return (
    <div className="fixed inset-x-0 top-3 z-40 mx-auto flex max-w-md justify-center px-3">
      <div className="flex items-start gap-3 rounded-2xl border border-rose-900/50 bg-rose-950/90 px-4 py-3 text-xs text-rose-100 shadow-2xl backdrop-blur">
        <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-400" />
        <div className="flex-1 space-y-2">
          {avisos.map((a) => (
            <div key={a.titulo}>
              <div className="font-medium">{a.titulo}</div>
              <div className="mt-0.5 text-rose-200/80">
                {a.detalle} <span className="font-mono">{Array.from(a.claves).join(", ")}</span>.
              </div>
            </div>
          ))}
        </div>
        <button onClick={cerrar}
          className="-mr-1 -mt-1 rounded-md p-1 text-rose-300 hover:bg-rose-900/40" aria-label="Cerrar aviso">
          <span aria-hidden>×</span>
        </button>
      </div>
    </div>
  );
}
