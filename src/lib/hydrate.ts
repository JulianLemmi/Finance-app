// Lectura defensiva de lo que viene del almacenamiento.
//
// `storage.getAll` devuelve `unknown`: es el borde por donde entran datos que nadie validó
// (una edición manual de la base, un respaldo viejo, un bug de una versión anterior). La
// hidratación los metía con `as never` —que apaga el chequeo de tipos sin dejar rastro— y
// confiaba en que cada elemento fuera un objeto: con un solo `null` en una lista,
// `stripComputed` lanzaba, la hidratación fallaba y la app se quedaba para siempre en el
// esqueleto de carga, sin ningún mensaje.

/**
 * Una lista persistida, sin los elementos que no son objetos. Lo que no es un array es una
 * lista vacía. Si descarta algo lo avisa por consola: es un dato que alguien tendría que mirar.
 */
export function leerLista<T extends object>(valor: unknown, nombre = "lista"): T[] {
  if (!Array.isArray(valor)) return [];
  const validos = valor.filter((x): x is T => !!x && typeof x === "object" && !Array.isArray(x));
  if (validos.length !== valor.length) {
    console.warn(`hydrate: "${nombre}" traía ${valor.length - validos.length} elemento(s) que no eran objetos; se descartaron.`);
  }
  return validos;
}

/** Un objeto persistido, o `undefined` si lo guardado no es un objeto. */
export function leerObjeto<T extends object>(valor: unknown): T | undefined {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as T) : undefined;
}
