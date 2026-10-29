// Cadena de refinanciación de un préstamo: del primer eslabón al último.
//
// Los dos recorridos tienen guarda de visitados. Con datos corruptos (un backup editado a
// mano, o un préstamo borrado a medias) un préstamo puede apuntar a otro que apunta de
// vuelta, y un `while` sin guarda se queda dando vueltas y cuelga la pantalla del detalle.

interface Eslabon {
  id: string;
  refinancedFromId?: string;
}

/** Los eslabones de la cadena a la que pertenece `loan`, en orden de refinanciación. */
export function refinanceChain<T extends Eslabon>(all: readonly T[], loan: T): T[] {
  const porId = new Map(all.map((l) => [l.id, l]));
  const hijoDe = new Map<string, T>();
  for (const l of all) {
    // Con más de un hijo manda el primero, igual que el `find` que había antes.
    if (l.refinancedFromId && !hijoDe.has(l.refinancedFromId)) hijoDe.set(l.refinancedFromId, l);
  }

  const visto = new Set<string>([loan.id]);
  let raiz: T = loan;
  while (raiz.refinancedFromId) {
    const padre = porId.get(raiz.refinancedFromId);
    if (!padre || visto.has(padre.id)) break;
    visto.add(padre.id);
    raiz = padre;
  }

  const cadena: T[] = [raiz];
  const enCadena = new Set<string>([raiz.id]);
  let nodo = raiz;
  for (;;) {
    const siguiente = hijoDe.get(nodo.id);
    if (!siguiente || enCadena.has(siguiente.id)) break;
    cadena.push(siguiente);
    enCadena.add(siguiente.id);
    nodo = siguiente;
  }
  return cadena;
}
