// Renderiza el modal/sheet activo según state.ui.modal. Es el único punto de
// montaje para sheets globales; los sheets de feature se montan acá vía dispatch.
//
// Un sheet NO se monta adentro de una pantalla: las pantallas viven en un contenedor con
// `z-10` (el sheet quedaba debajo de la barra de pestañas, que en el teléfono le tapaba el
// botón de guardar) y con la animación de entrada encima (un `transform`/`filter` en un
// ancestro le roba el `position: fixed`: el formulario de autos se dibujaba en la caja de la
// pantalla, con el encabezado y la X fuera de la vista). `screens/sinSheets.test.ts` lo vigila.
import { useApp } from "../store/index.js";
import LoanFormSheet from "../features/loans/LoanFormSheet.jsx";
import LoanDetailSheet from "../features/loans/LoanDetailSheet.jsx";
import PaymentSheet from "../features/loans/PaymentSheet.jsx";
import ClientFormSheet from "../features/clients/ClientFormSheet.jsx";
import ClientDetailSheet from "../features/clients/ClientDetailSheet.jsx";
import TransactionSheet from "../sheets/TransactionSheet.jsx";
import AssetSheet from "../features/assets/AssetSheet.jsx";
import LiabilitySheet from "../features/liabilities/LiabilitySheet.jsx";
import CarFormSheet from "../features/cars/CarFormSheet.jsx";
import ChartDetailSheet from "./ChartDetailSheet.jsx";

export default function ModalRoot() {
  const { state, dispatch, derived } = useApp();
  const close = () => dispatch({ type: "CLOSE_MODAL" });
  const m = state.ui.modal;

  if (!m) return null;
  if (m.type === "loan-form")
    return (
      <LoanFormSheet
        open
        onClose={close}
        editingLoan={m.payload?.editingLoan}
        prefillClientId={m.payload?.clientId}
        prefillClientName={m.payload?.clientName}
      />
    );
  if (m.type === "loan-detail")
    // `key`: al saltar de un préstamo a otro por la cadena de refinanciación, OPEN_MODAL sólo
    // cambia `loanId` y React reusaría la instancia — arrastrando "¿Eliminar definitivamente?",
    // los formularios abiertos y los inputs del préstamo anterior.
    return <LoanDetailSheet key={m.payload?.id} open onClose={close} loanId={m.payload?.id ?? ""} />;
  if (m.type === "client-form")
    return <ClientFormSheet open onClose={close} editingClient={m.payload?.editingClient} />;
  if (m.type === "client-detail")
    return (
      <ClientDetailSheet
        open
        onClose={close}
        clientId={m.payload?.id ?? ""}
        onOpenLoan={(id) =>
          dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })
        }
      />
    );
  if (m.type === "tx-form") return <TransactionSheet open onClose={close} />;
  if (m.type === "asset-form")
    return <AssetSheet open onClose={close} editingAsset={m.payload?.editingAsset} />;
  if (m.type === "liability-form")
    return <LiabilitySheet open onClose={close} editingLiability={m.payload?.editingLiability} />;
  if (m.type === "car-form")
    return <CarFormSheet open onClose={close} editingCar={m.payload?.editingCar ?? null} />;
  if (m.type === "quick-pay") {
    // El préstamo se busca vivo (no viaja una copia en el payload): si cambia mientras el
    // sheet está abierto, el saldo que se muestra es el de ahora.
    const loan = derived.loansResolved.find((l) => l.id === m.payload?.id);
    return loan ? <PaymentSheet open onClose={close} loan={loan} /> : null;
  }
  if (m.type === "chart-detail")
    return (
      <ChartDetailSheet
        open
        onClose={close}
        kind={m.payload?.kind ?? "accrued"}
        breakdown={derived.monthBreakdowns[m.payload?.idx ?? -1] ?? null}
      />
    );
  return null;
}
