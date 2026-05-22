import { useState, useEffect } from "react";
import { Trash2, DollarSign } from "lucide-react";
import { uid } from "../lib/utils.js";
import { ASSET_CATEGORIES } from "../lib/constants.js";
import { useApp } from "../store/index.js";
import { Sheet, Button, Input, Textarea } from "../components/ui.jsx";

export default function AssetSheet({ open, onClose, editingAsset }) {
  const { dispatch } = useApp();
  const [form, setForm] = useState({ name: "", category: "vehicle", value: "", description: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editingAsset
        ? { name: editingAsset.name, category: editingAsset.category, value: String(editingAsset.value), description: editingAsset.description || "" }
        : { name: "", category: "vehicle", value: "", description: "" }
      );
      setConfirmDelete(false);
    }
  }, [open, editingAsset]);

  const canSubmit = form.name.trim().length > 0 && Number(form.value) > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    const payload = { ...form, value: Number(form.value) };
    if (editingAsset) {
      dispatch({ type: "UPDATE_ASSET", payload: { ...editingAsset, ...payload } });
    } else {
      dispatch({ type: "ADD_ASSET", payload: { id: uid("asset"), ...payload, createdAt: Date.now() } });
    }
    onClose();
  };

  const onDelete = () => {
    dispatch({ type: "DELETE_ASSET", payload: editingAsset.id });
    onClose();
  };

  return (
    <Sheet
      open={open} onClose={onClose}
      title={editingAsset ? "Editar activo" : "Nuevo activo"}
      subtitle="Bienes que suman a tu patrimonio total"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            {editingAsset && !confirmDelete && (
              <Button variant="ghost" size="sm" Icon={Trash2}
                onClick={() => setConfirmDelete(true)}>
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
            {Object.entries(ASSET_CATEGORIES).map(([key, cat]) => {
              const active = form.category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: key }))}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                    active
                      ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                      : "border-zinc-800/70 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <cat.Icon className="h-4 w-4" style={{ color: active ? undefined : cat.color }} />
                  <span className="text-[10px] leading-tight">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Input label="Valor estimado" type="number" inputMode="decimal"
          placeholder="0" value={form.value} Icon={DollarSign}
          onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          hint="Valor de mercado actual aproximado." />

        <Textarea label="Descripción" rows={3}
          placeholder="Marca, modelo, año, estado, observaciones..."
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
    </Sheet>
  );
}
