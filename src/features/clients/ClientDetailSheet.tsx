// Vista de perfil de un cliente: estadísticas, lista de préstamos y puntualidad
// histórica. Permite editar los datos del cliente, abrir un préstamo individual,
// crear un nuevo préstamo pre-cargado con el cliente, o eliminar el cliente.
import { useState, useMemo } from "react";
import { Edit2, Plus, Wallet, Trash2, AlertTriangle } from "lucide-react";
import { formatDate } from "../../lib/utils.js";
import { useApp } from "../../store/index.js";
import {
  Sheet, Button, Card, Badge, RiskBadge, SectionTitle,
  EmptyState, Money, ProgressBar, StatusBadge,
} from "../../components/ui.jsx";
import ClientFormSheet from "./ClientFormSheet.jsx";
import type { ResolvedClient } from "../../types";

interface ClientDetailSheetProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onOpenLoan: (id: string) => void;
}

export default function ClientDetailSheet({ open, onClose, clientId, onOpenLoan }: ClientDetailSheetProps) {
  const { state, dispatch, derived } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const client = useMemo<ResolvedClient | undefined>(
    () => derived.clientStats.find((c) => c.id === clientId),
    [derived.clientStats, clientId]
  );

  if (!client) return null;

  const paid = client._loans.filter((l) => l._status === "paid");
  const openLoans = client._loans.filter((l) => l._status === "active" || l._status === "overdue");
  const onTime = paid.filter((l) => {
    const last = (l.payments || []).slice(-1)[0];
    return last && last.date <= l.dueDate;
  }).length;
  const punctuality = paid.length ? Math.round((onTime / paid.length) * 100) : null;
  const loansSorted = [...client._loans].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  return (
    <>
      <Sheet
        open={open} onClose={onClose}
        title={client.name}
        subtitle={client.phone || "Perfil del cliente"}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" Icon={Edit2} onClick={() => setEditOpen(true)}>Editar</Button>
            <Button variant="bronze" Icon={Plus}
              onClick={() => {
                dispatch({
                  type: "OPEN_MODAL",
                  payload: { type: "loan-form", payload: { clientId: client.id, clientName: client.name } },
                });
                onClose();
              }}
            >
              Nuevo préstamo
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <RiskBadge risk={client.riskLevel} />
            {client._overdueCount > 0 && (
              <Badge tone="danger">
                <AlertTriangle className="h-3 w-3" />
                {client._overdueCount} atrasos
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Préstamos", value: client._loans.length, cls: "text-zinc-100" },
              { label: "Activos", value: client._active.length, cls: "text-zinc-100" },
              {
                label: "Deuda",
                value: <Money value={client._debt} hide={state.settings.hideBalances} currency={state.settings.currency} />,
                cls: "text-zinc-100",
              },
              {
                label: "Generado",
                value: <Money value={client._totalGenerated} hide={state.settings.hideBalances} currency={state.settings.currency} />,
                cls: "text-emerald-400",
              },
            ].map(({ label, value, cls }) => (
              <Card key={label} className="p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
              </Card>
            ))}
          </div>

          {punctuality !== null && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-200">Puntualidad histórica</div>
                <div className="text-lg font-semibold tabular-nums text-zinc-100">{punctuality}%</div>
              </div>
              <ProgressBar
                value={punctuality / 100}
                tone={punctuality >= 80 ? "emerald" : punctuality >= 50 ? "bronze" : "rose"}
              />
              <div className="mt-2 text-xs text-zinc-500">
                {onTime} de {paid.length} préstamos cerrados antes del vencimiento.
              </div>
            </Card>
          )}

          <div>
            <SectionTitle>Préstamos</SectionTitle>
            {loansSorted.length ? (
              <div className="space-y-2">
                {loansSorted.map((l) => (
                  <button key={l.id} onClick={() => onOpenLoan(l.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:bg-zinc-900">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">
                          {l.alias || formatDate(l.startDate)}
                        </span>
                        <StatusBadge status={l._status} />
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {formatDate(l.startDate)} → {formatDate(l.dueDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-zinc-100 tabular-nums">
                        <Money value={l.amount} hide={state.settings.hideBalances} currency={state.settings.currency} />
                      </div>
                      <div className="text-xs text-zinc-500 tabular-nums">
                        {Number(l.interestRate).toFixed(1)}%
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState Icon={Wallet} title="Sin préstamos todavía"
                hint="Este cliente aún no tiene operaciones registradas." />
            )}
          </div>

          <div>
            <SectionTitle>Observaciones</SectionTitle>
            {client.observations ? (
              <Card className="whitespace-pre-wrap p-4 text-sm text-zinc-300">{client.observations}</Card>
            ) : (
              <Card className="p-4 text-sm text-zinc-500">Sin observaciones registradas.</Card>
            )}
          </div>

          <div className="pt-1">
            {confirmDelete ? (
              <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 px-4 py-3">
                <div className="text-sm text-rose-200">¿Eliminar este cliente?</div>
                {openLoans.length > 0 && (
                  <div className="mt-2 rounded-xl border border-rose-700/40 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
                    Este cliente tiene <span className="font-semibold">{openLoans.length}</span>{" "}
                    préstamo{openLoans.length === 1 ? "" : "s"}{" "}
                    {openLoans.length === 1 ? "abierto" : "abiertos"}.
                    Si lo borrás, los préstamos quedan huérfanos. Conviene cerrar/refinanciar primero.
                  </div>
                )}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                  <Button variant="danger" size="sm" Icon={Trash2}
                    onClick={() => { dispatch({ type: "DELETE_CLIENT", payload: client.id }); onClose(); }}>
                    Eliminar igual
                  </Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-1 text-xs text-zinc-500 hover:text-rose-400">
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar cliente
              </button>
            )}
          </div>
        </div>
      </Sheet>

      <ClientFormSheet open={editOpen} onClose={() => setEditOpen(false)}
        editingClient={editOpen ? client : null} />
    </>
  );
}
