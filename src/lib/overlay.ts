// La pila de capas a pantalla completa que hay abiertas (sheets, buscador global).
//
// Tres cosas dependen de saber qué capas hay y en qué orden:
//
// 1. RENDIMIENTO. Esas capas tapan la pantalla con un `backdrop-filter`, y un desenfoque de
//    pantalla completa encima de un canvas que se mueve obliga al navegador a re-desenfocar
//    TODO lo que tiene detrás en cada frame. Con el detalle de un préstamo abierto eso
//    dejaba frames de 50-67 ms (contra 18 ms con el sheet cerrado). Apagar la lluvia de
//    billetes mientras hay una capa abierta no se nota —detrás de `bg-black/60` desenfocado
//    no se ve nada— y el desenfoque queda cacheado, porque atrás ya no cambia nada
//    (`hayOverlay` / `onOverlayChange`).
//
// 2. ESCAPE. Cada capa escucha `Escape` en `document`, así que con dos apiladas (el detalle
//    de un préstamo y el sheet de cobro encima) UN solo toque cerraba las dos. Sólo la de
//    arriba tiene que reaccionar (`esLaDeArriba`).
//
// 3. SCROLL. Cada sheet guardaba el `overflow` previo del body y lo restauraba al cerrar,
//    pero si se cerraban en otro orden que el de apertura (el padre antes que el hijo, como
//    pasa al confirmar una refinanciación) el body quedaba bloqueado para siempre: el
//    último en cerrar restauraba el "hidden" que el otro había guardado. Acá hay un único
//    dueño: se bloquea con la primera capa y se restaura al salir la última.
//
// Es una pila y no un booleano porque las capas se apilan: cerrar la de arriba no debe
// reanudar el fondo ni desbloquear el scroll si todavía queda otra abierta.

/** Una capa abierta. Se obtiene con `registrarOverlay` y se da de baja con `liberar`. */
export interface CapaOverlay {
  /** Da de baja la capa. Idempotente. */
  liberar: () => void;
  /** ¿Es la última que se abrió entre las que siguen abiertas? */
  esLaDeArriba: () => boolean;
}

const pila: symbol[] = [];
const suscriptos = new Set<(hay: boolean) => void>();
let overflowPrevio = "";

const avisar = () => {
  const hay = pila.length > 0;
  suscriptos.forEach((fn) => fn(hay));
};

export function registrarOverlay(): CapaOverlay {
  const id = Symbol("capa");
  if (pila.length === 0) {
    overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  pila.push(id);
  if (pila.length === 1) avisar();

  let liberada = false;
  return {
    liberar: () => {
      if (liberada) return;
      liberada = true;
      const i = pila.indexOf(id);
      if (i >= 0) pila.splice(i, 1);
      if (pila.length === 0) {
        document.body.style.overflow = overflowPrevio;
        avisar();
      }
    },
    esLaDeArriba: () => pila[pila.length - 1] === id,
  };
}

export function hayOverlay(): boolean {
  return pila.length > 0;
}

export function onOverlayChange(fn: (hay: boolean) => void): () => void {
  suscriptos.add(fn);
  return () => { suscriptos.delete(fn); };
}
