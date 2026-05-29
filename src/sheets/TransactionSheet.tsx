// Sheet para registrar un ingreso o gasto. Alterna entre tipo expense/income,
// recuerda la última categoría usada por tipo, y despacha ADD_TX al confirmar.
import { useState, useEffect } from "react";
import { Banknote, Calendar, FileText, Tag, MinusCircle, PlusCircle } from "lucide-react";
import { uid, todayISO } from "../lib/utils.js";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants.js";
import { useApp } from "../store/index.js";
import { Sheet, Button, Input } from "../components/ui.jsx";
import type { TxType } from "../types";

interface TransactionSheetProps {
  open: boolean;
  onClose: () => void;
}

interface CategoryByType {
  expense: string;
  income: string;
}

export default function TransactionSheet({ open, onClose }: TransactionSheetProps) {
  const { dispatch } = useApp();
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  // Mantiene la última categoría elegida por tipo para no resetear al alternar.
  const [categoryByType, setCategoryByType] = useState<CategoryByType>({
    expense: "comida",
    income: Object.keys(INCOME_CATEGORIES)[0],
  });
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (open) {
      setType("expense");
      setAmount("");
      setCategoryByType({ expense: "comida", income: Object.keys(INCOME_CATEGORIES)[0] });
      setDescription("");
      setDate(todayISO());
    }
  }, [open]);

  const cats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const category = categoryByType[type];
  const setCategory = (k: string) =>
    setCategoryByType((c) => ({ ...c, [type]: k }));

  const canSubmit = Number(amount) > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    dispatch({
      type: "ADD_TX",
      payload: {
        id: uid("tx"), type, amount: Number(amount),
        category, description, date, createdAt: Date.now(),
      },
    });
    onClose();
  };

  type CatKey = keyof typeof EXPENSE_CATEGORIES & keyof typeof INCOME_CATEGORIES;

  return (
    <Sheet
      open={open} onClose={onClose}
      title="Nuevo movimiento"
      subtitle="Registrá un ingreso o un gasto personal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="bronze" onClick={onSubmit} disabled={!canSubmit}>Guardar movimiento</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-1">
          {([
            { v: "expense" as TxType, l: "Gasto", Icon: MinusCircle },
            { v: "income" as TxType, l: "Ingreso", Icon: PlusCircle },
          ] as const).map((o) => {
            const active = type === o.v;
            return (
              <button key={o.v} onClick={() => setType(o.v)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? o.v === "expense" ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <o.Icon className="h-4 w-4" />
                {o.l}
              </button>
            );
          })}
        </div>

        <Input label="Monto" type="number" inputMode="decimal" placeholder="0"
          value={amount} onChange={(e) => setAmount(e.target.value)} Icon={Banknote} />

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Categoría
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(Object.keys(cats) as CatKey[]).map((k) => {
              const v = cats[k];
              const active = category === k;
              const Icon = (v as { Icon?: React.ComponentType<{ className?: string }> }).Icon ?? Tag;
              return (
                <button key={k} onClick={() => setCategory(k)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] transition-all ${
                    active
                      ? "border-amber-600/60 bg-amber-900/20 text-amber-200"
                      : "border-zinc-800/70 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {(v as { label: string }).label}
                </button>
              );
            })}
          </div>
        </div>

        <Input label="Descripción" placeholder="Opcional" value={description}
          onChange={(e) => setDescription(e.target.value)} Icon={FileText} />
        <Input label="Fecha" type="date" value={date}
          onChange={(e) => setDate(e.target.value)} Icon={Calendar} />
      </div>
    </Sheet>
  );
}
