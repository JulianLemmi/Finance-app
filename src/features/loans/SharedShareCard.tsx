// "Tu parte": las cifras del préstamo prorrateadas por lo que es tuyo, cuando es compartido.
import { Users } from "lucide-react";
import { myShare } from "../../lib/utils.js";
import { Money } from "../../components/ui.jsx";
import { MiniStat } from "./loanDetailParts.jsx";
import type { ResolvedLoan } from "../../types";

interface SharedShareCardProps {
  loan: ResolvedLoan;
  hide: boolean;
  cur: string;
}

export default function SharedShareCard({ loan, hide, cur }: SharedShareCardProps) {
  const share = myShare(loan);
  return (
    <div className="rounded-2xl border border-blue-900/30 bg-blue-950/15 p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-blue-300/80">
        <Users className="h-3 w-3" />
        Tu parte ({Math.round(myShare(loan) * 100)}%)
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
        {/* Capital vigente: tu parte de los adicionales también es tu plata. */}
        <MiniStat label="Tu capital">
          <Money value={loan._principal * share} hide={hide} currency={cur} />
        </MiniStat>
        <MiniStat label="Tu ganancia esperada" tone="text-emerald-400">
          <Money value={loan._profit * share} hide={hide} currency={cur} />
        </MiniStat>
        <MiniStat label="Cobrado tuyo">
          <Money value={loan._paid * share} hide={hide} currency={cur} />
        </MiniStat>
        <MiniStat label="Deuda pendiente tuya">
          <Money value={loan._remaining * share} hide={hide} currency={cur} />
        </MiniStat>
      </div>
    </div>
  );
}
