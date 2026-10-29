// Cuántas capas a pantalla completa hay abiertas (sheets, buscador global).
//
// Existe por una razón de rendimiento concreta: esas capas tapan la pantalla con un
// `backdrop-filter`, y un desenfoque de pantalla completa encima de un canvas que se
// mueve obliga al navegador a re-desenfocar TODO lo que tiene detrás en cada frame. Con
// el detalle de un préstamo abierto eso dejaba frames de 50-67 ms (contra 18 ms con el
// sheet cerrado): un tirón visible cada vez que se abría una card. Apagar la lluvia
// mientras hay una capa abierta no se nota —detrás de `bg-black/60` desenfocado no se ve
// nada— y el resultado del desenfoque pasa a quedar cacheado, porque atrás ya no cambia
// nada.
//
// Se cuenta en vez de usar un booleano porque se pueden apilar: el detalle de un préstamo
// abre el sheet de pago encima, y cerrar el de arriba no debe reanudar el fondo.

let abiertos = 0;
const suscriptos = new Set<(hay: boolean) => void>();

const avisar = () => {
  const hay = abiertos > 0;
  suscriptos.forEach((fn) => fn(hay));
};

/** Registra una capa abierta. Devuelve la función que la da de baja (idempotente). */
export function registrarOverlay(): () => void {
  abiertos += 1;
  if (abiertos === 1) avisar();
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    abiertos = Math.max(0, abiertos - 1);
    if (abiertos === 0) avisar();
  };
}

export function hayOverlay(): boolean {
  return abiertos > 0;
}

export function onOverlayChange(fn: (hay: boolean) => void): () => void {
  suscriptos.add(fn);
  return () => { suscriptos.delete(fn); };
}
