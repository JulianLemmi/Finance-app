import { useState, useEffect } from "react";
import {
  Car, Hash, Gauge, Palette, Calendar, DollarSign,
  FileText, Plus, Trash2, Tag,
} from "lucide-react";
import { uid, todayISO } from "../../lib/utils.js";
import { CAR_STATUSES, CAR_FUEL_TYPES } from "../../lib/constants.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Select, Textarea } from "../../components/ui.jsx";

function emptyForm() {
  return {
    brand: "", model: "", year: String(new Date().getFullYear()),
    km: "", color: "", plate: "", vin: "", fuelType: "nafta",
    purchasePrice: "", prepCosts: [], salePrice: "",
    status: "available", buyerName: "", saleDate: "", notes: "",
  };
}

export default function CarFormSheet({ open, onClose, editingCar }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCostDesc, setNewCostDesc] = useState("");
  const [newCostAmount, setNewCostAmount] = useState("");

  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setNewCostDesc("");
      setNewCostAmount("");
      if (editingCar) {
        setForm({
          brand: editingCar.brand || "",
          model: editingCar.model || "",
          year: String(editingCar.year || new Date().getFullYear()),
          km: String(editingCar.km || ""),
          color: editingCar.color || "",
          plate: editingCar.plate || "",
          vin: editingCar.vin || "",
          fuelType: editingCar.fuelType || "nafta",
          purchasePrice: String(editingCar.purchasePrice || ""),
          prepCosts: editingCar.prepCosts || [],
          salePrice: String(editingCar.salePrice || ""),
          status: editingCar.status || "available",
          buyerName: editingCar.buyerName || "",
          saleDate: editingCar.saleDate || "",
          notes: editingCar.notes || "",
        });
      } else {
        setForm(emptyForm());
      }
    }
  }, [open, editingCar]);

  const f = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const totalCost = Number(form.purchasePrice || 0)
    + form.prepCosts.reduce((s, c) => s + Number(c.amount || 0), 0);
  const margin = Number(form.salePrice || 0) - totalCost;
  const marginPct = totalCost > 0 ? (margin / totalCost) * 100 : 0;

  const addCost = () => {
    const amount = Number(newCostAmount);
    if (!newCostDesc.trim() || !(amount > 0)) return;
    f("prepCosts", [...form.prepCosts, { id: uid("cost"), description: newCostDesc.trim(), amount }]);
    setNewCostDesc("");
    setNewCostAmount("");
  };
  const removeCost = (id) => f("prepCosts", form.prepCosts.filter((c) => c.id !== id));

  const canSubmit = form.brand.trim().length > 0 && form.model.trim().length > 0
    && Number(form.purchasePrice) > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    const payload = {
      ...form,
      year: Number(form.year) || new Date().getFullYear(),
      km: Number(form.km) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      salePrice: Number(form.salePrice) || 0,
    };
    if (editingCar) {
      dispatch({ type: "UPDATE_CAR", payload: { ...editingCar, ...payload } });
    } else {
      dispatch({ type: "ADD_CAR", payload: { id: uid("car"), ...payload, createdAt: Date.now() } });
    }
    onClose();
  };

  const onDelete = () => {
    dispatch({ type: "DELETE_CAR", payload: editingCar.id });
    onClose();
  };

  const cur = "$";

  return (
    <Sheet
      open={open} onClose={onClose}
      title={editingCar ? "Editar auto" : "Nuevo auto"}
      subtitle="Ingresá los datos del vehículo"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            {editingCar && !confirmDelete && (
              <Button variant="ghost" size="sm" Icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Eliminar
              </Button>
            )}
            {editingCar && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400">¿Eliminar?</span>
                <Button variant="danger" size="sm" onClick={onDelete}>Sí</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>
              {editingCar ? "Guardar" : "Agregar auto"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">

        {/* Identificación */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marca *" placeholder="Ford, Chevrolet..." value={form.brand}
            onChange={(e) => f("brand", e.target.value)} Icon={Car} />
          <Input label="Modelo *" placeholder="Focus, Onix..." value={form.model}
            onChange={(e) => f("model", e.target.value)} Icon={Tag} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Año" type="number" inputMode="numeric" placeholder="2020"
            value={form.year} onChange={(e) => f("year", e.target.value)} Icon={Calendar} />
          <Input label="Km" type="number" inputMode="numeric" placeholder="50000"
            value={form.km} onChange={(e) => f("km", e.target.value)} Icon={Gauge} />
          <Select label="Combustible" value={form.fuelType} onChange={(v) => f("fuelType", v)}
            options={Object.entries(CAR_FUEL_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Color" placeholder="Blanco" value={form.color}
            onChange={(e) => f("color", e.target.value)} Icon={Palette} />
          <Input label="Patente" placeholder="AB123CD" value={form.plate}
            onChange={(e) => f("plate", e.target.value.toUpperCase())} Icon={Hash} />
          <Input label="VIN / Chasis" placeholder="Opcional" value={form.vin}
            onChange={(e) => f("vin", e.target.value)} Icon={Hash} />
        </div>

        {/* Precios */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Precio compra *" type="number" inputMode="decimal" placeholder="0"
            value={form.purchasePrice} onChange={(e) => f("purchasePrice", e.target.value)} Icon={DollarSign} />
          <Input label="Precio venta objetivo" type="number" inputMode="decimal" placeholder="0"
            value={form.salePrice} onChange={(e) => f("salePrice", e.target.value)} Icon={DollarSign} />
        </div>

        {/* Costos de preparación */}
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-400">Costos de preparación</div>
          <div className="space-y-2">
            {form.prepCosts.map((c) => (
              <div key={c.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                <span className="text-sm text-zinc-300">{c.description}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-zinc-400">
                    {cur}{Number(c.amount).toLocaleString("es-AR")}
                  </span>
                  <button onClick={() => removeCost(c.id)}
                    className="text-zinc-600 hover:text-rose-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                placeholder="Descripción (mecánico, pintura...)"
                value={newCostDesc}
                onChange={(e) => setNewCostDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCost()}
                className="flex-1 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700/60 focus:ring-1 focus:ring-amber-700/40"
              />
              <input
                type="number"
                placeholder="Monto"
                value={newCostAmount}
                onChange={(e) => setNewCostAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCost()}
                className="w-28 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700/60 focus:ring-1 focus:ring-amber-700/40"
              />
              <button onClick={addCost}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700/40 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800 hover:text-amber-400 transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Resumen de costos */}
        {(Number(form.purchasePrice) > 0 || form.prepCosts.length > 0) && (
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-zinc-500">Costo total</div>
                <div className="mt-0.5 font-semibold tabular-nums text-zinc-100">
                  {cur}{totalCost.toLocaleString("es-AR")}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Margen bruto</div>
                <div className={`mt-0.5 font-semibold tabular-nums ${margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {margin >= 0 ? "+" : ""}{cur}{margin.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Margen %</div>
                <div className={`mt-0.5 font-semibold tabular-nums ${marginPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {marginPct >= 0 ? "+" : ""}{marginPct.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Estado */}
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-400">Estado</div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(CAR_STATUSES).map(([key, s]) => {
              const active = form.status === key;
              return (
                <button key={key} type="button" onClick={() => f("status", key)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                    active ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                      : "border-zinc-800/70 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-900"
                  }`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: active ? s.color : "#52525b" }} />
                  <span className="text-[10px] leading-tight">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Comprador (solo en negociación/vendido/entregado) */}
        {(form.status === "negotiating" || form.status === "sold" || form.status === "delivered") && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Comprador" placeholder="Nombre" value={form.buyerName}
              onChange={(e) => f("buyerName", e.target.value)} Icon={FileText} />
            {(form.status === "sold" || form.status === "delivered") && (
              <Input label="Fecha de venta" type="date" value={form.saleDate}
                onChange={(e) => f("saleDate", e.target.value)} Icon={Calendar} />
            )}
          </div>
        )}

        <Textarea label="Notas" rows={3} placeholder="Estado del auto, historial, observaciones..."
          value={form.notes} onChange={(e) => f("notes", e.target.value)} />
      </div>
    </Sheet>
  );
}
