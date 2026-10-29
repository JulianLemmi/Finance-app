// Sheet "Sumar capital": el cliente pide más plata sobre el mismo préstamo, que crece sin
// refinanciar (conserva tasa, ciclo y vencimiento). Se monta sólo cuando se abre.
import { useState } from "react";
import { Calendar, MessageSquare, PlusCircle, X } from "lucide-react";
import { uid, todayISO, formatInterest, formatMoney, formatShortDate, myShare } from "../../lib/utils.js";
import { extraDebtImpact, nextPeriodInterest } from "../../lib/calcs.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Card, Money } from "../../components/ui.jsx";
import { InfoCell } from "./loanDetailParts.jsx";
import type { ResolvedLoan } from "../../types";

interface ExtraCapitalSheetProps {
  open: boolean;
  onClose: () => void;
  loan: ResolvedLoan;
  hide: boolean;
  cur: string;
}

export default function ExtraCapitalSheet({ open, onClose, loan, hide, cur }: ExtraCapitalSheetProps) {
  const { dispatch } = useApp();
  const [extraAmount, setExtraAmount] = useState("");
  const [extraDate, setExtraDate] = useState(() => todayISO());
  const [extraNote, setExtraNote] = useState("");

  const extraValue = Number(extraAmount);
  // El date picker tiene tope en hoy (`max`), pero `max` no impide TIPEAR una fecha futura.
  // Un adicional a futuro todavía no está en la calle y el motor no lo cuenta: se guardaba
  // igual y el usuario veía que "no pasaba nada" con su plata.
  const extraFutura = !!extraDate && extraDate > todayISO();
  const extraValido = Number.isFinite(extraValue) && extraValue > 0 && !!extraDate && !extraFutura;
  // Lo que el adicional le suma a la deuda hoy: capital + el interés de su ciclo, cobrado
  // por adelantado igual que al dar de alta el préstamo (ver `extraDebtImpact`).
  const extraImpacto = extraValido ? extraDebtImpact(loan, extraValue) : 0;

  const onExtraConfirm = () => {
    if (!extraValido) return;
    dispatch({
      type: "ADD_LOAN_EXTRA",
      payload: {
        loanId: loan.id,
        extra: { id: uid("ext"), amount: extraValue, date: extraDate, note: extraNote.trim() || undefined, createdAt: Date.now() },
      },
    });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}
      title="Sumar capital al préstamo"
      subtitle={`${loan.clientName} · sin refinanciar`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            {extraValido ? (
              <>
                La deuda sube{" "}
                <span className="font-medium tabular-nums text-teal-300">
                  +<Money value={extraImpacto} hide={hide} currency={cur} />
                </span>
              </>
            ) : (
              "Ingresá cuánto le estás prestando de más"
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="bronze" Icon={PlusCircle} onClick={onExtraConfirm} disabled={!extraValido}>
              Sumar capital
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-teal-900/30 bg-teal-950/15 p-4 text-xs text-teal-200/80">
          Usalo cuando el cliente pide más plata sobre el mismo préstamo. La tasa, el ciclo
          y la fecha de vencimiento no se tocan: sólo crece el capital. El interés del ciclo
          en curso se cobra por adelantado, igual que al dar de alta el préstamo.
        </div>
        {/* En interés fijo el cargo del período es un monto, no un %: sumar capital
            aumenta lo que te deben pero no lo que ganás. Avisarlo acá evita la sorpresa
            de ver "Próxima ganancia" sin moverse después de confirmar. */}
        {loan.interestMode === "fixed" ? (
          <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs text-amber-200/90">
            <span className="font-semibold">Este préstamo cobra un monto fijo por período</span>{" "}
            ({formatMoney(Number(loan.fixedInterest || 0), hide, cur)}), que no depende del
            capital. Sumar capital aumenta lo que te deben, pero la ganancia por ciclo queda
            igual. Si querés cobrar más, subí el interés fijo desde "Editar".
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4 text-xs text-zinc-400">
            El interés es un {formatInterest(loan, cur)} del capital, así que al sumar plata
            la ganancia por ciclo sube en la misma proporción.
          </div>
        )}
        <Input label="Cuánto le prestás de más" type="number" inputMode="numeric" placeholder="50000"
          value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} Icon={PlusCircle} />
        {/* Tope en hoy: la entrega es un hecho ya ocurrido. Una fecha futura todavía no
            es plata en la calle y sólo confunde al leer la deuda. */}
        <Input label="Fecha de la entrega" type="date" Icon={Calendar} max={todayISO()}
          value={extraDate} onChange={(e) => setExtraDate(e.target.value)}
          error={extraFutura ? "La entrega no puede ser a futuro" : null} />
        <Input label="Nota (opcional)" placeholder="para la moto, adelanto de sueldo..."
          value={extraNote} onChange={(e) => setExtraNote(e.target.value)} Icon={MessageSquare} />

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4 text-sm">
          <InfoCell label="Capital hoy">
            <Money value={loan._principal} hide={hide} currency={cur} />
          </InfoCell>
          <InfoCell label="Pasa a" tone="text-teal-300">
            <Money value={loan._principal + (extraValido ? extraValue : 0)} hide={hide} currency={cur} />
          </InfoCell>
          <InfoCell label="Deuda actual">
            <Money value={loan._remaining} hide={hide} currency={cur} />
          </InfoCell>
          <InfoCell label="Deuda nueva" tone="text-teal-300">
            <Money value={loan._remaining + extraImpacto} hide={hide} currency={cur} />
          </InfoCell>
        </div>

        {extraValido && (
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4 text-xs text-zinc-400">
            Próxima ganancia del ciclo:{" "}
            <span className="font-medium tabular-nums text-emerald-400">
              <Money value={nextPeriodInterest(loan) * myShare(loan)} hide={hide} currency={cur} />
            </span>
            {" → "}
            <span className="font-medium tabular-nums text-emerald-300">
              <Money
                value={nextPeriodInterest({ ...loan, extras: [...(loan.extras || []), { id: "preview", amount: extraValue, date: extraDate }] }) * myShare(loan)}
                hide={hide} currency={cur}
              />
            </span>
          </div>
        )}

        {(loan.extras || []).length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
              Adicionales ya cargados
            </div>
            <Card className="divide-y divide-zinc-800/60">
              {[...(loan.extras || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium tabular-nums text-teal-200">
                      +<Money value={e.amount} hide={hide} currency={cur} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {formatShortDate(e.date)}
                      {e.date > todayISO() && <span className="text-amber-400/80"> · todavía no entregado</span>}
                      {e.note ? ` · ${e.note}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => dispatch({ type: "DELETE_LOAN_EXTRA", payload: { loanId: loan.id, extraId: e.id } })}
                    className="shrink-0 rounded-lg p-1 text-zinc-600 transition-colors hover:text-rose-400"
                    title="Quitar este adicional"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </Sheet>
  );
}
