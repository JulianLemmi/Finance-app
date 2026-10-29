// Vista principal de un préstamo individual. Compone las secciones del detalle y abre el
// sheet de cada operación (pagar, editar, extender, adelantar, sumar capital, refinanciar y
// la planilla). Cada sección con estado propio vive en su archivo: acá queda lo que
// comparten, que es el préstamo, cuál sheet está abierto y el pie de acciones.
import { useState, useMemo } from "react";
import {
  Edit2, RefreshCw, Layers, Banknote, FastForward, PlusCircle, FileSpreadsheet,
} from "lucide-react";
import { todayISO, formatDate } from "../../lib/utils.js";
import { overduePeriodsAt, nextCollectionDate } from "../../lib/calcs.js";
import { refinanceChain } from "../../lib/loanChain.js";
import { useApp } from "../../store/index.js";
import { Sheet, Button, Card, SectionTitle } from "../../components/ui.jsx";
import LoanChain from "./LoanChain.jsx";
import PaymentSheet from "./PaymentSheet.jsx";
import LoanFormSheet from "./LoanFormSheet.jsx";
import LoanTimeline from "./LoanTimeline.jsx";
import LoanLedgerSheet from "./LoanLedgerSheet.jsx";
import PaymentHistory from "./PaymentHistory.jsx";
import PhotoGallery from "./PhotoGallery.jsx";
import LoanSummaryCard from "./LoanSummaryCard.jsx";
import LoanStatsGrid from "./LoanStatsGrid.jsx";
import VehicleCard from "./VehicleCard.jsx";
import SharedShareCard from "./SharedShareCard.jsx";
import ParkingCard from "./ParkingCard.jsx";
import ContactsSection from "./ContactsSection.jsx";
import DeleteLoanSection from "./DeleteLoanSection.jsx";
import ExtendSheet from "./ExtendSheet.jsx";
import ExtraCapitalSheet from "./ExtraCapitalSheet.jsx";
import AdvanceSheet from "./AdvanceSheet.jsx";
import type { ResolvedLoan } from "../../types";

interface LoanDetailSheetProps {
  open: boolean;
  onClose: () => void;
  loanId: string;
}

/** Cuál sheet de operación está abierto encima del detalle (a lo sumo uno). */
type Operacion = "pago" | "editar" | "planilla" | "extender" | "adelantar" | "sumar" | "refinanciar";

export default function LoanDetailSheet({ open, onClose, loanId }: LoanDetailSheetProps) {
  const { state, dispatch, derived, userId } = useApp();
  const [operacion, setOperacion] = useState<Operacion | null>(null);
  const cerrarOperacion = () => setOperacion(null);

  const loan = useMemo(
    () => derived.loansResolved.find((l) => l.id === loanId),
    [derived.loansResolved, loanId]
  );
  // Va ACÁ, antes del `return null`: un hook después de un return condicional cambia la
  // cantidad de hooks entre renders. Si el préstamo desaparece con el sheet montado (por
  // ejemplo un DELETE_LOAN que llega antes del cierre), React lanza "Rendered fewer hooks
  // than expected". `refinanceChain` además corta los ciclos de datos corruptos.
  const loanChain = useMemo<ResolvedLoan[]>(
    () => (loan ? refinanceChain(derived.loansResolved, loan) : []),
    [loan, derived.loansResolved]
  );

  if (!loan) return null;

  const hide = state.settings.hideBalances;
  const cur = state.settings.currency;

  // Ciclos ya capitalizados (los naturales por vencimiento + los adelantados a mano):
  // define cuántas filas de "mora" se ven en la timeline. Sale de `overduePeriodsAt`, el
  // mismo contador que usa el motor de la deuda, y NO de `_status`: un préstamo vencido al
  // que le pagaron lo suficiente vuelve a "active" pero sigue re-venciendo. Cuando esto se
  // gateaba por el estado, el header mostraba una deuda con el ciclo adentro y la línea de
  // tiempo no mostraba el ciclo.
  const currentCompoundPeriods = overduePeriodsAt(loan, todayISO());
  // Próximo vencimiento. `getNextRenewalDate` es el que vale salvo en un solo caso: un
  // préstamo que todavía no llegó a su fecha, donde el próximo cobro es el dueDate mismo y
  // no el ciclo siguiente. Con la condición puesta sólo en los ciclos corridos, un vencido
  // al que todavía no le llegó el re-vencimiento (venció hace 13 días, el ciclo cierra a
  // los 30) anunciaba como "próximo" su dueDate, que ya había pasado.
  const nextDueDate = nextCollectionDate(loan);

  return (
    <>
      <Sheet
        open={open} onClose={onClose}
        title={loan.clientName}
        subtitle={loan.alias || `Préstamo · ${formatDate(loan.startDate)}`}
        size="xl"
        dense
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" Icon={Edit2} onClick={() => setOperacion("editar")}>Editar</Button>
              {/* Todas las operaciones del prestamo en una ficha de cuenta corriente. */}
              <Button variant="ghost" Icon={FileSpreadsheet} onClick={() => setOperacion("planilla")}>
                Ver en planilla
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" Icon={FastForward} onClick={() => setOperacion("adelantar")}
                disabled={loan._status === "paid" || loan._status === "refinanced" || loan.noDueDate}>
                Adelantar
              </Button>
              <Button variant="secondary" Icon={RefreshCw} onClick={() => setOperacion("extender")}>
                Extender
              </Button>
              {/* Sumar capital sin refinanciar: el cliente pide más plata y el préstamo
                  crece conservando tasa, ciclo y vencimiento. */}
              <Button variant="secondary" Icon={PlusCircle} onClick={() => setOperacion("sumar")}
                disabled={loan._status === "refinanced"}>
                Sumar capital
              </Button>
              <Button variant="secondary" Icon={Layers} onClick={() => setOperacion("refinanciar")}
                disabled={loan._status === "paid" || loan._status === "refinanced"}>
                Refinanciar
              </Button>
              <Button variant="bronze" Icon={Banknote} onClick={() => setOperacion("pago")}
                disabled={loan._remaining <= 0}>
                Registrar pago
              </Button>
            </div>
          </div>
        }
      >
        {/* En pantalla ancha el detalle se abre en dos columnas: a la izquierda el
            estado del préstamo —que queda fijo mientras se recorre—, a la derecha todo
            lo que es historial. En mobile sigue siendo una sola columna apilada. */}
        <div className="space-y-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5 lg:space-y-0">
          <div className="space-y-5 lg:col-span-5 lg:sticky lg:top-0">
            <LoanSummaryCard loan={loan} hide={hide} cur={cur} />
            <LoanStatsGrid loan={loan} nextDueDate={nextDueDate} hide={hide} cur={cur} />
            {loan.vehicle && <VehicleCard vehicle={loan.vehicle} hide={hide} cur={cur} />}
            {loan.sharedWith && <SharedShareCard loan={loan} hide={hide} cur={cur} />}
            <ParkingCard loan={loan} hide={hide} cur={cur} />

            {loan.notes && (
              <div>
                <SectionTitle>Notas</SectionTitle>
                <Card className="whitespace-pre-wrap p-4 text-sm text-zinc-300">{loan.notes}</Card>
              </div>
            )}

            <DeleteLoanSection loan={loan} hide={hide} cur={cur} onDeleted={onClose} />
          </div>

          <div className="space-y-5 lg:col-span-7">
            <LoanTimeline loan={loan} currentCompoundPeriods={currentCompoundPeriods} />

            <LoanChain
              chain={loanChain}
              currentLoanId={loan.id}
              onOpenLoan={(id) =>
                dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })
              }
            />

            <PaymentHistory loan={loan} />
            <ContactsSection loan={loan} />
            <PhotoGallery loan={loan} userId={userId} />
          </div>
        </div>
      </Sheet>

      {/* Cada sheet de operación se monta sólo cuando se abre. Antes estaban siempre en el
          árbol: aunque `Sheet` devuelva null con `open={false}`, React arma igual TODO el JSX
          de los hijos antes de que Sheet decida no dibujarlos, y eran siete pantallas enteras
          reconstruidas en cada render del detalle. Además cada una arranca con sus campos
          limpios al montarse (el modo de "Adelantar" quedaba pegado en "medio ciclo" al
          reabrirlo). El cierre animado sigue funcionando: Sheet llama a `onClose` recién
          cuando termina su animación, y el desmontaje pasa después. */}
      {operacion === "pago" && <PaymentSheet open onClose={cerrarOperacion} loan={loan} />}
      {operacion === "planilla" && <LoanLedgerSheet open onClose={cerrarOperacion} loan={loan} />}
      {operacion === "editar" && <LoanFormSheet open onClose={cerrarOperacion} editingLoan={loan} />}
      {/* Cancelar la refinanciación vuelve al detalle; sólo confirmarla lo cierra (el
          préstamo viejo queda "refinanciado" y se sigue desde el nuevo). */}
      {operacion === "refinanciar" && (
        <LoanFormSheet open onClose={cerrarOperacion} onSaved={onClose} refinancingFrom={loan} />
      )}
      {operacion === "extender" && <ExtendSheet open onClose={cerrarOperacion} loan={loan} />}
      {operacion === "sumar" && (
        <ExtraCapitalSheet open onClose={cerrarOperacion} loan={loan} hide={hide} cur={cur} />
      )}
      {operacion === "adelantar" && (
        <AdvanceSheet open onClose={cerrarOperacion} loan={loan} nextDueDate={nextDueDate} hide={hide} cur={cur} />
      )}
    </>
  );
}
