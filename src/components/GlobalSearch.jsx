import { useState, useEffect, useMemo } from "react";
import { Search, X, Wallet, Users, ArrowUp, ArrowDown, ChevronRight } from "lucide-react";
import { useApp } from "../store/index.js";
import { formatShortDate } from "../lib/utils.js";
import { StatusBadge, Money } from "./ui.jsx";

export default function GlobalSearch({ open, onClose }) {
  const { state, dispatch, derived } = useApp();
  const [query, setQuery] = useState("");

  useEffect(() => { if (open) setQuery(""); }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { loans: [], clients: [], transactions: [] };

    const loans = derived.loansResolved
      .filter(
        (l) =>
          l.clientName.toLowerCase().includes(q) ||
          (l.alias || "").toLowerCase().includes(q) ||
          String(l.amount).includes(q)
      )
      .slice(0, 6);

    const clients = state.clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q)
      )
      .slice(0, 4);

    const transactions = [
      ...state.income.map((t) => ({ ...t, txType: "income" })),
      ...state.expenses.map((t) => ({ ...t, txType: "expense" })),
    ]
      .filter(
        (t) =>
          (t.description || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q) ||
          String(t.amount).includes(q)
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4);

    return { loans, clients, transactions };
  }, [query, derived.loansResolved, state.clients, state.income, state.expenses]);

  const total = results.loans.length + results.clients.length + results.transactions.length;
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-16"
      style={{ animation: "fa-fade 150ms ease-out" }}
    >
      <button aria-label="cerrar" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl"
        style={{ animation: "fa-sheet 200ms cubic-bezier(.22,1,.36,1)" }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-zinc-900 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar préstamos, clientes, movimientos..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-zinc-600 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-600 sm:block">ESC</kbd>
        </div>

        {query.trim().length < 2 && (
          <div className="px-4 py-8 text-center text-xs text-zinc-600">
            Escribí al menos 2 caracteres para buscar
          </div>
        )}

        {query.trim().length >= 2 && total === 0 && (
          <div className="px-4 py-8 text-center text-xs text-zinc-600">
            Sin resultados para &quot;{query}&quot;
          </div>
        )}

        {total > 0 && (
          <div className="max-h-[60vh] divide-y divide-zinc-900/80 overflow-y-auto">
            {results.loans.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  Préstamos
                </div>
                {results.loans.map((loan) => (
                  <button
                    key={loan.id}
                    onClick={() => {
                      dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id: loan.id } } });
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900/60"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <Wallet className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">{loan.clientName}</span>
                        <StatusBadge status={loan._status} />
                      </div>
                      {loan.alias && <div className="text-[11px] text-zinc-500">{loan.alias}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium tabular-nums text-zinc-300">
                        <Money value={loan.amount} hide={hide} currency={cur} />
                      </div>
                      <div className="text-[10px] text-zinc-600">{formatShortDate(loan.dueDate)}</div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                  </button>
                ))}
              </div>
            )}

            {results.clients.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  Clientes
                </div>
                {results.clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      dispatch({ type: "SET_TAB", payload: "clients" });
                      dispatch({
                        type: "OPEN_MODAL",
                        payload: { type: "client-detail", payload: { id: client.id } },
                      });
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900/60"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800/70">
                      <Users className="h-3.5 w-3.5 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-100">{client.name}</div>
                      {client.phone && (
                        <div className="text-[11px] text-zinc-500">{client.phone}</div>
                      )}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                  </button>
                ))}
              </div>
            )}

            {results.transactions.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  Movimientos
                </div>
                {results.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        tx.txType === "income" ? "bg-emerald-500/10" : "bg-zinc-800/60"
                      }`}
                    >
                      {tx.txType === "income" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-200">{tx.description || tx.category}</div>
                      <div className="text-[11px] text-zinc-500">{formatShortDate(tx.date)}</div>
                    </div>
                    <div
                      className={`text-xs font-medium tabular-nums ${
                        tx.txType === "income" ? "text-emerald-400" : "text-zinc-300"
                      }`}
                    >
                      {tx.txType === "income" ? "+" : "−"}
                      <Money value={tx.amount} hide={hide} currency={cur} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
