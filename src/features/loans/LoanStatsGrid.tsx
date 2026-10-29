// Grilla de cifras del préstamo: capital, próxima ganancia, interés y próximo vencimiento.
import { formatDate, formatInterest, formatMoney, myShare } from "../../lib/utils.js";
import { Card, Money } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanStatsGridProps {
  loan: ResolvedLoan;
  /** Próxima fecha de cobro (`nextCollectionDate`), ya resuelta por el padre. */
  nextDueDate: string;
  hide: boolean;
  cur: string;
}

export default function LoanStatsGrid({ loan, nextDueDate, hide, cur }: LoanStatsGridProps) {
  // Lo que se sumó al capital inicial con "Sumar capital".
  const totalExtras = loan._principal - Number(loan.amount);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
      {[
        // Con adicionales el título cambia: "inicial" sería el número equivocado
        // (la plata prestada es más) y el detalle va justo abajo.
        {
          label: totalExtras > 0 ? "Capital prestado" : "Capital inicial",
          value: (
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <Money value={loan._principal} hide={hide} currency={cur} />
              {totalExtras > 0 && (
                <span className="text-[10px] font-normal text-teal-300/80">
                  {formatMoney(Number(loan.amount), hide, cur)} + {formatMoney(totalExtras, hide, cur)}
                </span>
              )}
            </span>
          ),
          cls: "text-zinc-100",
        },
        { label: "Próx. ganancia", value: <Money value={loan._nextProfit * myShare(loan)} hide={hide} currency={cur} />, cls: "text-emerald-400" },
        { label: "Interés", value: formatInterest(loan, cur), cls: "text-zinc-100" },
        { label: "Vence", value: formatDate(nextDueDate), cls: loan._status === "overdue" ? "text-rose-400" : "text-zinc-100" },
      ].map(({ label, value, cls }) => (
        <Card key={label} className="p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
          <div className={`mt-1 text-sm font-semibold tabular-nums ${cls}`}>{value}</div>
        </Card>
      ))}
    </div>
  );
}
