// Formulario de creación y edición de un cliente. Maneja nombre, teléfono,
// nivel de riesgo y observaciones privadas. Despacha ADD_CLIENT o UPDATE_CLIENT.
import { useState, useEffect } from "react";
import { User as UserIcon, Phone, Shield } from "lucide-react";
import { uid } from "../../lib/utils.js";
import { RISK_LEVELS } from "../../lib/constants.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Input, Select, Textarea } from "../../components/ui.jsx";
import type { Client, RiskLevel } from "../../types";

interface ClientFormSheetProps {
  open: boolean;
  onClose: () => void;
  editingClient?: Client | null;
}

interface ClientFormState {
  name: string;
  phone: string;
  observations: string;
  riskLevel: RiskLevel;
}

const emptyForm = (): ClientFormState => ({
  name: "", phone: "", observations: "", riskLevel: "low",
});

export default function ClientFormSheet({ open, onClose, editingClient }: ClientFormSheetProps) {
  const { dispatch } = useApp();
  const [form, setForm] = useState<ClientFormState>(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(
        editingClient
          ? {
              name: editingClient.name,
              phone: editingClient.phone ?? "",
              observations: editingClient.observations ?? "",
              riskLevel: editingClient.riskLevel,
            }
          : emptyForm()
      );
    }
  }, [open, editingClient]);

  const canSubmit = form.name.trim().length > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    if (editingClient) {
      dispatch({ type: "UPDATE_CLIENT", payload: { ...editingClient, ...form } });
    } else {
      dispatch({
        type: "ADD_CLIENT",
        payload: { id: uid("client"), ...form, createdAt: Date.now() },
      });
    }
    onClose();
  };

  return (
    <Sheet
      open={open} onClose={onClose}
      title={editingClient ? "Editar cliente" : "Nuevo cliente"}
      subtitle="Información mínima y observaciones privadas"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>Guardar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Nombre" placeholder="Nombre y apellido" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} Icon={UserIcon} />
        <Input label="Teléfono" placeholder="Opcional" value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} Icon={Phone} />
        <Select label="Nivel de riesgo" value={form.riskLevel}
          onChange={(v) => setForm((f) => ({ ...f, riskLevel: v as RiskLevel }))} Icon={Shield}
          options={Object.entries(RISK_LEVELS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <Textarea label="Observaciones privadas" rows={4}
          placeholder="Antecedentes, referencias, comentarios..."
          value={form.observations}
          onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))} />
      </div>
    </Sheet>
  );
}
