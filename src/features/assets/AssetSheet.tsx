// Sheet para crear y editar activos patrimoniales (vehículos, propiedades,
// inversiones, etc.). Soporta activos que se pagan en cuotas: cada cuota registrada
// (fecha + monto) suma al valor del activo y queda el historial + progreso "X de Y".
// Despacha ADD_ASSET, UPDATE_ASSET o DELETE_ASSET.
import { useState, useEffect } from "react";
import { Trash2, DollarSign, Plus, X, CalendarDays } from "lucide-react";
import { uid, todayISO, formatMoney, formatDate } from "../../lib/utils.js";
import { ASSET_CATEGORIES } from "../../lib/constants.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Textarea, Toggle } from "../../components/ui.jsx";
import type { Asset, AssetCategory, AssetPayment } from "../../types";

interface AssetSheetProps {
  open: boolean;
  onClose: () => void;
  editingAsset?: Asset | null;
}

interface AssetFormState {
  name: string;
  category: AssetCategory;
  value: string;
  description: string;
  installmentMode: boolean;
  totalCuotas: string;
}

const emptyForm = (): AssetFormState => ({
  name: "", category: "vehicle", value: "", description: "",
  installmentMode: false, totalCuotas: "",
});

export default function AssetSheet({ open, onClose, editingAsset }: AssetSheetProps) {
  const { state, dispatch } = useApp();
  const cur = state.settings.currency;
  const [form, setForm] = useState<AssetFormState>(emptyForm);
  const [installments, setInstallments] = useState<AssetPayment[]>([]);
  const [cuotaAmount, setCuotaAmount] = useState("");
  const [cuotaDate, setCuotaDate] = useState(todayISO());
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        editingAsset
          ? {
              name: editingAsset.name ?? "",
              category: editingAsset.category,
              value: String(editingAsset.value),
              description: editingAsset.description ?? "",
              installmentMode: (editingAsset.installments?.length ?? 0) > 0 || !!editingAsset.totalCuotas,
              totalCuotas: editingAsset.totalCuotas ? String(editingAsset.totalCuotas) : "",
            }
          : emptyForm()
      );
      setInstallments(editingAsset?.installments ?? []);
      setCuotaAmount("");
      setCuotaDate(todayISO());
      setConfirmDelete(false);
    }
  }, [open, editingAsset]);

  const paidTotal = installments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalCuotasNum = Number(form.totalCuotas) || 0;

  const addCuota = () => {
    const amt = Number(cuotaAmount);
    if (!Number.isFinite(amt) || amt <= 0 || !cuotaDate) return;
    setInstallments((arr) =>
      [{ id: uid("cuota"), amount: amt, date: cuotaDate }, ...arr].sort((a, b) => (a.date < b.date ? 1 : -1))
    );
    setCuotaAmount("");
  };

  const removeCuota = (id: string) => setInstallments((arr) => arr.filter((p) => p.id !== id));

  const canSubmit = form.name.trim().length > 0 && (form.installmentMode || Number(form.value) > 0);

  const onSubmit = () => {
    if (!canSubmit) return;
    const isInstallment = form.installmentMode;
    const value = isInstallment ? paidTotal : Number(form.value);
    const payload = {
      name: form.name,
      category: form.category,
      description: form.description,
      value,
      installments: isInstallment ? installments : undefined,
      totalCuotas: isInstallment && totalCuotasNum > 0 ? totalCuotasNum : undefined,
    };
    if (editingAsset) {
      dispatch({ type: "UPDATE_ASSET", payload: { ...editingAsset, ...payload } });
    } else {
      dispatch({ type: "ADD_ASSET", payload: { id: uid("asset"), ...payload } });
    }
    onClose();
  };

  const onDelete = () => {
    if (!editingAsset) return;
    dispatch({ type: "DELETE_ASSET", payload: editingAsset.id });
    onClose();
  };

  type AssetCatKey = keyof typeof ASSET_CATEGORIES;

  return (
    <Sheet
      open={open} onClose={onClose}
      title={editingAsset ? "Editar activo" : "Nuevo activo"}
      subtitle="Bienes que suman a tu patrimonio total"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            {editingAsset && !confirmDelete && (
              <Button variant="ghost" size="sm" Icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Eliminar
              </Button>
            )}
            {editingAsset && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400">¿Eliminar?</span>
                <Button variant="danger" size="sm" onClick={onDelete}>Sí</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>Guardar</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Input label="Nombre" placeholder="ej. Auto Ford Focus 2019"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

        <div>
          <div className="mb-2 text-xs font-medium text-zinc-400">Categoría</div>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ASSET_CATEGORIES) as AssetCatKey[]).map((key) => {
              const cat = ASSET_CATEGORIES[key];
              const active = form.category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: key as AssetCategory }))}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                    active
                      ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                      : "border-zinc-800/70 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <cat.Icon className="h-4 w-4" style={{ color: active ? undefined : cat.color as string }} />
                  <span className="text-[10px] leading-tight">{cat.label as string}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Toggle label="Se paga en cuotas"
          hint="Registrás cada cuota (fecha + monto) y el valor del activo se arma con lo pagado."
          checked={form.installmentMode}
          onChange={(v) => setForm((f) => ({ ...f, installmentMode: v }))} />

        {form.installmentMode ? (
          <div className="space-y-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Pagado hasta ahora</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-amber-400">
                  {formatMoney(paidTotal, false, cur)}
                </div>
              </div>
              <div className="text-right text-xs text-zinc-500">
                {installments.length}{totalCuotasNum > 0 ? ` de ${totalCuotasNum}` : ""} cuota{installments.length === 1 ? "" : "s"}
              </div>
            </div>

            <Input label="Cantidad de cuotas del plan (opcional)" type="number" inputMode="numeric"
              placeholder="ej. 24" value={form.totalCuotas}
              onChange={(e) => setForm((f) => ({ ...f, totalCuotas: e.target.value }))} />

            {/* Registrar una cuota */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input label="Fecha" type="date" value={cuotaDate}
                  onChange={(e) => setCuotaDate(e.target.value)} Icon={CalendarDays} />
                <Input label="Monto" type="number" inputMode="decimal"
                  placeholder="0" value={cuotaAmount} Icon={DollarSign}
                  onChange={(e) => setCuotaAmount(e.target.value)} />
              </div>
              <Button variant="bronze" Icon={Plus} onClick={addCuota} className="w-full"
                disabled={!(Number(cuotaAmount) > 0 && cuotaDate)}>Registrar cuota</Button>
            </div>

            {/* Lista de cuotas */}
            {installments.length > 0 && (
              <div className="divide-y divide-zinc-800/70 overflow-hidden rounded-xl border border-zinc-800/70">
                {installments.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800/70 text-[10px] font-medium text-zinc-400">
                        {installments.length - i}
                      </span>
                      <span className="text-[11px] text-zinc-500">{formatDate(p.date)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-zinc-100">
                        {formatMoney(p.amount, false, cur)}
                      </span>
                      <button onClick={() => removeCuota(p.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-rose-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Input label="Valor estimado" type="number" inputMode="decimal"
            placeholder="0" value={form.value} Icon={DollarSign}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            hint="Valor de mercado actual aproximado." />
        )}

        <Textarea label="Descripción" rows={3}
          placeholder="Marca, modelo, año, estado, observaciones..."
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
    </Sheet>
  );
}
