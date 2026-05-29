// Muestra la cadena de refinanciaciones de un préstamo (original → refinanciaciones).
// Si la cadena tiene un solo elemento no renderiza nada. Cada item abre el
// detalle del préstamo correspondiente al hacer click.
import { Layers, ChevronRight } from "lucide-react";
import { formatShortDate } from "../../lib/utils.js";
import { SectionTitle, Money, StatusBadge } from "../../components/ui.jsx";
import { useApp } from "../../store/index.js";
import type { ResolvedLoan } from "../../types";

interface LoanChainProps {
  chain: ResolvedLoan[];
  currentLoanId: string;
  onOpenLoan: (id: string) => void;
}

export default function LoanChain({ chain, currentLoanId, onOpenLoan }: LoanChainProps) {
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  if (chain.length <= 1) return null;

  return (
    <div>
      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <Layers className="h-3 w-3" />
          Historial de refinanciaciones
        </span>
      </SectionTitle>
      <div className="flex flex-col gap-1">
        {chain.map((l, idx) => {
          const isCurrent = l.id === currentLoanId;
          return (
            <button
              key={l.id}
              disabled={isCurrent}
              onClick={() => !isCurrent && onOpenLoan(l.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                isCurrent
                  ? "border-amber-700/50 bg-amber-950/20"
                  : "border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-900"
              }`}
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isCurrent ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${isCurrent ? "text-amber-200" : "text-zinc-300"}`}>
                    {idx === 0 ? "Original" : `Refinanciación #${idx}`}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-400">
                      Actual
                    </span>
                  )}
                  <StatusBadge status={l._status} />
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-600">
                  {formatShortDate(l.startDate)} → {formatShortDate(l.dueDate)} · {Number(l.interestRate).toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold tabular-nums text-zinc-200">
                  <Money value={l.amount} hide={hide} currency={cur} />
                </div>
              </div>
              {!isCurrent && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-700" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
