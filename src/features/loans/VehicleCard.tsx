// Datos del auto que queda en garantía. Es registro, no cuenta: no entra en ninguna fórmula.
import { Car as CarIcon } from "lucide-react";
import { Money } from "../../components/ui.jsx";
import type { LoanVehicle } from "../../types";

interface VehicleCardProps {
  vehicle: LoanVehicle;
  hide: boolean;
  cur: string;
}

export default function VehicleCard({ vehicle, hide, cur }: VehicleCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
        <CarIcon className="h-3.5 w-3.5" />
        Datos del auto
      </div>
      <div className="mt-3 space-y-2.5">
        {([
          ["Modelo", vehicle.model],
          ["Versión", vehicle.version],
        ] as const).map(([k, v]) => v ? (
          <div key={k} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="shrink-0 text-zinc-500">{k}</span>
            <span className="truncate text-right font-medium text-zinc-200">{v}</span>
          </div>
        ) : null)}
        {vehicle.plate && (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="shrink-0 text-zinc-500">Patente</span>
            {/* La patente se lee de un lado al otro: monoespaciada y separada. */}
            <span className="rounded-md border border-zinc-700/70 bg-zinc-950/60 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-zinc-100">
              {vehicle.plate}
            </span>
          </div>
        )}
        {/* Sólo se muestran los sí/no que el usuario cargó: un dato en blanco no
            es "no", y pintarlo en rojo sería afirmar algo que nadie verificó. */}
        {([
          ["Cédula", vehicle.hasCedula],
          ["Deuda 08 al día", vehicle.debt08UpToDate],
        ] as const).map(([k, v]) => typeof v === "boolean" ? (
          <div key={k} className="flex items-center justify-between gap-3 text-xs">
            <span className="shrink-0 text-zinc-500">{k}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              v ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
            }`}>
              {v ? "Sí" : "No"}
            </span>
          </div>
        ) : null)}
        {/* Cuánto se debe va en su propia fila, no apretado contra el "No":
            es un importe y se lee como el resto de los importes de la pantalla. */}
        {vehicle.debt08Amount !== undefined && (
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 pt-2.5 text-xs">
            <span className="shrink-0 text-zinc-500">Debe</span>
            <span className="font-semibold tabular-nums text-rose-300">
              <Money value={vehicle.debt08Amount} hide={hide} currency={cur} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
