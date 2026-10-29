// Ninguna pantalla monta un sheet: se abren por ModalRoot (OPEN_MODAL). Una pantalla vive
// adentro del contenedor `z-10` y de la animación de entrada, y un sheet montado ahí quedaba
// debajo de la barra de pestañas (en el teléfono le tapaba el botón de guardar) y, con el
// `transform`/`filter` de la animación en un ancestro, se dibujaba en la caja de la pantalla
// y no en la ventana: el formulario de autos aparecía con el encabezado y la X fuera de la
// vista. jsdom no calcula layout, así que un test de render no lo ve: se vigila la causa.
import { describe, it, expect } from "vitest";
import estilos from "../components/GlobalStyles.tsx?raw";

const pantallas = import.meta.glob("./*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("los sheets no se montan adentro de una pantalla", () => {
  it("se leyeron las pantallas (si no, el resto no prueba nada)", () => {
    expect(Object.keys(pantallas).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.keys(pantallas))("%s no monta ningún Sheet", (archivo) => {
    // Sin comentarios: uno puede nombrar un sheet en prosa.
    const codigo = pantallas[archivo].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo.match(/<(?:[A-Z]\w*)?Sheet\b/g) ?? []).toEqual([]);
  });

  it("la animación de entrada de las pantallas no deja su último cuadro puesto", () => {
    // Con `both` o `forwards` el transform y el filter del final quedaban para siempre en la
    // pantalla, y cualquier `position: fixed` de adentro pasaba a medirse contra ella.
    const regla = estilos.match(/\.fa-rise > \* \{[^}]*\}/)?.[0];
    expect(regla).toBeTruthy();
    expect(regla).not.toMatch(/\b(both|forwards)\b/);
  });
});
