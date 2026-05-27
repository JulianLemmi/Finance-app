import { useState, useMemo } from "react";
import { Plus, Car, Search, ChevronRight, Gauge, Palette } from "lucide-react";
import { useApp } from "../store/index.js";
import { CAR_STATUSES } from "../lib/constants.js";
import { Button, Input, EmptyState, Money } from "../components/ui.jsx";
import CarFormSheet from "../features/cars/CarFormSheet.jsx";

// Badge coloreado según el estado del auto
function StatusBadge({ status }) {
  const s = CAR_STATUSES[status] || CAR_STATUSES.available;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{ borderColor: `${s.color}40`, background: `${s.color}18`, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function CarCard({ car, onOpen }) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const hide = state.settings.hideBalances;

  const totalCost = Number(car.purchasePrice || 0)
    + (car.prepCosts || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const margin = Number(car.salePrice || 0) - totalCost;
  const marginPct = totalCost > 0 ? (margin / totalCost) * 100 : null;
  const isSold = car.status === "sold" || car.status === "delivered";

  return (
    <button
      onClick={() => onOpen(car)}
      className="group relative w-full overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-4 text-left transition-all hover:bg-zinc-900"
    >
      {/* Status left accent */}
      <span className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl"
        style={{ background: CAR_STATUSES[car.status]?.color || "#52525b" }} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100">
              {car.brand} {car.model}
            </span>
            {car.year && (
              <span className="text-xs text-zinc-500">{car.year}</span>
            )}
            <StatusBadge status={car.status} />
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
            {car.km > 0 && (
              <span className="flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                {Number(car.km).toLocaleString("es-AR")} km
              </span>
            )}
            {car.color && (
              <span className="flex items-center gap-1">
                <Palette className="h-3 w-3" />
                {car.color}
              </span>
            )}
            {car.plate && (
              <span className="font-mono text-zinc-600">{car.plate}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-zinc-100">
              <Money value={isSold ? Number(car.salePrice || 0) : totalCost} hide={hide} currency={cur} />
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {isSold ? "Precio venta" : "Costo total"}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-600" />
        </div>
      </div>

      {/* Margin row */}
      {Number(car.salePrice) > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-zinc-500">
              Compra <span className="tabular-nums text-zinc-300">
                <Money value={Number(car.purchasePrice || 0)} hide={hide} currency={cur} />
              </span>
            </span>
            {(car.prepCosts || []).length > 0 && (
              <span className="text-zinc-500">
                Prep. <span className="tabular-nums text-zinc-300">
                  <Money value={(car.prepCosts || []).reduce((s, c) => s + Number(c.amount || 0), 0)} hide={hide} currency={cur} />
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-semibold tabular-nums ${margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {margin >= 0 ? "+" : ""}<Money value={Math.abs(margin)} hide={hide} currency={cur} />
            </span>
            {marginPct !== null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                marginPct >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-400"
              }`}>
                {marginPct >= 0 ? "+" : ""}{marginPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {car.buyerName && (
        <div className="mt-2 text-[11px] text-zinc-500">
          Comprador: <span className="text-zinc-300">{car.buyerName}</span>
        </div>
      )}
    </button>
  );
}

export default function CarsScreen() {
  const { state, dispatch } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCar, setEditingCar] = useState(null);

  const cars = state.cars || [];

  // Counts per status
  const counts = useMemo(() => {
    const c = { all: cars.length };
    Object.keys(CAR_STATUSES).forEach((s) => {
      c[s] = cars.filter((car) => car.status === s).length;
    });
    return c;
  }, [cars]);

  const filtered = useMemo(() => {
    let arr = cars;
    if (filter !== "all") arr = arr.filter((c) => c.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((c) =>
        `${c.brand} ${c.model} ${c.plate} ${c.color} ${c.buyerName || ""}`.toLowerCase().includes(q)
      );
    }
    // Order: negotiating first, then available, sold, delivered
    const order = { negotiating: 0, available: 1, sold: 2, delivered: 3 };
    return [...arr].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [cars, filter, query]);

  // Summary stats
  const stats = useMemo(() => {
    const active = cars.filter((c) => c.status === "available" || c.status === "negotiating");
    const sold = cars.filter((c) => c.status === "sold" || c.status === "delivered");
    const totalInvested = active.reduce((s, c) => {
      const prep = (c.prepCosts || []).reduce((a, p) => a + Number(p.amount || 0), 0);
      return s + Number(c.purchasePrice || 0) + prep;
    }, 0);
    const projectedMargin = active
      .filter((c) => Number(c.salePrice) > 0)
      .reduce((s, c) => {
        const prep = (c.prepCosts || []).reduce((a, p) => a + Number(p.amount || 0), 0);
        return s + Number(c.salePrice) - Number(c.purchasePrice || 0) - prep;
      }, 0);
    const realizedMargin = sold.reduce((s, c) => {
      const prep = (c.prepCosts || []).reduce((a, p) => a + Number(p.amount || 0), 0);
      return s + Number(c.salePrice || 0) - Number(c.purchasePrice || 0) - prep;
    }, 0);
    return { totalInvested, projectedMargin, realizedMargin, activeCount: active.length, soldCount: sold.length };
  }, [cars]);

  const openEdit = (car) => {
    setEditingCar(car);
    setFormOpen(true);
  };

  const openNew = () => {
    setEditingCar(null);
    setFormOpen(true);
  };

  const FILTERS = [
    { v: "all", l: "Todos" },
    ...Object.entries(CAR_STATUSES).map(([k, s]) => ({ v: k, l: s.label })),
  ];

  return (
    <div className="space-y-5 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Autos</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {stats.activeCount} en inventario · {stats.soldCount} vendidos
          </p>
        </div>
        <Button variant="bronze" Icon={Plus} onClick={openNew}>Nuevo</Button>
      </div>

      {/* Stats */}
      {cars.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Invertido</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
              <Money value={stats.totalInvested} hide={hide} currency={cur} />
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-600">stock activo</div>
          </div>
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Ganancia proy.</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${stats.projectedMargin >= 0 ? "text-amber-400" : "text-rose-400"}`}>
              <Money value={stats.projectedMargin} hide={hide} currency={cur} />
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-600">si se vende todo</div>
          </div>
          <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Realizado</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${stats.realizedMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              <Money value={stats.realizedMargin} hide={hide} currency={cur} />
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-600">ganancia efectiva</div>
          </div>
        </div>
      )}

      {/* Pipeline filter */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => {
          const active = filter === f.v;
          const s = CAR_STATUSES[f.v];
          return (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                  : "border-zinc-800/70 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
              }`}>
              {s && (
                <span className="h-1.5 w-1.5 rounded-full"
                  style={{ background: active ? s.color : "#71717a" }} />
              )}
              {f.l}
              <span className={`tabular-nums ${active ? "text-amber-300/80" : "text-zinc-500"}`}>
                {counts[f.v] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <Input placeholder="Buscar marca, modelo, patente..." value={query}
        onChange={(e) => setQuery(e.target.value)} Icon={Search} />

      {/* List */}
      {cars.length === 0 ? (
        <EmptyState Icon={Car} title="Sin autos en inventario"
          hint="Agregá tu primer auto para empezar a trackear compras, preparación y márgenes de venta."
          action={<Button variant="bronze" Icon={Plus} onClick={openNew}>Agregar auto</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState Icon={Car} title="Sin resultados"
          hint="No hay autos que coincidan con el filtro o la búsqueda." />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((car) => (
            <CarCard key={car.id} car={car} onOpen={openEdit} />
          ))}
        </div>
      )}

      <CarFormSheet open={formOpen} onClose={() => setFormOpen(false)}
        editingCar={editingCar} />
    </div>
  );
}
