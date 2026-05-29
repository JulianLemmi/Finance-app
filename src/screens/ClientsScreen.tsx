// Listado de clientes ordenado por deuda activa. Muestra nivel de riesgo,
// cantidad de préstamos activos y deuda total por cliente.
import { useState, useMemo } from "react";
import { Plus, Search, Users, Phone } from "lucide-react";
import { useApp } from "../store/index.js";
import { EmptyState, Input, Button, Money, Badge, RiskBadge } from "../components/ui.jsx";
import type { ResolvedClient } from "../types";

interface ClientCardProps {
  client: ResolvedClient;
  onOpen: (id: string) => void;
}

function ClientCard({ client, onOpen }: ClientCardProps) {
  const { state } = useApp();
  const initials = client.name.split(" ").filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join("");

  return (
    <button
      onClick={() => onOpen(client.id)}
      className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3.5 text-left transition-all hover:bg-zinc-900"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800 to-amber-950 text-sm font-semibold text-amber-100">
        {initials || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-100">{client.name}</span>
          {client._overdueCount > 0 && (
            <Badge tone="danger">
              {client._overdueCount} atraso{client._overdueCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
          <RiskBadge risk={client.riskLevel} />
          <span>{client._active.length} activo{client._active.length === 1 ? "" : "s"}</span>
          {client.phone && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {client.phone}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums text-zinc-100">
          <Money value={client._debt} hide={state.settings.hideBalances} currency={state.settings.currency} />
        </div>
        <div className="text-[11px] text-emerald-400 tabular-nums">
          +<Money value={client._totalGenerated} hide={state.settings.hideBalances} currency={state.settings.currency} />
        </div>
      </div>
    </button>
  );
}

export default function ClientsScreen() {
  const { state, dispatch, derived } = useApp();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let arr = derived.clientStats;
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((c) => c.name.toLowerCase().includes(q));
    }
    return arr.sort((a, b) => {
      if (b._active.length !== a._active.length) return b._active.length - a._active.length;
      return b._debt - a._debt;
    });
  }, [derived.clientStats, query]);

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Clientes</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {state.clients.length} perfil{state.clients.length === 1 ? "" : "es"} registrado{state.clients.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="bronze" Icon={Plus}
          onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "client-form" } })}>
          Nuevo
        </Button>
      </div>

      <Input placeholder="Buscar por nombre..." value={query}
        onChange={(e) => setQuery(e.target.value)} Icon={Search} />

      {filtered.length === 0 ? (
        <EmptyState Icon={Users}
          title={query ? "Sin resultados" : "No tenés clientes todavía"}
          hint={query ? "Probá con otro nombre."
            : "Cargá un cliente para llevar un historial detallado por persona."}
          action={!query && (
            <Button variant="bronze" Icon={Plus}
              onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "client-form" } })}>
              Agregar cliente
            </Button>
          )}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c}
              onOpen={(id) => dispatch({ type: "OPEN_MODAL", payload: { type: "client-detail", payload: { id } } })} />
          ))}
        </div>
      )}
    </div>
  );
}
