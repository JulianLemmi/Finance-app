import { describe, it, expect, vi, afterEach } from "vitest";
import { registrarOverlay, hayOverlay, onOverlayChange, type CapaOverlay } from "./overlay.js";

// La pila es estado de módulo: cada test libera todo lo que abrió.
const abiertas: CapaOverlay[] = [];
const abrir = () => {
  const capa = registrarOverlay();
  abiertas.push(capa);
  return capa;
};
afterEach(() => {
  abiertas.splice(0).forEach((c) => c.liberar());
  document.body.style.overflow = "";
});

describe("la pila de capas", () => {
  it("sin capas no hay overlay", () => {
    expect(hayOverlay()).toBe(false);
  });

  it("la última que se abrió es la de arriba", () => {
    const abajo = abrir();
    const arriba = abrir();
    expect(arriba.esLaDeArriba()).toBe(true);
    expect(abajo.esLaDeArriba()).toBe(false);
  });

  it("al cerrar la de arriba, la de abajo pasa a ser la de arriba", () => {
    const abajo = abrir();
    const arriba = abrir();
    arriba.liberar();
    expect(abajo.esLaDeArriba()).toBe(true);
    expect(hayOverlay()).toBe(true);
  });

  it("cerrar la de ABAJO no cambia cuál es la de arriba", () => {
    const abajo = abrir();
    const arriba = abrir();
    abajo.liberar();
    expect(arriba.esLaDeArriba()).toBe(true);
  });

  it("liberar dos veces no le saca el lugar a otra capa", () => {
    const abajo = abrir();
    const arriba = abrir();
    arriba.liberar();
    arriba.liberar();
    expect(hayOverlay()).toBe(true);
    expect(abajo.esLaDeArriba()).toBe(true);
  });

  it("una capa ya liberada no es la de arriba", () => {
    const capa = abrir();
    capa.liberar();
    expect(capa.esLaDeArriba()).toBe(false);
  });
});

describe("el aviso del fondo animado", () => {
  it("avisa al abrirse la primera capa y al cerrarse la última, y no entremedio", () => {
    const aviso = vi.fn();
    const baja = onOverlayChange(aviso);
    const a = abrir();
    const b = abrir();
    expect(aviso.mock.calls).toEqual([[true]]);
    a.liberar();
    expect(aviso).toHaveBeenCalledTimes(1); // todavía queda b
    b.liberar();
    expect(aviso.mock.calls).toEqual([[true], [false]]);
    baja();
  });

  it("dejar de escuchar corta el aviso", () => {
    const aviso = vi.fn();
    onOverlayChange(aviso)();
    abrir();
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("el scroll del body", () => {
  it("se bloquea con la primera capa y se restaura al salir la última", () => {
    const a = abrir();
    expect(document.body.style.overflow).toBe("hidden");
    const b = abrir();
    b.liberar();
    expect(document.body.style.overflow).toBe("hidden"); // todavía queda a
    a.liberar();
    expect(document.body.style.overflow).toBe("");
  });

  it("cerrando en OTRO orden que el de apertura el body no queda bloqueado", () => {
    // El bug: cada sheet guardaba el overflow que encontró y lo restauraba al cerrar. Si el
    // de abajo cerraba primero (confirmar una refinanciación cierra el detalle y el
    // formulario), el último en cerrar restauraba el "hidden" que el otro había guardado.
    const abajo = abrir();
    const arriba = abrir();
    abajo.liberar();
    arriba.liberar();
    expect(document.body.style.overflow).toBe("");
  });

  it("restaura el valor que había antes, no lo pisa con vacío", () => {
    document.body.style.overflow = "scroll";
    const capa = abrir();
    expect(document.body.style.overflow).toBe("hidden");
    capa.liberar();
    expect(document.body.style.overflow).toBe("scroll");
  });
});
