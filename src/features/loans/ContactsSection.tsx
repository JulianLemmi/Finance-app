// Historial de contactos con el cliente: qué pasó y cuándo, con alta y baja de cada registro.
import { useState } from "react";
import { MessageSquare, Plus, X } from "lucide-react";
import { uid, todayISO, formatShortDate } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import { SectionTitle, Card, InlineDelete } from "../../components/ui.jsx";
import type { ResolvedLoan } from "../../types";

export default function ContactsSection({ loan }: { loan: ResolvedLoan }) {
  const { dispatch } = useApp();
  const [contactNote, setContactNote] = useState("");
  const [contactDate, setContactDate] = useState(() => todayISO());
  const [showContactForm, setShowContactForm] = useState(false);

  const addContact = () => {
    if (!contactNote.trim()) return;
    dispatch({
      type: "ADD_CONTACT",
      payload: {
        loanId: loan.id,
        contact: { id: uid("ct"), date: contactDate, note: contactNote.trim(), createdAt: Date.now() },
      },
    });
    setContactNote("");
    setShowContactForm(false);
  };

  return (
    <div>
      <SectionTitle action={
        <button
          onClick={() => { setShowContactForm((v) => !v); setContactNote(""); setContactDate(todayISO()); }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          {showContactForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showContactForm ? "Cancelar" : "Agregar"}
        </button>
      }>
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
          Contactos
          {(loan.contacts || []).length > 0 && (
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-400">
              {(loan.contacts || []).length}
            </span>
          )}
        </span>
      </SectionTitle>

      {showContactForm && (
        <div className="mb-3 space-y-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 p-3">
          <div className="flex gap-2">
            <input
              placeholder="¿Qué pasó? (llamó, prometió pagar, sin respuesta...)"
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addContact(); }}
              className="flex-1 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-700/60 focus:ring-1 focus:ring-amber-700/40"
            />
            <input
              type="date"
              value={contactDate}
              onChange={(e) => setContactDate(e.target.value)}
              className="w-36 rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-amber-700/60"
            />
          </div>
          <div className="flex justify-end">
            <button
              disabled={!contactNote.trim()}
              onClick={addContact}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-900/40 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-900/60 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Guardar
            </button>
          </div>
        </div>
      )}

      {(loan.contacts || []).length === 0 && !showContactForm ? (
        <Card className="p-4 text-sm text-zinc-600">Sin registros de contacto aún.</Card>
      ) : (
        <Card className="divide-y divide-zinc-800/60">
          {[...(loan.contacts || [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map((c) => (
            <div key={c.id} className="group flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200">{c.note}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{formatShortDate(c.date)}</p>
              </div>
              <InlineDelete
                icon="x" label="Eliminar contacto" revealOnHover
                onConfirm={() => dispatch({ type: "DELETE_CONTACT", payload: { loanId: loan.id, contactId: c.id } })}
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
