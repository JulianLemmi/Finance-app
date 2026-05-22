import { useState, useMemo } from "react";
import { Edit2, Plus, Wallet, Trash2, AlertTriangle } from "lucide-react";
import { formatDate } from "../lib/utils.js";
import { useApp } from "../store/index.js";
import {
  Sheet, Button, Card, Badge, RiskBadge, SectionTitle,
  EmptyState, Money, ProgressBar, StatusBadge,
} from "../components/ui.jsx";
import ClientFormSheet from "./ClientFormSheet.jsx";

export default function ClientDetailSheet({ open, onClose, clientId, onOpenLoan }) {
  const { state, dispatch, derived } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const client = useMemo(
    () => derived.clientStats.find((c) => c.id === clientId),
    [derived.clientStats, clientId]
  );

  if (!client) return null;

  const paid = client._loans.filter((l) => l._status === "paid");
  const onTime = paid.filter((l) => {
    const last = (l.payments || []).slice(-1)[0];
    return last && last.date <= l.dueDate;
  }).length;
  const punctuality = paid.length ? Math.round((onTime / paid.length) * 100) : null;

  return (
    <>
      <Sheet
        open={open} onClose={onClose}
        title={client.name}
        subtitle={client.phone ? client.phone : "Perfil del cliente"}
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
            {client._loans.length ? (
              <div className="space-y-2">
                {client._loans.sort((a, b) => (a.startDate < b.startDate ? 1 : -1)).map((l) => (
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
              <div className="flex items-center justify-between rounded-2xl border border-rose-900/40 bg-rose-950/20 px-4 py-3">
                <div className="text-sm text-rose-200">¿Eliminar este cliente?</div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                  <Button variant="danger" size="sm" Icon={Trash2}
                    onClick={() => { dispatch({ type: "DELETE_CLIENT", payload: client.id }); onClose(); }}>
                    Eliminar
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
