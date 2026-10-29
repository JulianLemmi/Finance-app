// Sheet: pila de capas (Escape), foco y ciclo de vida. Lo que se cuida acá son tres cosas que
// el navegador no hace solo y que estaban mal:
//   - con dos sheets apilados, UN Escape cerraba los dos;
//   - el foco se iba a la app de atrás con Tab y no volvía al cerrar;
//   - el efecto del sheet se rehacía en cada render del padre (apagaba y prendía la capa).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useState } from "react";
import { Sheet } from "./sheet.jsx";
import { onOverlayChange } from "../../lib/overlay.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = "";
});

const escape = () => fireEvent.keyDown(document, { key: "Escape" });
const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey });
/** Deja pasar la animación de salida (CLOSE_MS) para que el sheet llame a su onClose. */
const pasarLaSalida = () => act(() => { vi.advanceTimersByTime(300); });

describe("Escape con sheets apilados", () => {
  it("cierra SÓLO el de arriba", () => {
    const cerrarAbajo = vi.fn();
    const cerrarArriba = vi.fn();
    render(
      <>
        <Sheet open onClose={cerrarAbajo} title="Abajo"><p>detalle</p></Sheet>
        <Sheet open onClose={cerrarArriba} title="Arriba"><p>cobro</p></Sheet>
      </>
    );
    escape();
    pasarLaSalida();
    expect(cerrarArriba).toHaveBeenCalledTimes(1);
    expect(cerrarAbajo).not.toHaveBeenCalled();
  });

  it("una vez cerrado el de arriba, el siguiente Escape cierra el de abajo", () => {
    const cerrarAbajo = vi.fn();
    const vista = render(
      <>
        <Sheet open onClose={cerrarAbajo} title="Abajo"><p>detalle</p></Sheet>
        <Sheet open onClose={vi.fn()} title="Arriba"><p>cobro</p></Sheet>
      </>
    );
    // El padre desmonta el de arriba, como hace ModalRoot / LoanDetailSheet.
    vista.rerender(<Sheet open onClose={cerrarAbajo} title="Abajo"><p>detalle</p></Sheet>);
    escape();
    pasarLaSalida();
    expect(cerrarAbajo).toHaveBeenCalledTimes(1);
  });

  it("un sheet cerrado (open=false) no cuenta ni reacciona", () => {
    const cerrar = vi.fn();
    render(<Sheet open={false} onClose={cerrar} title="Cerrado"><p>x</p></Sheet>);
    escape();
    pasarLaSalida();
    expect(cerrar).not.toHaveBeenCalled();
  });
});

describe("foco", () => {
  it("al abrir, el foco entra al diálogo", () => {
    render(<Sheet open onClose={vi.fn()} title="T"><button>uno</button></Sheet>);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("si algo de adentro ya tiene el foco (autoFocus), no se lo saca", () => {
    render(<Sheet open onClose={vi.fn()} title="T"><input aria-label="campo" autoFocus /></Sheet>);
    expect(document.activeElement).toBe(screen.getByLabelText("campo"));
  });

  it("Tab desde el último control vuelve al primero (no se escapa a la app de atrás)", () => {
    render(<Sheet open onClose={vi.fn()} title="T"><button>uno</button><button>dos</button></Sheet>);
    screen.getByText("dos").focus();
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Cerrar")); // la X del header
  });

  it("Shift+Tab desde el primero va al último", () => {
    render(<Sheet open onClose={vi.fn()} title="T"><button>uno</button><button>dos</button></Sheet>);
    screen.getByLabelText("Cerrar").focus();
    tab(true);
    expect(document.activeElement).toBe(screen.getByText("dos"));
  });

  it("el sheet de arriba atrapa el Tab; el de abajo no interviene", () => {
    render(
      <>
        <Sheet open onClose={vi.fn()} title="Abajo"><button>a-fin</button></Sheet>
        <Sheet open onClose={vi.fn()} title="Arriba"><button>b-fin</button></Sheet>
      </>
    );
    screen.getByText("b-fin").focus();
    tab();
    // Si interviniera el de abajo, el foco se habría ido a su contenido.
    const dialogoArriba = screen.getAllByRole("dialog")[1];
    expect(dialogoArriba.contains(document.activeElement)).toBe(true);
  });

  it("al cerrar, el foco vuelve a quien lo abrió", () => {
    function Con() {
      const [abierto, setAbierto] = useState(false);
      return (
        <>
          <button onClick={() => setAbierto(true)}>abrir</button>
          {abierto && <Sheet open onClose={() => setAbierto(false)} title="T"><p>x</p></Sheet>}
        </>
      );
    }
    render(<Con />);
    const opener = screen.getByText("abrir");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    escape();
    pasarLaSalida();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("el fondo (backdrop) no es un destino de Tab", () => {
    render(<Sheet open onClose={vi.fn()} title="T"><p>x</p></Sheet>);
    const backdrop = screen.getByLabelText("cerrar");
    expect(backdrop.getAttribute("tabindex")).toBe("-1");
  });
});

describe("ciclo de vida", () => {
  it("re-renderizar al padre con un onClose nuevo NO apaga y prende la capa", () => {
    // El efecto de la capa dependía de `requestClose`, que cambiaba con cada `onClose` en
    // línea: cada render del padre desmontaba la capa y la volvía a montar (el fondo
    // animado se reanudaba un instante y el desenfoque se reiniciaba).
    const cambios: boolean[] = [];
    const baja = onOverlayChange((hay) => cambios.push(hay));
    const vista = render(<Sheet open onClose={() => {}} title="T"><p>x</p></Sheet>);
    expect(cambios).toEqual([true]);
    for (let i = 0; i < 5; i++) {
      vista.rerender(<Sheet open onClose={() => {}} title="T"><p>x</p></Sheet>);
    }
    expect(cambios).toEqual([true]); // ni un apagado/encendido de más
    baja();
  });

  it("llama al onClose MÁS RECIENTE, no al del primer render", () => {
    const viejo = vi.fn();
    const nuevo = vi.fn();
    const vista = render(<Sheet open onClose={viejo} title="T"><p>x</p></Sheet>);
    vista.rerender(<Sheet open onClose={nuevo} title="T"><p>x</p></Sheet>);
    escape();
    pasarLaSalida();
    expect(nuevo).toHaveBeenCalledTimes(1);
    expect(viejo).not.toHaveBeenCalled();
  });

  it("si se desmonta durante la animación de salida, el onClose pendiente NO se dispara", () => {
    const cerrar = vi.fn();
    const vista = render(<Sheet open onClose={cerrar} title="T"><p>x</p></Sheet>);
    escape();
    act(() => { vi.advanceTimersByTime(100); });
    vista.unmount();
    pasarLaSalida();
    expect(cerrar).not.toHaveBeenCalled();
  });

  it("bloquea el scroll del body mientras está abierto y lo restaura al cerrar", () => {
    const vista = render(<Sheet open onClose={vi.fn()} title="T"><p>x</p></Sheet>);
    expect(document.body.style.overflow).toBe("hidden");
    vista.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
