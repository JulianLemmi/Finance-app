// ModalBoundary: un error al renderizar un sheet no puede tirar abajo toda la app.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppContext } from "../store/index.js";
import type { AppContextValue, ModalState } from "../types";
import ModalBoundary from "./ModalBoundary.jsx";

function Roto(): never {
  throw new Error("dato roto en el respaldo");
}
const Sano = () => <div>contenido del sheet</div>;

const dispatch = vi.fn();
const montar = (modal: ModalState | null, hijo: React.ReactNode) =>
  render(
    <AppContext.Provider value={{ state: { ui: { modal } }, dispatch } as unknown as AppContextValue}>
      <ModalBoundary>{hijo}</ModalBoundary>
    </AppContext.Provider>
  );

beforeEach(() => {
  dispatch.mockClear();
  // React loguea el error capturado; el test lo provoca a propósito.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
// Sin `globals`, testing-library no limpia solo entre tests.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ModalBoundary", () => {
  it("sin errores deja pasar el contenido tal cual", () => {
    montar({ type: "loan-detail", payload: { id: "l1" } }, <Sano />);
    expect(screen.queryByText("contenido del sheet")).not.toBeNull();
    expect(screen.queryByText("No se pudo abrir esto")).toBeNull();
  });

  it("un error de render queda contenido: aviso en pantalla en vez de la app en blanco", () => {
    montar({ type: "loan-detail", payload: { id: "l1" } }, <Roto />);
    expect(screen.queryByText("No se pudo abrir esto")).not.toBeNull();
    // El mensaje del error se muestra, para que se pueda reportar.
    expect(screen.queryByText("dato roto en el respaldo")).not.toBeNull();
  });

  it("'Cerrar' despacha CLOSE_MODAL para salir del sheet roto", () => {
    montar({ type: "loan-detail", payload: { id: "l1" } }, <Roto />);
    fireEvent.click(screen.getByText("Cerrar"));
    expect(dispatch).toHaveBeenCalledWith({ type: "CLOSE_MODAL" });
  });

  it("al abrir OTRO modal el boundary arranca limpio (no queda pegado el aviso)", () => {
    const vista = montar({ type: "loan-detail", payload: { id: "l1" } }, <Roto />);
    expect(screen.queryByText("No se pudo abrir esto")).not.toBeNull();
    vista.rerender(
      <AppContext.Provider value={{ state: { ui: { modal: { type: "loan-detail", payload: { id: "l2" } } } }, dispatch } as unknown as AppContextValue}>
        <ModalBoundary><Sano /></ModalBoundary>
      </AppContext.Provider>
    );
    expect(screen.queryByText("No se pudo abrir esto")).toBeNull();
    expect(screen.queryByText("contenido del sheet")).not.toBeNull();
  });
});
