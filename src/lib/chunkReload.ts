// Recarga ante un chunk viejo, con guarda contra el bucle.
//
// Después de un deploy, el navegador puede pedir un chunk que ya no existe y falla el
// import dinámico. Recargar trae la versión nueva y lo arregla. Pero si el chunk SIGUE
// fallando (sin red, o un 404 que recargar no resuelve), una recarga incondicional se
// vuelve un bucle infinito: la pantalla parpadea para siempre sin mostrar nunca el error.
// Por eso se recarga una sola vez por ventana de tiempo, y si no se puede recordar que ya
// se recargó (sessionStorage bloqueado), no se recarga: es preferible mostrar el error a
// arriesgar el bucle.
const KEY = "finance:chunk-reload-at";

/** Mínimo entre dos recargas automáticas. */
export const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

/** Recarga la página si no se hizo hace poco. Devuelve si recargó. */
export function tryReloadForStaleChunk(
  now: number = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  let last: number;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    return false;
  }
  if (now - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
