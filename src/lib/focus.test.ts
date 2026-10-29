import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enfocables, atraparTab } from "./focus.js";

let raiz: HTMLDivElement;

beforeEach(() => {
  raiz = document.createElement("div");
  raiz.tabIndex = -1;
  document.body.appendChild(raiz);
});
afterEach(() => { raiz.remove(); });

const boton = (texto: string, atributos: Record<string, string> = {}) => {
  const b = document.createElement("button");
  b.textContent = texto;
  Object.entries(atributos).forEach(([k, v]) => b.setAttribute(k, v));
  raiz.appendChild(b);
  return b;
};

const tab = (shift = false) => {
  const e = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, cancelable: true, bubbles: true });
  atraparTab(e, raiz);
  return e;
};

describe("enfocables", () => {
  it("devuelve los controles en orden de documento", () => {
    const a = boton("a");
    const input = document.createElement("input");
    raiz.appendChild(input);
    const b = boton("b");
    expect(enfocables(raiz)).toEqual([a, input, b]);
  });

  it("deja afuera lo deshabilitado, lo oculto y lo que no entra por Tab", () => {
    const ok = boton("ok");
    boton("deshabilitado", { disabled: "" });
    boton("no por tab", { tabindex: "-1" });
    const oculto = boton("oculto");
    oculto.style.display = "none";
    const invisible = boton("invisible");
    invisible.style.visibility = "hidden";
    const envuelto = document.createElement("div");
    envuelto.setAttribute("hidden", "");
    const dentro = document.createElement("button");
    envuelto.appendChild(dentro);
    raiz.appendChild(envuelto);
    expect(enfocables(raiz)).toEqual([ok]);
  });

  it("un input oculto (type=hidden) no cuenta", () => {
    const h = document.createElement("input");
    h.type = "hidden";
    raiz.appendChild(h);
    expect(enfocables(raiz)).toEqual([]);
  });
});

describe("atraparTab", () => {
  it("Tab desde el último vuelve al primero", () => {
    const primero = boton("1");
    boton("2");
    const ultimo = boton("3");
    ultimo.focus();
    const e = tab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(primero);
  });

  it("Shift+Tab desde el primero va al último", () => {
    const primero = boton("1");
    boton("2");
    const ultimo = boton("3");
    primero.focus();
    const e = tab(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ultimo);
  });

  it("en el medio no interviene: el navegador mueve el foco solo", () => {
    boton("1");
    const medio = boton("2");
    boton("3");
    medio.focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(tab(true).defaultPrevented).toBe(false);
  });

  it("con el foco AFUERA del contenedor, Tab lo trae adentro", () => {
    const primero = boton("1");
    boton("2");
    const afuera = document.createElement("button");
    document.body.appendChild(afuera);
    afuera.focus();
    const e = tab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(primero);
    afuera.remove();
  });

  it("Shift+Tab desde la propia raíz (donde cae el foco al abrir) va al último", () => {
    boton("1");
    const ultimo = boton("2");
    raiz.focus();
    expect(document.activeElement).toBe(raiz);
    const e = tab(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ultimo);
  });

  it("sin nada enfocable deja el foco en la raíz en vez de escaparse", () => {
    const e = tab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(raiz);
  });
});
