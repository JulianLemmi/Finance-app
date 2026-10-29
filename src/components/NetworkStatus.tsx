// Indicador flotante de conectividad. Muestra una pill persistente cuando la app
// está offline y una confirmación transitoria ("Conectado") al recuperar la señal.
import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

type Status = "online" | "offline" | "reconnected";

export default function NetworkStatus() {
  const [status, setStatus] = useState<Status>(navigator.onLine ? "online" : "offline");

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const onOnline = () => {
      // Dos eventos `online` seguidos pisaban el timer sin cancelar el anterior.
      if (hideTimer) clearTimeout(hideTimer);
      setStatus("reconnected");
      hideTimer = setTimeout(() => setStatus("online"), 3000);
    };
    const onOffline = () => {
      if (hideTimer) clearTimeout(hideTimer);
      setStatus("offline");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // El contenedor `aria-live` queda SIEMPRE montado: una región viva que se monta junto con
  // su contenido suele no anunciarse en los lectores de pantalla.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 pointer-events-none"
    >
      {status === "offline" && (
        <div style={{ animation: "fa-fade 200ms ease-out" }} className="pointer-events-auto flex items-center gap-2 rounded-full border border-rose-800/60 bg-rose-950/95 px-4 py-2 text-xs font-medium text-rose-200 shadow-2xl backdrop-blur">
          <WifiOff className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          Sin conexión — tus cambios se guardan al reconectar
        </div>
      )}
      {status === "reconnected" && (
        <div style={{ animation: "fa-fade 200ms ease-out" }} className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/95 px-4 py-2 text-xs font-medium text-emerald-200 shadow-2xl backdrop-blur">
          <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          Conectado
        </div>
      )}
    </div>
  );
}
