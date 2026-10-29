// Estacionamiento: el cargo mensual que cobra un tercero por guardar el auto, con sus cobros.
// Es registro, no cuenta: no entra en ninguna fórmula del préstamo.
import { useState } from "react";
import { Banknote, Calendar, Car as CarIcon, Plus, X } from "lucide-react";
import { uid, todayISO, daysBetween, formatMoney, formatShortDate } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import { Button, Input, InlineDelete } from "../../components/ui.jsx";
import { MiniStat } from "./loanDetailParts.jsx";
import type { ResolvedLoan } from "../../types";

interface ParkingCardProps {
  loan: ResolvedLoan;
  hide: boolean;
  cur: string;
}

export default function ParkingCard({ loan, hide, cur }: ParkingCardProps) {
  const { dispatch } = useApp();
  const [parkingAmount, setParkingAmount] = useState("");
  const [parkingDate, setParkingDate] = useState(() => todayISO());
  const [parkingNote, setParkingNote] = useState("");
  const [showParkingForm, setShowParkingForm] = useState(false);

  // Sin cargo mensual no hay tarjeta. Los hooks van antes de este return.
  const parkingFee = Number(loan.parkingFee || 0);
  if (!(parkingFee > 0)) return null;

  const parkingMonthsAccrued = Math.max(1, 1 + Math.floor(Math.max(0, daysBetween(loan.startDate, todayISO())) / 30));
  const parkingAccrued = parkingFee * parkingMonthsAccrued;
  const parkingCollected = (loan.parkingPayments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
  const parkingPending = Math.max(0, parkingAccrued - parkingCollected);

  const addParkingPayment = () => {
    const amount = Number(parkingAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    dispatch({
      type: "ADD_PARKING_PAYMENT",
      payload: {
        loanId: loan.id,
        payment: { id: uid("pkg"), amount, date: parkingDate, note: parkingNote.trim() || undefined, createdAt: Date.now() },
      },
    });
    setParkingAmount(""); setParkingNote(""); setParkingDate(todayISO());
    setShowParkingForm(false);
  };

  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400">
          <CarIcon className="h-3 w-3" />
          Estacionamiento
          {loan.parkingRecipient && (
            <span className="normal-case tracking-normal text-zinc-500">
              · para {loan.parkingRecipient}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowParkingForm((v) => !v); setParkingAmount(String(parkingFee)); setParkingNote(""); setParkingDate(todayISO()); }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          {showParkingForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showParkingForm ? "Cancelar" : "Registrar cobro"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
        <MiniStat label="Cargo mensual">{formatMoney(parkingFee, hide, cur)}</MiniStat>
        <MiniStat label={`Devengado (${parkingMonthsAccrued}m)`}>{formatMoney(parkingAccrued, hide, cur)}</MiniStat>
        <MiniStat label="Cobrado" tone="text-emerald-400">{formatMoney(parkingCollected, hide, cur)}</MiniStat>
        <MiniStat label="Pendiente" tone={parkingPending > 0 ? "text-amber-400" : "text-zinc-500"}>
          {formatMoney(parkingPending, hide, cur)}
        </MiniStat>
      </div>
      {showParkingForm && (
        <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Monto" type="number" inputMode="decimal" Icon={Banknote}
              value={parkingAmount}
              onChange={(e) => setParkingAmount(e.target.value)} />
            <Input label="Fecha" type="date" Icon={Calendar}
              value={parkingDate}
              onChange={(e) => setParkingDate(e.target.value)} />
          </div>
          <input
            placeholder="Nota (opcional)"
            value={parkingNote}
            onChange={(e) => setParkingNote(e.target.value)}
            className="w-full rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700/60 focus:ring-1 focus:ring-amber-700/40"
          />
          <div className="flex justify-end">
            <Button variant="bronze" size="sm" onClick={addParkingPayment} disabled={!(Number(parkingAmount) > 0)}>
              Guardar cobro
            </Button>
          </div>
        </div>
      )}
      {(loan.parkingPayments || []).length > 0 && (
        <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
          {[...(loan.parkingPayments || [])]
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
            .map((p) => (
              <div key={p.id} className="group flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium tabular-nums text-zinc-200">
                    {formatMoney(Number(p.amount), hide, cur)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {formatShortDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <InlineDelete
                  icon="x" label="Eliminar cobro" revealOnHover
                  onConfirm={() => dispatch({ type: "DELETE_PARKING_PAYMENT", payload: { loanId: loan.id, paymentId: p.id ?? "" } })}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
