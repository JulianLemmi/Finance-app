import { useApp } from "../store/index.js";
import LoanFormSheet from "../features/loans/LoanFormSheet.jsx";
import LoanDetailSheet from "../features/loans/LoanDetailSheet.jsx";
import ClientFormSheet from "../sheets/ClientFormSheet.jsx";
import ClientDetailSheet from "../sheets/ClientDetailSheet.jsx";
import TransactionSheet from "../sheets/TransactionSheet.jsx";
import AssetSheet from "../sheets/AssetSheet.jsx";

export default function ModalRoot() {
  const { state, dispatch } = useApp();
  const close = () => dispatch({ type: "CLOSE_MODAL" });
  const m = state.ui.modal;

  if (!m) return null;
  if (m.type === "loan-form")
    return <LoanFormSheet open onClose={close} editingLoan={m.payload?.editingLoan} />;
  if (m.type === "loan-detail")
    return <LoanDetailSheet open onClose={close} loanId={m.payload?.id} />;
  if (m.type === "client-form")
    return <ClientFormSheet open onClose={close} editingClient={m.payload?.editingClient} />;
  if (m.type === "client-detail")
    return (
      <ClientDetailSheet
        open
        onClose={close}
        clientId={m.payload?.id}
        onOpenLoan={(id) =>
          dispatch({ type: "OPEN_MODAL", payload: { type: "loan-detail", payload: { id } } })
        }
      />
    );
  if (m.type === "tx-form") return <TransactionSheet open onClose={close} />;
  if (m.type === "asset-form")
    return <AssetSheet open onClose={close} editingAsset={m.payload?.editingAsset} />;
  return null;
}
