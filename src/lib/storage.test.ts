// Contrato de `storage` con el backend de Supabase (simulado). Lo que se cuida:
//
//  1. `getAll` distingue "el usuario no tiene datos" ({}) de "no se pudo leer" (null).
//     Con los dos casos devolviendo {}, una lectura fallida arrancaba la app vacía, y el
//     primer cambio subía una lista casi vacía encima de los datos reales.
//  2. Un guardado que falla AVISA en vez de perderse en un console.warn.
//  3. La sesión sale de `getSession` (local), no de `getUser` (un viaje de red por guardado).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Resultado = { data: unknown; error: unknown };

/** Un cliente de Supabase mínimo y controlable. */
function armarCliente(opts: {
  session?: { user: { id: string } } | null;
  select?: () => Promise<Resultado>;
  upsert?: () => Promise<{ error: unknown }>;
  sessionLanza?: boolean;
}) {
  const getUser = vi.fn();
  const getSession = vi.fn(async () => {
    if (opts.sessionLanza) throw new Error("storage bloqueado");
    return { data: { session: opts.session === undefined ? { user: { id: "u1" } } : opts.session } };
  });
  const upsert = vi.fn(opts.upsert ?? (async () => ({ error: null })));
  const cliente = {
    auth: { getUser, getSession },
    from: () => ({
      select: () => ({
        eq: () => ({ in: opts.select ?? (async () => ({ data: [], error: null })) }),
      }),
      upsert,
    }),
  };
  return { cliente, getUser, getSession, upsert };
}

/** Importa `storage.ts` de cero con un cliente simulado y las variables de entorno puestas. */
async function cargarStorage(cliente: unknown) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  vi.doMock("@supabase/supabase-js", () => ({ createClient: () => cliente }));
  return import("./storage.js");
}

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@supabase/supabase-js");
  vi.restoreAllMocks();
});

describe("getAll con Supabase", () => {
  it("devuelve las filas como un objeto clave → valor", async () => {
    const { cliente } = armarCliente({
      select: async () => ({ data: [{ key: "finance:loans", value: [{ id: "l1" }] }], error: null }),
    });
    const { storage } = await cargarStorage(cliente);
    expect(await storage.getAll(["finance:loans"])).toEqual({ "finance:loans": [{ id: "l1" }] });
  });

  it("un usuario nuevo SIN datos es un objeto vacío, no un fallo", async () => {
    const { cliente } = armarCliente({ select: async () => ({ data: [], error: null }) });
    const { storage } = await cargarStorage(cliente);
    expect(await storage.getAll(["finance:loans"])).toEqual({});
  });

  it("si la consulta devuelve error, es null (NO un objeto vacío)", async () => {
    const { cliente } = armarCliente({ select: async () => ({ data: null, error: { message: "timeout" } }) });
    const { storage } = await cargarStorage(cliente);
    expect(await storage.getAll(["finance:loans"])).toBeNull();
  });

  it("si la consulta lanza (red caída), es null", async () => {
    const { cliente } = armarCliente({ select: async () => { throw new TypeError("Failed to fetch"); } });
    const { storage } = await cargarStorage(cliente);
    expect(await storage.getAll(["finance:loans"])).toBeNull();
  });

  it("sin sesión no se puede leer: null", async () => {
    const { cliente } = armarCliente({ session: null });
    const { storage } = await cargarStorage(cliente);
    expect(await storage.getAll(["finance:loans"])).toBeNull();
  });
});

describe("la sesión", () => {
  it("sale de getSession y nunca de getUser (que es una llamada de red)", async () => {
    const { cliente, getUser, getSession } = armarCliente({});
    const { storage } = await cargarStorage(cliente);
    await storage.getAll(["finance:loans"]);
    await storage.set("finance:loans", []);
    expect(getSession).toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("si getSession lanza, devuelve null en vez de propagar", async () => {
    const { cliente } = armarCliente({ sessionLanza: true });
    const { getCurrentUserId } = await cargarStorage(cliente);
    expect(await getCurrentUserId()).toBeNull();
  });
});

describe("set con Supabase", () => {
  const escuchar = (evento: string) => {
    const visto: string[] = [];
    const h = (e: Event) => visto.push((e as CustomEvent<{ key: string }>).detail.key);
    window.addEventListener(evento, h);
    return { visto, quitar: () => window.removeEventListener(evento, h) };
  };

  it("un guardado exitoso hace upsert y no avisa nada", async () => {
    const { cliente, upsert } = armarCliente({});
    const { storage, STORAGE_SAVE_FAILED_EVENT } = await cargarStorage(cliente);
    const l = escuchar(STORAGE_SAVE_FAILED_EVENT);
    await storage.set("finance:expenses", [{ id: "e1" }]);
    l.quitar();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(l.visto).toEqual([]);
  });

  it("si Supabase rechaza el guardado, avisa con la clave que falló", async () => {
    const { cliente } = armarCliente({ upsert: async () => ({ error: { message: "RLS" } }) });
    const { storage, STORAGE_SAVE_FAILED_EVENT } = await cargarStorage(cliente);
    const l = escuchar(STORAGE_SAVE_FAILED_EVENT);
    await storage.set("finance:expenses", []);
    l.quitar();
    expect(l.visto).toEqual(["finance:expenses"]);
  });

  it("si la red lanza, avisa", async () => {
    const { cliente } = armarCliente({ upsert: async () => { throw new TypeError("Failed to fetch"); } });
    const { storage, STORAGE_SAVE_FAILED_EVENT } = await cargarStorage(cliente);
    const l = escuchar(STORAGE_SAVE_FAILED_EVENT);
    await storage.set("finance:income", []);
    l.quitar();
    expect(l.visto).toEqual(["finance:income"]);
  });

  it("sin sesión el cambio se descartaba en silencio: ahora avisa", async () => {
    const { cliente, upsert } = armarCliente({ session: null });
    const { storage, STORAGE_SAVE_FAILED_EVENT } = await cargarStorage(cliente);
    const l = escuchar(STORAGE_SAVE_FAILED_EVENT);
    await storage.set("finance:loans", []);
    l.quitar();
    expect(upsert).not.toHaveBeenCalled();
    expect(l.visto).toEqual(["finance:loans"]);
  });
});
