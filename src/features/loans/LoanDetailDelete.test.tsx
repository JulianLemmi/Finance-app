// El camino completo de borrar un préstamo, con el reducer y `useDerived` reales: el botón del
// pie del detalle sólo ABRE la confirmación (no borra), confirmar saca el préstamo de la
// cartera y cierra el detalle, y cancelar lo deja intacto. `DeleteLoanSheet.test.tsx` cubre
// el sheet aislado; esto cubre que el detalle lo cablee bien.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useReducer, useState } from "react";
import { AppContext, initialState, reducer, useDerived } from "../../store/index.js";
import { addDays } from "../../lib/utils.js";
import type { AppContextValue, AppState, Loan } from "../../types";
import LoanDetailSheet from "./LoanDetailSheet.jsx";

const HOY = "2026-08-25";

beforeAll(() => {
  // Sólo el reloj: los timers reales hacen falta para la animación de cierre de los sheets.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const prestamo = (id: string, clientName: string): Loan => ({
  id, clientId: `c-${id}`, clientName, amount: 100000, interestRate: 10,
  startDate: addDays(HOY, -10), dueDate: addDays(HOY, 20),
  paymentType: "30", payments: [], contacts: [], guarantyType: "cash",
  guarantyDetail: "", status: "active", compoundInterest: false, noDueDate: false,
  notes: "", createdAt: 0,
});

/** Mínimo para montar el detalle con la app real: estado + derivados + un `cerrado` visible. */
function Harness({ onState }: { onState: (s: AppState) => void }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState, loaded: true,
    loans: [prestamo("A", "Ana Gómez"), prestamo("B", "Beto Ruiz")],
  });
  const [abierto, setAbierto] = useState(true);
  const derived = useDerived(state);
  onState(state);
  const ctx = {
    state, dispatch, derived, userEmail: "", signOut: async () => {}, userId: "u1", setSearchOpen: () => {},
  } as AppContextValue;
  return (
    <AppContext.Provider value={ctx}>
      <div data-testid="estado">{abierto ? "detalle-abierto" : "detalle-cerrado"}</div>
      {abierto && <LoanDetailSheet open onClose={() => setAbierto(false)} loanId="A" />}
    </AppContext.Provider>
  );
}

const montar = () => {
  let ultimo!: AppState;
  render(<Harness onState={(s) => { ultimo = s; }} />);
  return { ids: () => ultimo.loans.map((l) => l.id) };
};
const boton = (nombre: string) => screen.getByRole("button", { name: nombre });

describe("Eliminar un préstamo desde su detalle", () => {
  it("el botón está en el pie del detalle y sólo abre la confirmación", () => {
    const { ids } = montar();
    fireEvent.click(boton("Eliminar"));
    expect(screen.getByText(/No se puede deshacer/)).toBeTruthy();
    expect(ids()).toEqual(["A", "B"]);
  });

  it("confirmar borra ESE préstamo, deja los demás y cierra el detalle", () => {
    const { ids } = montar();
    fireEvent.click(boton("Eliminar"));
    // Ahora hay dos «Eliminar»: el del pie del detalle y el de la confirmación (el último).
    const botones = screen.getAllByRole("button", { name: "Eliminar" });
    fireEvent.click(botones[botones.length - 1]);
    expect(ids()).toEqual(["B"]);
    expect(screen.getByTestId("estado").textContent).toBe("detalle-cerrado");
  });

  it("cancelar vuelve al detalle sin borrar nada", () => {
    const { ids } = montar();
    fireEvent.click(boton("Eliminar"));
    fireEvent.click(boton("Cancelar"));
    expect(ids()).toEqual(["A", "B"]);
    expect(screen.getByTestId("estado").textContent).toBe("detalle-abierto");
    expect(screen.queryByText(/No se puede deshacer/)).toBeNull();
  });
});
