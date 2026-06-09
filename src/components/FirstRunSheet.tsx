// Onboarding de primer uso: si el usuario todavía no tiene nombre cargado
// (cuenta recién creada), le pedimos cómo se llama para personalizar el saludo.
// Se puede saltear; reaparece en la próxima sesión hasta que se cargue un nombre.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "../store/index.js";
import { Sheet, Button, Input } from "./ui.jsx";

export default function FirstRunSheet() {
  const { state, dispatch } = useApp();
  const [name, setName] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const open = state.loaded && !state.settings.userName?.trim() && !dismissed;

  const save = () => {
    const v = name.trim();
    if (!v) return;
    dispatch({ type: "UPDATE_SETTINGS", payload: { userName: v } });
    setDismissed(true);
  };

  return (
    <Sheet
      open={open}
      onClose={() => setDismissed(true)}
      size="sm"
      title="¡Bienvenido!"
      subtitle="Un paso para personalizar tu panel"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setDismissed(true)}>Ahora no</Button>
          <Button variant="bronze" onClick={save} disabled={!name.trim()}>Empezar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 text-amber-100">
          <Sparkles className="h-5 w-5" />
        </div>
        <Input
          label="¿Cómo te llamás?"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          hint="Lo usamos para el saludo del inicio. Podés cambiarlo después en Perfil."
        />
      </div>
    </Sheet>
  );
}
