// Inventario de autos con pipeline visual por estado (disponible/negociación/vendido).
// Muestra costo total, margen proyectado y margen realizado en el resumen superior.
import { useState, useMemo } from "react";
import { Plus, Car, Search, ChevronRight, Gauge, Palette } from "lucide-react";
import { useApp } from "../store/index.js";
import { CAR_STATUSES } from "../lib/constants.js";
import { Button, Input, EmptyState, Money, AnimatedMoney } from "../components/ui.jsx";
import CarFormSheet from "../features/cars/CarFormSheet.jsx";
import type { Car as CarType, PrepCost } from "../types";

interface CarStatusBadgeProps {
  status: string;
}

function CarStatusBadge({ status }: CarStatusBadgeProps) {
  const s = (CAR_STATUSES as Record<string, { label: string; color: string }>)[status] || CAR_STATUSES.available;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{ borderColor: `${s.color}40`, background: `${s.color}18`, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function prepCostTotal(car: CarType): number {
  return (car.prepCosts as PrepCost[] | undefined ?? []).reduce((s, c) => s + Number(c.amount || 0), 0);
}

interface CarCardProps {
  car: CarType;
  onOpen: (car: CarType) => void;
}

function CarCard({ car, onOpen }: CarCardProps) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const hide = state.settings.hideBalances;
  const prep = prepCostTotal(car);
  const totalCost = Number(car.purchasePrice || 0) + prep;
  const margin = Number(car.salePrice || 0) - totalCost;
  const marginPct = totalCost > 0 ? (margin / totalCost) * 100 : null;
  const isSold = car.status === "sold" || car.status === "delivered";

  return (
    <button onClick={() => onOpen(car)}
      className="group relative w-full overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700/70 hover:bg-zinc-900 active:scale-[0.99]"
    >
      <span className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl"
        style={{ background: (CAR_STATUSES as Record<string, { color: string }>)[car.status]?.color || "#52525b" }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100">{car.brand} {car.model}</span>
            {car.year && <span className="text-xs text-zinc-500">{car.year}</span>}
            <CarStatusBadge status={car.status} />
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
            {(car.km ?? 0) > 0 && (
              <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{Number(car.km).toLocaleString("es-AR")} km</span>
            )}
            {car.color && <span className="flex items-center gap-1"><Palette className="h-3 w-3" />{car.color}</span>}
            {car.plate && <span className="font-mono text-zinc-600">{car.plate}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-zinc-100">
              <Money value={isSold ? Number(car.salePrice || 0) : totalCost} hide={hide} currency={cur} />
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{isSold ? "Precio venta" : "Costo total"}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-600" />
        </div>
      </div>
      {Number(car.salePrice) > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-zinc-500">Compra <span className="tabular-nums text-zinc-300">
              <Money value={Number(car.purchasePrice || 0)} hide={hide} currency={cur} />
            </span></span>
            {(car.prepCosts ?? []).length > 0 && (
              <span className="text-zinc-500">Prep. <span className="tabular-nums text-zinc-300">
                <Money value={prep} hide={hide} currency={cur} />
              </span></span>
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
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<CarType | null>(null);

  const cars = state.cars ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: cars.length };
    Object.keys(CAR_STATUSES).forEach((s) => { c[s] = cars.filter((car) => car.status === s).length; });
    return c;
  }, [cars]);

  const filtered = useMemo(() => {
    let arr = cars;
    if (filter !== "all") arr = arr.filter((c) => c.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter((c) =>
        `${c.brand} ${c.model} ${c.plate ?? ""} ${c.color ?? ""} ${c.buyerName ?? ""}`.toLowerCase().includes(q)
      );
    }
    const order: Record<string, number> = { negotiating: 0, available: 1, sold: 2, delivered: 3 };
    return [...arr].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [cars, filter, query]);

  const stats = useMemo(() => {
    const active = cars.filter((c) => c.status === "available" || c.status === "negotiating");
    const sold = cars.filter((c) => c.status === "sold" || c.status === "delivered");
    const totalInvested = active.reduce((s, c) => s + Number(c.purchasePrice || 0) + prepCostTotal(c), 0);
    const projectedMargin = active.filter((c) => Number(c.salePrice) > 0)
      .reduce((s, c) => s + Number(c.salePrice) - Number(c.purchasePrice || 0) - prepCostTotal(c), 0);
    const realizedMargin = sold.reduce((s, c) => s + Number(c.salePrice || 0) - Number(c.purchasePrice || 0) - prepCostTotal(c), 0);
    return { totalInvested, projectedMargin, realizedMargin, activeCount: active.length, soldCount: sold.length };
  }, [cars]);

  const FILTERS = [
    { v: "all", l: "Todos" },
    ...Object.entries(CAR_STATUSES).map(([k, s]) => ({ v: k, l: (s as { label: string }).label })),
  ];

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Autos</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{stats.activeCount} en inventario · {stats.soldCount} vendidos</p>
        </div>
        <Button variant="bronze" Icon={Plus} onClick={() => { setEditingCar(null); setFormOpen(true); }}>Nuevo</Button>
      </div>

      {cars.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Invertido", value: stats.totalInvested, hint: "stock activo", color: "text-zinc-100" },
            { label: "Ganancia proy.", value: stats.projectedMargin, hint: "si se vende todo", color: stats.projectedMargin >= 0 ? "text-amber-400" : "text-rose-400" },
            { label: "Realizado", value: stats.realizedMargin, hint: "ganancia efectiva", color: stats.realizedMargin >= 0 ? "text-emerald-400" : "text-rose-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">{s.label}</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${s.color}`}>
                <AnimatedMoney value={s.value} hide={hide} currency={cur} />
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">{s.hint}</div>
            </div>
          ))}
        </div>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => {
          const active = filter === f.v;
          const s = (CAR_STATUSES as Record<string, { color: string } | undefined>)[f.v];
          return (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                active ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                  : "border-zinc-800/70 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
              }`}>
              {s && <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? s.color : "#71717a" }} />}
              {f.l}
              <span className={`tabular-nums ${active ? "text-amber-300/80" : "text-zinc-500"}`}>{counts[f.v] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <Input placeholder="Buscar marca, modelo, patente..." value={query}
        onChange={(e) => setQuery(e.target.value)} Icon={Search} />

      {cars.length === 0 ? (
        <EmptyState Icon={Car} title="Sin autos en inventario"
          hint="Agregá tu primer auto para trackear compras, preparación y márgenes de venta."
          action={<Button variant="bronze" Icon={Plus} onClick={() => { setEditingCar(null); setFormOpen(true); }}>Agregar auto</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState Icon={Car} title="Sin resultados" hint="No hay autos que coincidan con el filtro o la búsqueda." />
      ) : (
        <div key={filter} className="fa-rise space-y-2.5">
          {filtered.map((car) => (
            <CarCard key={car.id} car={car} onOpen={(c) => { setEditingCar(c); setFormOpen(true); }} />
          ))}
        </div>
      )}

      <CarFormSheet open={formOpen} onClose={() => setFormOpen(false)} editingCar={editingCar} />
    </div>
  );
}
