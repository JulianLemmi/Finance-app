// El sheet de "Eliminar préstamo". Lo que se cuida: borrar es una acción de dos pasos (el botón
// del detalle sólo abre el sheet), cancelar no toca nada, confirmar despacha el borrado del
// préstamo correcto y cierra también el detalle, y un préstamo con saldo lo avisa.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppContext } from "../../store/index.js";
import type { AppContextValue, ResolvedLoan } from "../../types";
import DeleteLoanSheet from "./DeleteLoanSheet.jsx";

const dispatch = vi.fn();

const prestamo = (extra: Partial<ResolvedLoan> = {}) => ({
  id: "L1", clientName: "Juan Pérez", _status: "active", _remaining: 110000, ...extra,
}) as unknown as ResolvedLoan;

const montar = (loan: ResolvedLoan, { onClose = vi.fn(), onDeleted = vi.fn() } = {}) => {
  render(
    <AppContext.Provider value={{ state: { settings: { currency: "$" } }, dispatch } as unknown as AppContextValue}>
      <DeleteLoanSheet open onClose={onClose} onDeleted={onDeleted} loan={loan} hide={false} cur="$" />
    </AppContext.Provider>
  );
  return { onClose, onDeleted };
};
const boton = (nombre: string) => screen.getByRole("button", { name: nombre });

afterEach(() => {
  cleanup();
  dispatch.mockClear();
  document.body.style.overflow = "";
});

describe("DeleteLoanSheet", () => {
  it("al montarse todavía no borra nada: hay que confirmar", () => {
    montar(prestamo());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("confirmar despacha el borrado de ESE préstamo y avisa para cerrar el detalle", () => {
    const { onDeleted } = montar(prestamo({ id: "L7" }));
    fireEvent.click(boton("Eliminar"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "DELETE_LOAN", payload: "L7" });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("cancelar cierra sólo este sheet: no borra y no cierra el detalle", () => {
    const { onClose, onDeleted } = montar(prestamo());
    fireEvent.click(boton("Cancelar"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("un préstamo en curso con saldo avisa cuánto debe", () => {
    montar(prestamo({ _status: "overdue", _remaining: 250000 }));
    expect(screen.getByText(/atrasado con saldo pendiente/)).toBeTruthy();
  });

  it("uno ya cerrado no muestra el aviso de saldo", () => {
    montar(prestamo({ _status: "paid", _remaining: 0 }));
    expect(screen.queryByText(/con saldo pendiente/)).toBeNull();
  });
});
