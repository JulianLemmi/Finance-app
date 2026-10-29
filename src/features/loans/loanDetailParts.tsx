// Piezas de presentación que comparten las secciones del detalle de un préstamo. Existen
// porque el mismo bloque "etiqueta chica + cifra" estaba copiado a mano unas 16 veces entre
// el estacionamiento, la parte compartida y los sheets de sumar capital y de adelantar.
import type { ReactNode } from "react";

interface MiniStatProps {
  label: string;
  /** Clase de color de la cifra. */
  tone?: string;
  children: ReactNode;
}

/** Cifra con su etiqueta, para las grillas de las tarjetas laterales. */
export function MiniStat({ label, tone = "text-zinc-100", children }: MiniStatProps) {
  return (
    <div>
      <div className="text-zinc-500 text-xs">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${tone}`}>{children}</div>
    </div>
  );
}

interface InfoCellProps {
  label: string;
  tone?: string;
  /** `false` para texto (una fecha): sin tabular-nums y con peso medio. */
  numeric?: boolean;
  children: ReactNode;
}

/** Celda de la grilla de resumen de un sheet (ej. "Deuda actual" / "Deuda nueva"). */
export function InfoCell({ label, tone = "text-zinc-100", numeric = true, children }: InfoCellProps) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 ${numeric ? "font-semibold tabular-nums" : "font-medium"} ${tone}`}>{children}</div>
    </div>
  );
}
