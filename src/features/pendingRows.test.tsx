// Las filas de "agregar" de pasivos, activos y autos. Lo que se cuida: lo que quedó tipeado
// en la fila y no se agregó a mano NO se pierde al tocar Guardar. Antes el sheet se cerraba,
// el pago de la deuda no existía y el saldo quedaba más alto que el real.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppContext } from "../store/index.js";
import { todayISO } from "../lib/utils.js";
import type { AppContextValue, AssetPayment, Liability } from "../types";
import LiabilitySheet from "./liabilities/LiabilitySheet.jsx";
import AssetSheet from "./assets/AssetSheet.jsx";
import CarFormSheet from "./cars/CarFormSheet.jsx";

const dispatch = vi.fn();
const montar = (ui: ReactNode) => render(
  <AppContext.Provider value={{ state: { settings: { currency: "$" } }, dispatch } as unknown as AppContextValue}>
    {ui}
  </AppContext.Provider>
);
afterEach(() => {
  cleanup();
  dispatch.mockClear();
  document.body.style.overflow = "";
});

const escribir = (etiqueta: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre }) as HTMLButtonElement;
/** La primera acción que llegó al reducer. */
const accion = () => dispatch.mock.calls[0]?.[0];

describe("Pasivos: el pago tipeado en la fila", () => {
  const nuevaDeuda = () => {
    montar(<LiabilitySheet open onClose={vi.fn()} />);
    escribir("A quién le debés", "Papá");
    escribir("Monto adeudado (original)", "100000");
  };

  it("se registra al guardar aunque no se haya tocado «Registrar pago»", () => {
    nuevaDeuda();
    escribir("Monto", "30000");
    expect(screen.getByText("Se registra al guardar.")).toBeTruthy();
    fireEvent.click(boton("Guardar"));
    expect(accion().type).toBe("ADD_LIABILITY");
    expect(accion().payload.payments).toEqual([expect.objectContaining({ amount: 30000, date: todayISO() })]);
  });

  it("registrado a mano y después guardado, no se duplica", () => {
    nuevaDeuda();
    escribir("Monto", "30000");
    fireEvent.click(boton("Registrar pago"));
    fireEvent.click(boton("Guardar"));
    expect(accion().payload.payments).toHaveLength(1);
  });

  it("un monto que no es un pago no deja guardar y dice por qué", () => {
    nuevaDeuda();
    escribir("Monto", "0");
    expect(screen.getByText("El monto tiene que ser mayor a 0")).toBeTruthy();
    expect(boton("Guardar").disabled).toBe(true);
    fireEvent.click(boton("Guardar"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("al editar, se suma a los pagos que ya había, del más nuevo al más viejo", () => {
    const deuda: Liability = {
      id: "d1", name: "Papá", amount: 100000, startDate: "2000-01-01", createdAt: 1,
      payments: [{ id: "p1", amount: 10000, date: "2000-02-01" }],
    };
    montar(<LiabilitySheet open onClose={vi.fn()} editingLiability={deuda} />);
    escribir("Monto", "5000");
    fireEvent.click(boton("Guardar"));
    expect(accion().type).toBe("UPDATE_LIABILITY");
    expect(accion().payload.payments.map((p: AssetPayment) => p.amount)).toEqual([5000, 10000]);
  });
});

describe("Activos en cuotas: la cuota tipeada en la fila", () => {
  it("se registra al guardar, y el valor del activo la incluye", () => {
    montar(<AssetSheet open onClose={vi.fn()} />);
    escribir("Nombre", "Auto en cuotas");
    fireEvent.click(screen.getByRole("switch", { name: /Se paga en cuotas/ }));
    escribir("Monto", "5000");
    fireEvent.click(boton("Guardar"));
    expect(accion().type).toBe("ADD_ASSET");
    expect(accion().payload.installments).toEqual([expect.objectContaining({ amount: 5000 })]);
    expect(accion().payload.value).toBe(5000);
  });

  it("si la fila quedó oculta (se apagó el modo cuotas), ni cuenta ni bloquea", () => {
    montar(<AssetSheet open onClose={vi.fn()} />);
    escribir("Nombre", "Moto");
    const cuotas = screen.getByRole("switch", { name: /Se paga en cuotas/ });
    fireEvent.click(cuotas);
    escribir("Monto", "0"); // incompleta...
    fireEvent.click(cuotas); // ...pero se apaga el modo cuotas y la fila desaparece
    escribir("Valor estimado", "800000");
    fireEvent.click(boton("Guardar"));
    expect(accion().payload.value).toBe(800000);
    expect(accion().payload.installments).toBeUndefined();
  });
});

describe("Autos: el costo de preparación tipeado en la fila", () => {
  const nuevoAuto = () => {
    montar(<CarFormSheet open onClose={vi.fn()} />);
    escribir("Marca *", "Ford");
    escribir("Modelo *", "Focus");
    escribir("Precio compra *", "5000000");
  };

  it("se suma al guardar aunque no se haya tocado +", () => {
    nuevoAuto();
    escribir("Descripción del costo", "Pintura");
    escribir("Monto del costo", "200000");
    expect(screen.getByText("Se suma al guardar.")).toBeTruthy();
    fireEvent.click(boton("Agregar auto"));
    expect(accion().type).toBe("ADD_CAR");
    expect(accion().payload.prepCosts).toEqual([expect.objectContaining({ description: "Pintura", amount: 200000 })]);
  });

  it("a medio cargar no deja guardar y dice qué falta", () => {
    nuevoAuto();
    escribir("Descripción del costo", "Pintura");
    expect(screen.getByText("Falta el monto del costo")).toBeTruthy();
    expect(boton("Agregar auto").disabled).toBe(true);
    expect(boton("Agregar costo").disabled).toBe(true);
  });
});
