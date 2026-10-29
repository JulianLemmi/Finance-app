// Respaldo: exportar y volver a importar tiene que devolver exactamente lo que había.
//
// Lo que se cuida acá es que el respaldo sea COMPLETO. Faltaban `cars` y `liabilities`:
// restaurar un respaldo (o "Borrar todo" y después restaurar) dejaba la app sin autos ni
// pasivos, y como los pasivos restan del capital total, el capital salía mal sin aviso.
import { describe, it, expect } from "vitest";
import { buildBackup, readBackupFile } from "./backup.js";
import { initialState } from "../store/index.js";
import type { AppState } from "../types";

const fileDe = (contenido: unknown) =>
  new File([typeof contenido === "string" ? contenido : JSON.stringify(contenido)], "respaldo.json", { type: "application/json" });

const estado = (): AppState => ({
  ...initialState,
  loaded: true,
  loans: [{
    id: "l1", clientId: "c1", clientName: "Mario", amount: 10000, interestRate: 8,
    startDate: "2026-05-01", dueDate: "2026-06-01", paymentType: "30",
    payments: [{ id: "p1", amount: 800, date: "2026-06-01" }], contacts: [],
    guarantyType: "cash", guarantyDetail: "", status: "active", noDueDate: false, notes: "",
  }] as unknown as AppState["loans"],
  clients: [{ id: "c1", name: "Mario", riskLevel: "low", createdAt: 1 }] as AppState["clients"],
  expenses: [{ id: "e1", amount: 500, category: "Comida", date: "2026-06-02" }] as unknown as AppState["expenses"],
  income: [],
  assets: [{ id: "a1", name: "Plazo fijo", value: 5000 }] as unknown as AppState["assets"],
  cars: [{ id: "car1", brand: "VW", model: "Suran", status: "available" }] as unknown as AppState["cars"],
  liabilities: [{ id: "d1", name: "Papá", amount: 4000, payments: [{ id: "dp1", amount: 1500, date: "2026-07-01" }] }] as unknown as AppState["liabilities"],
});

describe("el respaldo es completo", () => {
  it("incluye los autos y los pasivos", () => {
    const b = buildBackup(estado());
    expect(b.cars).toHaveLength(1);
    expect(b.liabilities).toHaveLength(1);
  });

  it("exportar y volver a importar devuelve todo, autos y pasivos incluidos", async () => {
    const s = estado();
    const r = await readBackupFile(fileDe(buildBackup(s)));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.loans).toEqual(s.loans);
    expect(r.data.clients).toEqual(s.clients);
    expect(r.data.assets).toEqual(s.assets);
    expect(r.data.cars).toEqual(s.cars);
    expect(r.data.liabilities).toEqual(s.liabilities);
    expect(r.summary.cars).toBe(1);
    expect(r.summary.liabilities).toBe(1);
  });

  it("un respaldo de una cuenta SIN autos ni pasivos los restaura vacíos (no los omite)", async () => {
    const vacio = { ...estado(), cars: [], liabilities: [] };
    const r = await readBackupFile(fileDe(buildBackup(vacio)));
    if (!r.ok) throw new Error(r.error);
    // `[]` es "no hay": hay que vaciar los actuales, y eso sólo pasa si la clave viaja.
    expect(r.data.cars).toEqual([]);
    expect(r.data.liabilities).toEqual([]);
  });
});

describe("compatibilidad con respaldos viejos", () => {
  const viejo = () => {
    const { cars: _c, liabilities: _l, ...resto } = buildBackup(estado());
    return resto;
  };

  it("un respaldo anterior a autos y pasivos sigue importando", async () => {
    const r = await readBackupFile(fileDe(viejo()));
    expect(r.ok).toBe(true);
  });

  it("y NO pisa los autos y pasivos actuales: las claves se omiten, no se vacían", async () => {
    const r = await readBackupFile(fileDe(viejo()));
    if (!r.ok) throw new Error(r.error);
    expect("cars" in r.data).toBe(false);
    expect("liabilities" in r.data).toBe(false);
    expect(r.summary.cars).toBeUndefined();
    expect(r.summary.liabilities).toBeUndefined();
  });
});

describe("rechaza lo que ninguna versión de la app pudo generar", () => {
  const conCambio = (cambio: (b: ReturnType<typeof buildBackup>) => void) => {
    const b = buildBackup(estado());
    cambio(b);
    return readBackupFile(fileDe(b));
  };

  it("un préstamo con el monto no numérico (llegaría a pantalla como $NaN)", async () => {
    const r = await conCambio((b) => { (b.loans[0] as { amount: unknown }).amount = "abc"; });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/"loans".*monto inválido/);
  });

  it("un préstamo sin monto", async () => {
    const r = await conCambio((b) => { delete (b.loans[0] as { amount?: unknown }).amount; });
    expect(r.ok).toBe(false);
  });

  it("un pago con el monto inválido", async () => {
    const r = await conCambio((b) => { ((b.loans[0] as { payments: { amount: unknown }[] }).payments[0]).amount = null; });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/pago/);
  });

  it("un movimiento, un activo o un pasivo con el monto inválido", async () => {
    expect((await conCambio((b) => { (b.expenses[0] as { amount: unknown }).amount = "x"; })).ok).toBe(false);
    expect((await conCambio((b) => { (b.assets[0] as { value: unknown }).value = "x"; })).ok).toBe(false);
    expect((await conCambio((b) => { (b.liabilities[0] as { amount: unknown }).amount = "x"; })).ok).toBe(false);
  });

  it("los montos guardados como texto numérico siguen valiendo", async () => {
    const r = await conCambio((b) => { (b.loans[0] as { amount: unknown }).amount = "10000"; });
    expect(r.ok).toBe(true);
  });

  it("autos o pasivos que no son una lista", async () => {
    expect((await conCambio((b) => { (b as { cars: unknown }).cars = "no"; })).ok).toBe(false);
    expect((await conCambio((b) => { (b as { liabilities: unknown }).liabilities = {}; })).ok).toBe(false);
  });

  it("un elemento de autos o pasivos que no es un objeto", async () => {
    expect((await conCambio((b) => { b.cars = [1]; })).ok).toBe(false);
    expect((await conCambio((b) => { b.liabilities = [null]; })).ok).toBe(false);
  });

  it("el error dice cuál es el elemento, para poder arreglar el archivo", async () => {
    const r = await conCambio((b) => { b.loans.push({ id: "l2", amount: "malo", payments: [] }); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Elemento 2");
  });
});

describe("estructura general", () => {
  it("JSON inválido", async () => {
    const r = await readBackupFile(fileDe("{no es json"));
    expect(r).toEqual({ ok: false, error: "El archivo no es un JSON válido." });
  });

  it("sin versión", async () => {
    const { version: _v, ...sinVersion } = buildBackup(estado());
    const r = await readBackupFile(fileDe(sinVersion));
    expect(r.ok).toBe(false);
  });

  it("de una versión más nueva que la app", async () => {
    const r = await readBackupFile(fileDe({ ...buildBackup(estado()), version: 99 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/más nueva/);
  });
});
