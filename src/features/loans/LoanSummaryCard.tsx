// Tarjeta de arriba del detalle: estado, deuda restante, progreso y fechas del préstamo.
import { CalendarClock, CalendarRange, FastForward, Users } from "lucide-react";
import { todayISO, formatDate, daysBetween, getLoanCycleDays, myShare, advancedCycles } from "../../lib/utils.js";
import { GUARANTY_TYPES } from "../../lib/constants.js";
import { Badge, StatusBadge, Money, AnimatedMoney, ProgressBar } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanSummaryCardProps {
  loan: ResolvedLoan;
  hide: boolean;
  cur: string;
}

export default function LoanSummaryCard({ loan, hide, cur }: LoanSummaryCardProps) {
  // Mismo cálculo que usan `getNextRenewalDate`, `remainingDebt` y el resto de la app
  // (prioriza paymentType/customDays sobre la distancia cruda entre fechas): si acá se
  // calculara distinto, la línea de tiempo mostraría vencimientos que no coinciden con
  // el mapa de vencimientos ni con "Próximos vencimientos" de Inicio.
  const loanTermDays = getLoanCycleDays(loan);
  const G = GUARANTY_TYPES[loan.guarantyType as keyof typeof GUARANTY_TYPES] || GUARANTY_TYPES.other;
  const daysOverdue =
    loan._status === "overdue" ? Math.max(0, daysBetween(loan.dueDate, todayISO())) : 0;
  const advCycles = advancedCycles(loan);
  const monthsOverdue = Math.floor(daysOverdue / 30);
  const extraDaysOverdue = daysOverdue % 30;
  const overdueLabel =
    monthsOverdue > 0
      ? `${monthsOverdue} ${monthsOverdue === 1 ? "mes" : "meses"}${extraDaysOverdue > 0 ? ` ${extraDaysOverdue}d` : ""}`
      : `${daysOverdue}d`;

  return (
    <div className="fa-grain relative overflow-hidden rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/60 to-zinc-950 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={loan._status} />
          {loan.sharedWith && (
            <Badge tone="info">
              <Users className="h-3 w-3" />
              {loan.sharedWith} · mío {Math.round(myShare(loan) * 100)}%
            </Badge>
          )}
          {advCycles > 0 && (
            <Badge tone="purple">
              <FastForward className="h-3 w-3" />
              +{advCycles} adelantado{advCycles > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Badge tone="bronze">
          <G.Icon className="h-3 w-3" />
          {G.label}
        </Badge>
      </div>
      {loan._status === "overdue" && daysOverdue > 0 && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-rose-900/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-medium text-rose-300">
          <CalendarClock className="h-3 w-3" />
          Vencido hace {overdueLabel}
        </div>
      )}
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">Deuda restante</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
        <AnimatedMoney value={loan._remaining} hide={hide} currency={cur} duration={800} />
      </div>
      <div className="mt-3">
        <ProgressBar value={loan._progress} tone={loan._status === "overdue" ? "rose" : "bronze"} />
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Cobrado{" "}
            <Money value={loan._paid} hide={hide} currency={cur} className="text-zinc-300" />
          </span>
          <span>
            Total acumulado{" "}
            <Money value={loan._compoundReturn} hide={hide} currency={cur}
              className={loan._compoundReturn > loan._return ? "text-rose-300" : "text-zinc-300"} />
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
        <span className="whitespace-nowrap">
          <span className="text-zinc-500">Inicio </span>
          <span className="font-medium text-zinc-200">{formatDate(loan.startDate)}</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span className="whitespace-nowrap">
          <span className="text-zinc-500">Plazo </span>
          <span className="font-medium text-zinc-200">{loanTermDays} días</span>
        </span>
        <span className="text-zinc-700">·</span>
        <span className="whitespace-nowrap">
          <span className="text-zinc-500">Vence </span>
          <span className={`font-medium ${loan._status === "overdue" ? "text-rose-400" : "text-zinc-200"}`}>
            {formatDate(loan.dueDate)}
          </span>
        </span>
      </div>
    </div>
  );
}
