// Tests del gesto de "mantener apretado" (archivar préstamos en la pestaña Préstamos).
//
// El caso que más importa es el scroll en mobile: al deslizar el dedo para bajar, la
// lista pasa por debajo de varias cards, y sin defensas cada una parpadeaba
// "Archivando...". Acá se fijan las dos que lo evitan.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "./hooks.js";

const EN = (x: number, y: number) => ({ clientX: x, clientY: y });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const avanzar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("useLongPress", () => {
  it("dispara recién a los 2 segundos", () => {
    const alSostener = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener));

    act(() => result.current.handlers.onPointerDown(EN(0, 0)));
    avanzar(1999);
    expect(alSostener).not.toHaveBeenCalled();
    avanzar(2);
    expect(alSostener).toHaveBeenCalledTimes(1);
  });

  it("no muestra el feedback apenas se toca la card", () => {
    // Este era el bug: `pressing` se encendía en el ms 0, así que rozar una card al
    // scrollear ya mostraba el overlay.
    const { result } = renderHook(() => useLongPress(vi.fn()));

    act(() => result.current.handlers.onPointerDown(EN(0, 0)));
    expect(result.current.pressing).toBe(false);
    avanzar(100);
    expect(result.current.pressing).toBe(false);
    avanzar(300);
    expect(result.current.pressing).toBe(true);
  });

  it("cancela si el dedo se desplaza (scroll)", () => {
    const alSostener = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener));

    act(() => result.current.handlers.onPointerDown(EN(100, 100)));
    avanzar(500);
    expect(result.current.pressing).toBe(true);

    act(() => result.current.handlers.onPointerMove(EN(100, 140))); // arrancó el scroll
    expect(result.current.pressing).toBe(false);

    avanzar(3000);
    expect(alSostener).not.toHaveBeenCalled();
  });

  it("tolera el micro-movimiento del dedo al sostener", () => {
    const alSostener = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener));

    act(() => result.current.handlers.onPointerDown(EN(100, 100)));
    act(() => result.current.handlers.onPointerMove(EN(104, 103))); // temblor, no scroll
    avanzar(2100);
    expect(alSostener).toHaveBeenCalledTimes(1);
  });

  it("un scroll rápido nunca llega a mostrar el overlay", () => {
    const alSostener = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener));

    act(() => result.current.handlers.onPointerDown(EN(100, 100)));
    avanzar(80);                                                    // el dedo apoya
    act(() => result.current.handlers.onPointerMove(EN(100, 220))); // y se va hacia abajo
    avanzar(3000);
    expect(result.current.pressing).toBe(false);
    expect(alSostener).not.toHaveBeenCalled();
  });

  it("un toque corto abre el detalle en vez de archivar", () => {
    const alSostener = vi.fn();
    const alTocar = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener, alTocar));

    act(() => result.current.handlers.onPointerDown(EN(0, 0)));
    avanzar(150);
    act(() => result.current.handlers.onPointerUp());
    act(() => result.current.handlers.onClick());

    expect(alTocar).toHaveBeenCalledTimes(1);
    expect(alSostener).not.toHaveBeenCalled();
  });

  it("después de archivar no abre además el detalle", () => {
    // El navegador dispara click igual al soltar; ese click no debe abrir el sheet.
    const alSostener = vi.fn();
    const alTocar = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener, alTocar));

    act(() => result.current.handlers.onPointerDown(EN(0, 0)));
    avanzar(2100);
    act(() => result.current.handlers.onPointerUp());
    act(() => result.current.handlers.onClick());

    expect(alSostener).toHaveBeenCalledTimes(1);
    expect(alTocar).not.toHaveBeenCalled();
  });

  it("cancelar el puntero aborta el gesto", () => {
    const alSostener = vi.fn();
    const { result } = renderHook(() => useLongPress(alSostener));

    for (const abortar of [
      () => result.current.handlers.onPointerCancel(),
      () => result.current.handlers.onPointerLeave(),
      () => result.current.handlers.onPointerUp(),
    ]) {
      act(() => result.current.handlers.onPointerDown(EN(0, 0)));
      avanzar(500);
      act(abortar);
      avanzar(3000);
    }
    expect(alSostener).not.toHaveBeenCalled();
  });

  it("la barra de progreso dura lo que queda hasta disparar", () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));
    expect(result.current.progressMs).toBe(2000 - 350);
  });

  it("no deja timers vivos al desmontarse", () => {
    // Archivar saca la card de la lista: el componente se desmonta con el gesto en curso.
    const alSostener = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(alSostener));

    act(() => result.current.handlers.onPointerDown(EN(0, 0)));
    unmount();
    avanzar(3000);
    expect(alSostener).not.toHaveBeenCalled();
  });

  it("los tiempos son configurables", () => {
    const alSostener = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(alSostener, undefined, { delayMs: 800, feedbackAfterMs: 100, moveTolerancePx: 3 }));

    act(() => result.current.handlers.onPointerDown(EN(0, 0)));
    avanzar(150);
    expect(result.current.pressing).toBe(true);
    act(() => result.current.handlers.onPointerMove(EN(5, 0))); // supera la tolerancia de 3px
    avanzar(1000);
    expect(alSostener).not.toHaveBeenCalled();
  });
});
