// Listado de todos los préstamos con filtro por estado y búsqueda de texto.
// Cada préstamo muestra deuda restante, progreso de pago y próximo vencimiento.
// Mantener apretada una card (mouse o touch) la archiva/restaura sin borrar datos —
// ver Historial en el header y useLongPress en lib/hooks.ts.
import { useState, useMemo } from "react";
import { Plus, PlusCircle, Search, Wallet, CalendarClock, Calendar, ArrowDown, ArrowLeft, ChevronDown, Archive, ArchiveRestore } from "lucide-react";
import { useApp } from "../store/index.js";
import { GUARANTY_TYPES, UI_LIMITS } from "../lib/constants.js";
import { formatShortDate, getNextRenewalDate, formatInterest, myShare, daysBetween, todayISO, formatMoney } from "../lib/utils.js";
import { useLongPress } from "../lib/hooks.js";
import { EmptyState, Input, Button, Money, ProgressBar, StatusBadge, SectionTitle, Card, Badge } from "../components/ui.jsx";
import { Users } from "lucide-react";
import type { ResolvedLoan, LoanStatus } from "../types";

interface LoanCardProps {
  loan: ResolvedLoan;
  onOpen: (id: string) => void;
  onToggleArchive: (id: string) => void;
  archived?: boolean;
}

function LoanCard({ loan, onOpen, onToggleArchive, archived }: LoanCardProps) {
  const { state } = useApp();
  const G = (GUARANTY_TYPES as Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string }>)[loan.guarantyType] || GUARANTY_TYPES.other;
  const dueIn = loan._daysUntilDue;
  const overdue = loan._status === "overdue";
  const upcoming = loan._status === "active" && dueIn !== null && dueIn <= 3;
  const ongoing = loan._status === "active" || loan._status === "overdue";
  const nextRenewalDate = ongoing ? getNextRenewalDate(loan) : null;
  // En préstamos compartidos, la próxima ganancia mostrada es mi parte, no el total.
  const nextChargeAmount = ongoing ? loan._nextProfit * myShare(loan) : 0;

  const { pressing, progressMs, handlers } = useLongPress(
    () => { navigator.vibrate?.(15); onToggleArchive(loan.id); },
    () => onOpen(loan.id)
  );

  const dueText = (() => {
    if (loan._status === "paid") return "Cerrado";
    if (loan._status === "refinanced") return "Refinanciado";
    if (dueIn === null) return "";
    if (dueIn < 0) return `Vencido hace ${Math.abs(dueIn)}d`;
    if (dueIn === 0) return "Vence hoy";
    if (dueIn === 1) return "Vence mañana";
    return `Vence en ${dueIn}d`;
  })();

  return (
    <button {...handlers}
      className={`group relative w-full select-none overflow-hidden rounded-2xl border bg-zinc-900/50 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-900 active:scale-[0.99] ${
        overdue ? "border-rose-900/40 hover:border-rose-800/60" : upcoming ? "border-amber-800/40 hover:border-amber-700/60" : "border-zinc-800/70 hover:border-zinc-700/70"
      }`}
    >
      {pressing && (
        // pointer-events-none es obligatorio: si el overlay recibe eventos, al insertarse
        // bajo el cursor dispara pointerleave en la card y cancela el propio long-press.
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 overflow-hidden bg-zinc-950/90 text-amber-200">
          <span className="fa-longpress-fill absolute inset-0 bg-amber-900/40"
            style={{ animationDuration: `${progressMs}ms` }} />
          {archived ? <ArchiveRestore className="relative h-4 w-4" /> : <Archive className="relative h-4 w-4" />}
          <span className="relative text-xs font-medium">{archived ? "Restaurando..." : "Archivando..."}</span>
        </div>
      )}
      {(overdue || upcoming) && (
        <span className={`absolute left-0 top-0 h-full w-0.5 ${overdue ? "bg-rose-500" : "bg-amber-500"}`} />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{loan.clientName}</span>
            <StatusBadge status={loan._status} />
            {loan.sharedWith && (
              <Badge tone="info">
                <Users className="h-3 w-3" />
                {Math.round(myShare(loan) * 100)}%
              </Badge>
            )}
          </div>
          {loan.alias && <div className="mt-0.5 truncate text-xs text-zinc-500">{loan.alias}</div>}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tracking-tight text-zinc-100 tabular-nums">
            <Money value={loan._remaining} hide={state.settings.hideBalances} currency={state.settings.currency} />
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">{formatInterest(loan, state.settings.currency)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-600">
        <Calendar className="h-3 w-3 shrink-0" />
        <span>Inicio {formatShortDate(loan.startDate)}</span>
        <span className="text-zinc-700">→</span>
        <span className={overdue ? "text-rose-500/80" : "text-zinc-600"}>
          Vence {formatShortDate(loan.dueDate)}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={loan._progress} tone={overdue ? "rose" : "bronze"} />
      </div>
      {nextRenewalDate && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 tabular-nums">
          <span className="flex items-center gap-1">
            <span className="text-zinc-600">↻</span>
            Próx. vence {formatShortDate(nextRenewalDate)}
          </span>
          <span className="text-emerald-400">
            +<Money value={nextChargeAmount} hide={state.settings.hideBalances} currency={state.settings.currency} />
          </span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-zinc-500">
          <G.Icon className="h-3.5 w-3.5" />
          {G.label}
        </span>
        <span className={`flex items-center gap-1.5 ${overdue ? "text-rose-400" : upcoming ? "text-amber-400" : "text-zinc-500"}`}>
          <CalendarClock className="h-3.5 w-3.5" />
          {dueText}
        </span>
      </div>
    </button>
  );
}

/**
 * Card de un préstamo archivado. El historial responde otra pregunta que el listado vivo:
 * de uno cerrado no importa la barra de progreso ni cuándo vence, importa qué dejó. Acá va
 * lo que generó, cuánto tardó y si pagó en término — información que la app ya calculaba
 * pero no mostraba en ningún lado.
 *
 * Un archivado que TODAVÍA debe se marca aparte: archivar lo saca de la agenda, así que es
 * plata en la calle de la que la app dejó de avisarte.
 */
function ArchivedLoanCard({ loan, onOpen, onToggleArchive }: Omit<LoanCardProps, "archived">) {
  const { state } = useApp();
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;
  const cerrado = loan._status === "paid" || loan._status === "refinanced";
  const generado = loan._paid - loan._principal;

  const { pressing, progressMs, handlers } = useLongPress(
    () => { navigator.vibrate?.(15); onToggleArchive(loan.id); },
    () => onOpen(loan.id)
  );

  // Cuánto duró: del inicio al último pago (o a hoy si sigue abierto).
  const ultimoPago = (loan.payments || []).reduce((max, p) => (p.date > max ? p.date : max), "");
  const dias = Math.max(0, daysBetween(loan.startDate, ultimoPago || todayISO()));
  const duracion = dias >= 60 ? `${Math.round(dias / 30)} meses` : `${dias} días`;

  // Mismo criterio que `paidOnTimeCount`: el primer pago llegó antes del vencimiento.
  const primerPago = [...(loan.payments || [])].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const enTermino = !!primerPago && !!loan.dueDate && primerPago.date <= loan.dueDate;

  return (
    <button {...handlers}
      className={`group relative w-full select-none overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-900 active:scale-[0.99] ${
        cerrado ? "border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700/70"
                : "border-amber-900/40 bg-amber-950/10 hover:border-amber-800/60"
      }`}
    >
      {pressing && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 overflow-hidden bg-zinc-950/90 text-amber-200">
          <span className="fa-longpress-fill absolute inset-0 bg-amber-900/40" style={{ animationDuration: `${progressMs}ms` }} />
          <ArchiveRestore className="relative h-4 w-4" />
          <span className="relative text-xs font-medium">Restaurando...</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-200">{loan.clientName}</span>
            <StatusBadge status={loan._status} />
            {loan.sharedWith && (
              <Badge tone="info"><Users className="h-3 w-3" />{Math.round(myShare(loan) * 100)}%</Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-600">
            <span>Prestó <span className="tabular-nums text-zinc-400">{formatMoney(loan._principal, hide, cur)}</span></span>
            <span className="text-zinc-700">·</span>
            <span>{duracion}</span>
            {cerrado && primerPago && (
              <>
                <span className="text-zinc-700">·</span>
                <span className={enTermino ? "text-emerald-500/80" : "text-amber-500/80"}>
                  {enTermino ? "pagó en término" : "pagó tarde"}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {cerrado ? (
            <>
              <div className={`text-sm font-semibold tabular-nums ${generado > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                {generado > 0 ? "+" : ""}<Money value={generado} hide={hide} currency={cur} />
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-600">generó</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold tabular-nums text-amber-300">
                <Money value={loan._remaining} hide={hide} currency={cur} />
              </div>
              <div className="mt-0.5 text-[11px] text-amber-600/80">sigue debiendo</div>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

type FilterValue = LoanStatus | "all";

export default function LoansScreen() {
  const { state, dispatch, derived } = useApp();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const [showHistory, setShowHistory] = useState(true);
  const [viewArchived, setViewArchived] = useState(false);
  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  // El archivado sólo oculta préstamos de este listado (mantenido apretado sobre la
  // card) — no toca useDerived, así que siguen contando igual en Finanzas/Inicio.
  const visibleLoans = useMemo(() => derived.loansResolved.filter((l) => !l.archived), [derived.loansResolved]);
  const archivedLoans = useMemo(() => derived.loansResolved.filter((l) => l.archived), [derived.loansResolved]);

  // Lo que dejó el historial. Prorrateado por `myShare` como el resto de los agregados:
  // de un préstamo compartido sólo es mío lo que me toca.
  const resumenHistorial = useMemo(() => {
    let generado = 0, prestado = 0, abiertos = 0, deudaAbierta = 0;
    for (const l of archivedLoans) {
      const share = myShare(l);
      if (l._status === "paid" || l._status === "refinanced") {
        generado += share * (l._paid - l._principal);
        prestado += share * l._principal;
      } else {
        abiertos += 1;
        deudaAbierta += share * l._remaining;
      }
    }
    return { generado, prestado, abiertos, deudaAbierta, total: archivedLoans.length };
  }, [archivedLoans]);

  const toggleArchive = (id: string) => {
    const loan = derived.loansResolved.find((l) => l.id === id);
    if (!loan) return;
    dispatch({ type: "UPDATE_LOAN", payload: { id, archived: !loan.archived } });
  };

  const filters: { v: FilterValue; l: string; n: number }[] = [
    { v: "all", l: "Todos", n: visibleLoans.length },
    { v: "active", l: "Activos", n: visibleLoans.filter((l) => l._status === "active").length },
    { v: "overdue", l: "Atrasados", n: visibleLoans.filter((l) => l._status === "overdue").length },
    { v: "paid", l: "Pagados", n: visibleLoans.filter((l) => l._status === "paid").length },
    { v: "refinanced", l: "Refinanciados", n: visibleLoans.filter((l) => l._status === "refinanced").length },
  ];

  const filtered = useMemo(() => {
    let arr = viewArchived ? archivedLoans : visibleLoans;
    if (!viewArchived && filter !== "all") arr = arr.filter((l) => l._status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (l) => l.clientName.toLowerCase().includes(q) || (l.alias || "").toLowerCase().includes(q)
      );
    }
    return arr.sort((a, b) => {
      const order: Record<LoanStatus, number> = { overdue: 0, active: 1, refinanced: 2, paid: 3 };
      const oa = order[a._status] ?? 9, ob = order[b._status] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a._daysUntilDue ?? 9999) - (b._daysUntilDue ?? 9999);
    });
  }, [visibleLoans, archivedLoans, viewArchived, filter, query]);

  return (
    <div className="space-y-5 pb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {viewArchived ? "Historial" : "Préstamos"}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {viewArchived
              ? `${archivedLoans.length} préstamo${archivedLoans.length === 1 ? "" : "s"} archivado${archivedLoans.length === 1 ? "" : "s"}`
              // Cuenta sólo lo visible, para no contradecir la lista de abajo. Los
              // archivados siguen sumando en las métricas de Inicio/Finanzas.
              : `${visibleLoans.filter((l) => l._status === "active" || l._status === "overdue").length} operaciones activas`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewArchived ? (
            <Button variant="secondary" size="sm" Icon={ArrowLeft} onClick={() => setViewArchived(false)}>
              Volver
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" Icon={Archive} onClick={() => setViewArchived(true)}>
                Historial{archivedLoans.length > 0 ? ` (${archivedLoans.length})` : ""}
              </Button>
              <Button variant="bronze" Icon={Plus}
                onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })}>
                Nuevo
              </Button>
            </>
          )}
        </div>
      </div>

      <Input placeholder="Buscar cliente o alias..." value={query}
        onChange={(e) => setQuery(e.target.value)} Icon={Search} />

      {!viewArchived && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {filters.map((f) => {
            const active = filter === f.v;
            return (
              <button key={f.v} onClick={() => setFilter(f.v)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-amber-700/60 bg-amber-900/30 text-amber-200"
                    : "border-zinc-800/70 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-900"
                }`}
              >
                {f.l}
                <span className={`tabular-nums ${active ? "text-amber-300/80" : "text-zinc-500"}`}>{f.n}</span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState Icon={viewArchived ? Archive : Wallet}
          title={
            viewArchived
              ? query ? "Sin resultados" : "El historial está vacío"
              : query ? "Sin resultados"
              : filter === "all" ? "Aún no hay préstamos"
              : filter === "active" ? "Sin préstamos activos"
              : filter === "overdue" ? "Ningún préstamo atrasado"
              : filter === "paid" ? "Ningún préstamo pagado todavía"
              : "Sin préstamos en esta categoría"
          }
          hint={
            viewArchived
              ? query ? `No encontramos préstamos archivados que coincidan con "${query}".`
                : "Mantené apretado un préstamo en la lista para archivarlo y sacarlo de en medio."
              : query ? `No encontramos clientes ni alias que coincidan con "${query}". Probá con otro término.`
              : filter === "all"
                ? "Tu primer préstamo se asocia automáticamente al cliente."
              : filter === "overdue" ? "Buen trabajo — todos los préstamos están al día."
              : filter === "paid" ? "Cuando un préstamo se salda por completo aparece acá."
              : "No hay préstamos en este estado todavía."
          }
          action={!viewArchived && !query && filter === "all" && (
            <Button variant="bronze" Icon={Plus}
              onClick={() => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-form" } })}>
              Registrar primer préstamo
            </Button>
          )}
        />
      ) : (
        <>
          {/* Resumen del historial: lo que dejaron los préstamos archivados, que es la
              pregunta que el historial tiene que contestar de un vistazo. */}
          {viewArchived && resumenHistorial.total > 0 && (
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Generaron</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-emerald-400">
                    <Money value={resumenHistorial.generado} hide={hide} currency={cur} />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Prestaste</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-zinc-200">
                    <Money value={resumenHistorial.prestado} hide={hide} currency={cur} />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Rendimiento</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-amber-400">
                    {resumenHistorial.prestado > 0
                      ? `${((resumenHistorial.generado / resumenHistorial.prestado) * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                </div>
              </div>
              {resumenHistorial.abiertos > 0 && (
                // Archivar saca el préstamo de la agenda: si todavía debe, no te va a
                // avisar nadie. Vale la pena que no quede escondido.
                <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200/90">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  {resumenHistorial.abiertos} archivado{resumenHistorial.abiertos > 1 ? "s" : ""} con deuda abierta
                  {" "}(<Money value={resumenHistorial.deudaAbierta} hide={hide} currency={cur} />) · fuera de los avisos
                </div>
              )}
            </Card>
          )}
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-zinc-600">
            {viewArchived ? <ArchiveRestore className="h-3 w-3 shrink-0" /> : <Archive className="h-3 w-3 shrink-0" />}
            Mantené apretado un préstamo para {viewArchived ? "restaurarlo" : "archivarlo en el historial"}
          </div>
          <div key={viewArchived ? "archived" : filter} className="fa-rise space-y-2.5">
            {filtered.map((l) =>
              viewArchived ? (
                <ArchivedLoanCard key={l.id} loan={l}
                  onOpen={(id) => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })}
                  onToggleArchive={toggleArchive} />
              ) : (
                <LoanCard key={l.id} loan={l}
                  onOpen={(id) => dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })}
                  onToggleArchive={toggleArchive} />
              )
            )}
          </div>
        </>
      )}

      {/* Actividad reciente */}
      {!viewArchived && state.history.length > 0 && (
        <div>
          <SectionTitle action={
            <button onClick={() => setShowHistory((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-300">
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showHistory ? "" : "-rotate-180"}`} />
            </button>
          }>
            Actividad reciente
          </SectionTitle>
          <div style={{ display: "grid", gridTemplateRows: showHistory ? "1fr" : "0fr", transition: "grid-template-rows 300ms ease", overflow: "hidden" }}>
            <div style={{ minHeight: 0 }}>
              <Card className="divide-y divide-zinc-800/70">
                {state.history.slice(0, UI_LIMITS.HISTORY_HOME_MAX).map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/70">
                        {/* Un adicional es plata que SALE: con el ícono de pago parecía
                            un cobro. */}
                        {h.kind === "loan_created"
                          ? <Plus className="h-4 w-4 text-zinc-400" />
                          : h.kind === "loan_extra"
                            ? <PlusCircle className="h-4 w-4 text-teal-400" />
                            : <ArrowDown className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm text-zinc-200">{h.label}</div>
                        <div className="text-[11px] text-zinc-500">{h.date}</div>
                      </div>
                    </div>
                    <div className="text-sm font-medium tabular-nums text-zinc-100">
                      <Money value={h.amount} hide={hide} currency={cur} />
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
