// Ficha de cuenta corriente del préstamo: todas las operaciones en orden, con el saldo
// corriendo fila por fila, igual que una planilla de papel.
//
// Las filas salen de `loanLedger`, que compone el devengado, los adicionales y los pagos
// sin volver a recorrer la deuda. Por eso el último saldo es el mismo número que muestra
// el header del detalle — y si alguna vez dejan de coincidir, el que está mal es el
// recorrido, no esta pantalla.
import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, PlusCircle, Users } from "lucide-react";
import { loanLedger, type LedgerKind, type LedgerRow } from "../../lib/calcs.js";
import { formatDate, formatInterest, myShare } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import { Sheet, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanLedgerSheetProps {
  open: boolean;
  onClose: () => void;
  loan: ResolvedLoan;
}

/** Un color por origen de la fila, para poder barrer la planilla sin leerla entera. */
const KIND_STYLE: Record<LedgerKind, { dot: string; text: string; label: string }> = {
  capital: { dot: "bg-zinc-400", text: "text-zinc-300", label: "Capital" },
  interes: { dot: "bg-amber-400", text: "text-amber-300", label: "Interés" },
  extra: { dot: "bg-teal-400", text: "text-teal-300", label: "Adicional" },
  pago: { dot: "bg-emerald-400", text: "text-emerald-300", label: "Pago" },
};

function FichaDato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium text-zinc-200">{children}</div>
    </div>
  );
}

export default function LoanLedgerSheet({ open, onClose, loan }: LoanLedgerSheetProps) {
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const share = myShare(loan);

  const filas = useMemo<LedgerRow[]>(() => (open ? loanLedger(loan) : []), [open, loan]);
  const totales = useMemo(
    () => filas.reduce(
      (acc, f) => ({ debe: acc.debe + f.debe, haber: acc.haber + f.haber }),
      { debe: 0, haber: 0 }
    ),
    [filas]
  );
  const saldoFinal = filas.length > 0 ? filas[filas.length - 1].saldo : 0;

  return (
    <Sheet
      open={open} onClose={onClose} size="lg" dense
      title="Ficha de cuenta corriente"
      subtitle={`${loan.clientName}${loan.alias ? ` · ${loan.alias}` : ""}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-[11px] text-zinc-600">
            {filas.length} {filas.length === 1 ? "operación" : "operaciones"}
          </span>
          <span className="text-xs text-zinc-500">
            Saldo{" "}
            <span className="font-semibold tabular-nums text-zinc-100">
              <Money value={saldoFinal} hide={hide} currency={cur} />
            </span>
            {share < 1 && (
              <>
                {" · tu parte "}
                <span className="font-medium tabular-nums text-sky-300">
                  <Money value={saldoFinal * share} hide={hide} currency={cur} />
                </span>
              </>
            )}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Encabezado de la ficha, como el de una planilla de papel. */}
        <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <FichaDato label="Cliente">{loan.clientName}</FichaDato>
            <FichaDato label="Capital prestado">
              <Money value={loan._principal} hide={hide} currency={cur} />
            </FichaDato>
            <FichaDato label="Interés">{formatInterest(loan, cur)}</FichaDato>
            <FichaDato label="Vencimiento">
              {loan.noDueDate ? "Sin vencimiento" : formatDate(loan.dueDate)}
            </FichaDato>
          </div>
          {share < 1 && (
            <div className="mt-3 flex items-center gap-1.5 border-t border-zinc-800/60 pt-3 text-[11px] text-sky-200/80">
              <Users className="h-3.5 w-3.5 shrink-0" />
              Compartido con {loan.sharedWith} · los importes son los del préstamo completo,
              tu parte es el {Math.round(share * 100)}%
            </div>
          )}
        </div>

        {/* La planilla. En el teléfono las cinco columnas entran apretando el padding y
            dejando que el detalle use varias líneas: lo que no puede pasar es que Debe,
            Haber y Saldo —que son el punto de la ficha— queden fuera de pantalla. El
            overflow queda como red por si un importe larguísimo no entra igual. */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-800/70">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-2 py-2.5 font-medium sm:px-3">Fecha</th>
                <th className="px-2 py-2.5 font-medium sm:px-3">Detalle</th>
                <th className="px-2 py-2.5 text-right font-medium sm:px-3">Debe</th>
                <th className="px-2 py-2.5 text-right font-medium sm:px-3">Haber</th>
                <th className="px-2 py-2.5 text-right font-medium sm:px-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const estilo = KIND_STYLE[f.kind];
                return (
                  <tr key={`${f.date}-${f.kind}-${i}`}
                    className="border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-900/40">
                    <td className="whitespace-nowrap px-2 py-2.5 text-[10px] tabular-nums text-zinc-500 sm:px-3 sm:text-[11px]">
                      {formatDate(f.date)}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${estilo.dot}`} aria-hidden />
                        <span className="text-[11px] leading-snug text-zinc-300 sm:text-xs">{f.detalle}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] tabular-nums sm:px-3 sm:text-xs">
                      {f.debe > 0
                        ? <span className="text-rose-300"><Money value={f.debe} hide={hide} currency={cur} /></span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] tabular-nums sm:px-3 sm:text-xs">
                      {f.haber > 0
                        ? <span className="text-emerald-400"><Money value={f.haber} hide={hide} currency={cur} /></span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] font-semibold tabular-nums text-zinc-100 sm:px-3 sm:text-xs">
                      <Money value={f.saldo} hide={hide} currency={cur} />
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-zinc-600">
                    Todavía no hay operaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="border-t border-zinc-800 bg-zinc-900/60 text-xs">
                  <td className="px-2 py-2.5 text-[10px] uppercase tracking-wider text-zinc-500 sm:px-3" colSpan={2}>
                    Totales
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] font-medium tabular-nums text-rose-300 sm:px-3 sm:text-xs">
                    <Money value={totales.debe} hide={hide} currency={cur} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] font-medium tabular-nums text-emerald-400 sm:px-3 sm:text-xs">
                    <Money value={totales.haber} hide={hide} currency={cur} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right text-[11px] font-semibold tabular-nums text-zinc-100 sm:px-3 sm:text-xs">
                    <Money value={saldoFinal} hide={hide} currency={cur} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Referencia de colores: la planilla se lee de un vistazo si se sabe qué es cada
            punto, y evita tener que repetir la palabra en cada fila. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11px] text-zinc-500">
          {(Object.keys(KIND_STYLE) as LedgerKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${KIND_STYLE[k].dot}`} aria-hidden />
              {KIND_STYLE[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-zinc-600">
            <ArrowUpRight className="h-3 w-3 text-rose-300" />
            Debe sube la deuda
          </span>
          <span className="flex items-center gap-1.5 text-zinc-600">
            <ArrowDownLeft className="h-3 w-3 text-emerald-400" />
            Haber la baja
          </span>
        </div>

        {/* El desfasaje de un ciclo es intencional y confunde si no se explica. */}
        {filas.some((f) => f.detalle.includes("ciclo en curso")) && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-900/30 bg-amber-950/15 px-3 py-2.5 text-[11px] text-amber-200/80">
            <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              El interés del ciclo en curso ya está en la deuda: se cobra por adelantado al
              prestar. Se va a registrar como ganancia recién cuando el período cierre.
            </span>
          </div>
        )}
        {filas.some((f) => f.detalle.includes("con su interés")) && (
          <div className="flex items-start gap-2 rounded-2xl border border-teal-900/30 bg-teal-950/15 px-3 py-2.5 text-[11px] text-teal-200/80">
            <PlusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Los adicionales entregados en el ciclo abierto muestran el capital más el
              interés de ese ciclo, que también se cobra por adelantado.
            </span>
          </div>
        )}
      </div>
    </Sheet>
  );
}
