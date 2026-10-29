// Manejo de foco para los diálogos modales.
//
// Un `role="dialog" aria-modal="true"` promete que lo de atrás no se puede usar, pero eso no
// lo hace el navegador solo: con Tab el foco se iba a los botones de la app que quedaba
// debajo del sheet (y con Enter se podían accionar). `atraparTab` mantiene el foco adentro.

const FOCUSABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"]):not([disabled])",
].join(",");

/** Los elementos a los que se llega con Tab dentro de `raiz`, en orden de documento. */
export function enfocables(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCUSABLES)).filter((el) => {
    // `tabindex="-1"` se puede enfocar por código pero no es una parada de Tab: el selector
    // lo deja pasar en los <button>/<input>, que lo traen por defecto.
    if (el.tabIndex < 0) return false;
    // Lo que está oculto no recibe foco: un acordeón colapsado no puede ser el "último".
    if (el.closest("[hidden], [inert]")) return false;
    const estilo = getComputedStyle(el);
    return estilo.display !== "none" && estilo.visibility !== "hidden";
  });
}

/**
 * Mantiene el foco dentro de `raiz` al apretar Tab / Shift+Tab: del último vuelve al primero
 * y del primero (con Shift) al último. Si no hay nada enfocable, deja el foco en la propia
 * `raiz` (que tiene que tener `tabIndex={-1}`).
 */
export function atraparTab(e: KeyboardEvent, raiz: HTMLElement): void {
  const lista = enfocables(raiz);
  if (lista.length === 0) {
    e.preventDefault();
    raiz.focus();
    return;
  }
  const primero = lista[0];
  const ultimo = lista[lista.length - 1];
  const activo = document.activeElement as HTMLElement | null;
  const afuera = !activo || !raiz.contains(activo);

  if (e.shiftKey) {
    // Desde el primero, desde la propia raíz o desde afuera: al último.
    if (afuera || activo === primero || activo === raiz) {
      e.preventDefault();
      ultimo.focus();
    }
  } else if (afuera || activo === ultimo) {
    e.preventDefault();
    primero.focus();
  }
}
