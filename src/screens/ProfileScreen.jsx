import { useState, useEffect } from "react";
import { User as UserIcon, Banknote, Hash, Trash2 } from "lucide-react";
import { useApp } from "../store/index.js";
import { initialState } from "../store/index.js";
import {
  Card, SectionTitle, Input, Select, Toggle, Button, Money,
} from "../components/ui.jsx";

export default function ProfileScreen() {
  const { state, dispatch, derived, userEmail, signOut } = useApp();
  const [name, setName] = useState(state.settings.userName || "");
  const [capital, setCapital] = useState(String(state.settings.cashOnHand || ""));
  const [currency, setCurrency] = useState(state.settings.currency || "$");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setName(state.settings.userName || "");
    setCapital(String(state.settings.cashOnHand || ""));
    setCurrency(state.settings.currency || "$");
  }, [state.settings]);

  const saveName = () => dispatch({ type: "UPDATE_SETTINGS", payload: { userName: name } });
  const saveCapital = () =>
    dispatch({ type: "UPDATE_SETTINGS", payload: { cashOnHand: Number(capital) || 0 } });
  const saveCurrency = (v) => {
    setCurrency(v);
    dispatch({ type: "UPDATE_SETTINGS", payload: { currency: v } });
  };

  const totalLent = state.loans.reduce((a, l) => a + Number(l.amount), 0);
  const totalEarned = derived.accumulatedProfit;

  const onReset = () => {
    dispatch({
      type: "HYDRATE",
      payload: {
        loans: [], clients: [], expenses: [], income: [], history: [],
        settings: initialState.settings,
      },
    });
    setConfirmReset(false);
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Perfil</h1>
        <p className="mt-0.5 text-xs text-zinc-500">Ajustes generales y datos del usuario</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-800 to-amber-950 text-base font-semibold text-amber-100">
            {(name || "·").split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "·"}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-zinc-100">{name || "Sin nombre"}</div>
            <div className="text-xs text-zinc-500">
              {state.clients.length} clientes · {state.loans.length} préstamos
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <SectionTitle>Información</SectionTitle>
        <Input label="Nombre" placeholder="Tu nombre" value={name}
          onChange={(e) => setName(e.target.value)} onBlur={saveName} Icon={UserIcon} />
        <Input label="Efectivo a mano" type="number" inputMode="decimal" placeholder="0"
          value={capital} onChange={(e) => setCapital(e.target.value)} onBlur={saveCapital}
          Icon={Banknote}
          hint="Dinero en efectivo que tenés disponible actualmente, fuera de los préstamos." />
        <Select label="Moneda" value={currency} onChange={saveCurrency} Icon={Hash}
          options={[
            { value: "$", label: "$ (Peso)" },
            { value: "US$", label: "US$ (Dólar)" },
            { value: "€", label: "€ (Euro)" },
          ]} />
      </div>

      <div className="space-y-3">
        <SectionTitle>Privacidad</SectionTitle>
        <Toggle label="Ocultar saldos" hint="Muestra los montos como ••••• en toda la app."
          checked={state.settings.hideBalances}
          onChange={(v) => dispatch({ type: "UPDATE_SETTINGS", payload: { hideBalances: v } })} />
      </div>

      {userEmail && (
        <div className="space-y-3">
          <SectionTitle>Sesión</SectionTitle>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Conectado como</div>
                <div className="mt-0.5 truncate text-sm font-medium text-zinc-100">{userEmail}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={signOut}>Cerrar sesión</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle>Resumen</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total prestado</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
              <Money value={totalLent} hide={state.settings.hideBalances} currency={state.settings.currency} />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total generado</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">
              <Money value={totalEarned} hide={state.settings.hideBalances} currency={state.settings.currency} />
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Datos</SectionTitle>
        {confirmReset ? (
          <Card className="border-rose-900/40 bg-rose-950/20 p-4">
            <div className="text-sm font-medium text-rose-200">Vas a eliminar todos los datos.</div>
            <div className="mt-1 text-xs text-rose-300/70">
              Esta acción no se puede deshacer. Préstamos, clientes, gastos e ingresos se borrarán.
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" Icon={Trash2} onClick={onReset}>Borrar todo</Button>
            </div>
          </Card>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
          >
            <div>
              <div className="text-sm font-medium text-zinc-100">Borrar todos los datos</div>
              <div className="mt-0.5 text-xs text-zinc-500">Restablece la aplicación a su estado inicial.</div>
            </div>
            <Trash2 className="h-4 w-4 text-zinc-500" />
          </button>
        )}
      </div>

      <div className="px-1 pt-2 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-700">
        Datos privados · sincronizados entre dispositivos
      </div>
    </div>
  );
}
