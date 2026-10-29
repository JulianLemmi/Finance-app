// Sheet "Adelantar vencimiento". Dos cobros distintos, no dos variantes del mismo: el ciclo
// COMPLETO es para el cliente que paga antes de vencer y corre el calendario; el MEDIO ciclo
// es para el que aparece unos días después del vencimiento y no lo mueve. Se monta sólo
// cuando se abre, así que la fecha y el modo arrancan limpios cada vez.
import { useState } from "react";
import { Calendar, FastForward, Undo2 } from "lucide-react";
import {
  todayISO, addDays, addCalendarMonths, formatDate, getLoanCycleDays, advancedCycles,
  type LoanCycleInput,
} from "../../lib/utils.js";
import { nextPeriodInterest, halfCycleCharged, periodInterest, HALF_CYCLE_FRACTION } from "../../lib/calcs.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Money } from "../../components/ui.jsx";
import { InfoCell } from "./loanDetailParts.jsx";
import type { ResolvedLoan } from "../../types";

interface AdvanceSheetProps {
  open: boolean;
  onClose: () => void;
  loan: ResolvedLoan;
  /** Próxima fecha de cobro actual (`nextCollectionDate`), ya resuelta por el padre. */
  nextDueDate: string;
  hide: boolean;
  cur: string;
}

export default function AdvanceSheet({ open, onClose, loan, nextDueDate, hide, cur }: AdvanceSheetProps) {
  const { dispatch } = useApp();
  const [advanceDate, setAdvanceDate] = useState(() => todayISO());
  // "half" = el cliente vino unos días tarde y se le cobra la mitad del interés del
  // período; el calendario no se mueve. "full" = el adelanto de siempre.
  const [advanceMode, setAdvanceMode] = useState<"full" | "half">("full");

  const advCycles = advancedCycles(loan);
  const halfCount = (loan.halfAdvancedAt || []).length;
  // Lo que suma el adelanto según el modo. `nextPeriodInterest` ya descuenta lo que se haya
  // cobrado por adelantado, así que el medio ciclo se calcula sobre el ciclo entero.
  const halfAlreadyCharged = advanceMode === "half" && halfCycleCharged(loan, advanceDate);
  const advanceCharge = advanceMode === "half"
    ? HALF_CYCLE_FRACTION * periodInterest(loan, loan._remaining)
    : nextPeriodInterest(loan);

  const onAdvanceConfirm = () => {
    if (!advanceDate) return;
    dispatch(advanceMode === "half"
      ? { type: "ADVANCE_HALF_CYCLE", payload: { loanId: loan.id, date: advanceDate } }
      : { type: "ADVANCE_CYCLE", payload: { loanId: loan.id, date: advanceDate } });
    onClose();
  };

  const onUndoAdvance = () => {
    dispatch({ type: "UNDO_ADVANCE_CYCLE", payload: { loanId: loan.id } });
  };

  const onUndoHalf = () => {
    dispatch({ type: "UNDO_HALF_CYCLE", payload: { loanId: loan.id } });
  };

  return (
    <Sheet open={open} onClose={onClose}
      title="Adelantar vencimiento"
      subtitle={`Cobrarle a ${loan.clientName} un ciclo fuera de fecha`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            Se sumará{" "}
            <span className="font-medium text-amber-400 tabular-nums">
              <Money value={advanceCharge} hide={hide} currency={cur} />
            </span>
            {" "}a la deuda
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="bronze" Icon={FastForward} onClick={onAdvanceConfirm}
              disabled={!advanceDate || halfAlreadyCharged}>
              Confirmar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Dos cobros distintos, no dos variantes del mismo: el entero corre el
            calendario y el medio no. */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { v: "full" as const, label: "Ciclo completo", hint: "Paga antes de vencer" },
            { v: "half" as const, label: "Medio ciclo", hint: "Vino unos días tarde" },
          ]).map((o) => (
            <button key={o.v} onClick={() => setAdvanceMode(o.v)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                advanceMode === o.v
                  ? "border-amber-700/60 bg-amber-950/25 text-amber-200"
                  : "border-zinc-800/70 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900"
              }`}>
              <div className="text-sm font-medium">{o.label}</div>
              <div className="mt-0.5 text-[11px] opacity-70">{o.hint}</div>
            </button>
          ))}
        </div>

        {advanceMode === "half" ? (
          <div className="rounded-2xl border border-sky-900/30 bg-sky-950/15 p-4 text-xs text-sky-200/80">
            Para cuando el cliente aparece unos días después del vencimiento: se le cobra
            la mitad del interés del período en vez del mes entero.{" "}
            <span className="font-semibold">El vencimiento no se mueve</span> — vuelve a
            vencer el {formatDate(nextDueDate)} y ahí se cobra la mitad que quedaba, y
            después sigue con los meses completos.
          </div>
        ) : (
          <div className="rounded-2xl border border-purple-900/30 bg-purple-950/15 p-4 text-xs text-purple-200/80">
            Usalo cuando el cliente quiere pagar un vencimiento antes de que llegue la fecha.
            Se capitaliza el próximo ciclo como si ya hubiera vencido y el siguiente
            vencimiento pasa a la fecha posterior.
          </div>
        )}

        {halfAlreadyCharged && (
          <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 px-3 py-2.5 text-[11px] text-amber-200/90">
            Este período ya tiene su medio ciclo cobrado. Dos medios son el mes entero: si
            querés cobrarlo, usá "Ciclo completo".
          </div>
        )}
        {/* Tope en hoy: el adelanto es un hecho ya ocurrido ("el cliente vino a pagar
            antes"), no una fecha futura. Uno fechado adelante no capitaliza nada
            todavía y sólo confunde al leer la deuda. */}
        <Input label="Fecha del adelanto" type="date" Icon={Calendar} max={todayISO()}
          value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4 text-sm">
          <InfoCell label="Deuda actual">
            <Money value={loan._remaining} hide={hide} currency={cur} />
          </InfoCell>
          <InfoCell label="Interés a devengar" tone="text-amber-400">
            +<Money value={advanceCharge} hide={hide} currency={cur} />
          </InfoCell>
          <InfoCell label="Próximo vencimiento actual" tone="text-zinc-300" numeric={false}>
            {formatDate(nextDueDate)}
          </InfoCell>
          <InfoCell label="Pasará a" tone={advanceMode === "half" ? "text-sky-300" : "text-purple-300"} numeric={false}>
            {advanceMode === "half"
              ? `${formatDate(nextDueDate)} · no se mueve`
              : formatDate(loanPeriodDateAfterAdvance(loan, nextDueDate))}
          </InfoCell>
        </div>
        {advanceMode === "half" && !halfAlreadyCharged && (
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2.5 text-[11px] text-zinc-500">
            El {formatDate(nextDueDate)} se le va a cobrar{" "}
            <span className="font-medium tabular-nums text-zinc-300">
              <Money value={Math.max(0, nextPeriodInterest(loan) - advanceCharge)} hide={hide} currency={cur} />
            </span>{" "}
            en vez de{" "}
            <span className="tabular-nums">
              <Money value={nextPeriodInterest(loan)} hide={hide} currency={cur} />
            </span>.
          </div>
        )}
        {(advCycles > 0 || halfCount > 0) && (
          <div className="flex flex-col gap-2">
            {advCycles > 0 && (
              <button onClick={onUndoAdvance}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300">
                <Undo2 className="h-3.5 w-3.5" />
                Deshacer último adelanto ({advCycles} en total)
              </button>
            )}
            {halfCount > 0 && (
              <button onClick={onUndoHalf}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300">
                <Undo2 className="h-3.5 w-3.5" />
                Deshacer último medio ciclo ({halfCount} en total)
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// Fecha del próximo vencimiento si sumáramos un adelanto más. Se calcula avanzando un
// ciclo desde el próximo actual, respetando `paymentType` (mes calendario para "30").
function loanPeriodDateAfterAdvance(loan: LoanCycleInput, nextDueDate: string): string {
  if (loan.paymentType === "30") return addCalendarMonths(nextDueDate, 1);
  return addDays(nextDueDate, getLoanCycleDays(loan));
}
