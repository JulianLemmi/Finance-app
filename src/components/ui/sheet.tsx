import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./button.jsx";

type SheetSize = "sm" | "md" | "lg";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: SheetSize;
}

const widths: Record<SheetSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export function Sheet({ open, onClose, title, subtitle, footer, children, size = "md" }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

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
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 px-5 py-4">
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-base font-semibold tracking-tight text-zinc-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton Icon={X} aria-label="Cerrar" onClick={onClose} className="ml-3 shrink-0" />
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-zinc-800/60 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
