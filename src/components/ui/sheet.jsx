import { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./button.jsx";

export function Sheet({ open, onClose, title, subtitle, footer, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ animation: "fa-fade 180ms ease-out" }}>
      <button aria-label="cerrar" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative flex h-[92vh] w-full flex-col rounded-t-3xl border border-zinc-800/80 bg-zinc-950 shadow-2xl sm:h-auto sm:max-h-[88vh] sm:rounded-3xl ${widths[size]}`}
        style={{ animation: "fa-sheet 220ms cubic-bezier(.22,1,.36,1)" }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
      >
        <div className="flex items-start justify-between border-b border-zinc-900/80 px-5 py-4">
          <div className="flex-1 pr-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-800 sm:hidden" />
            <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton Icon={X} onClick={onClose} aria-label="Cerrar" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="border-t border-zinc-900/80 bg-zinc-950/95 px-5 py-3 backdrop-blur">{footer}</div>
        )}
      </div>
    </div>
  );
}
