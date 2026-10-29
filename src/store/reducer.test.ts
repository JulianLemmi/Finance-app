// Casos del reducer que no son fórmulas: lo que cada acción le hace al estado.
import { describe, it, expect } from "vitest";
import { reducer, initialState } from "./index.js";
import type { AppState, Client, Loan } from "../types";

const cliente = (over: Partial<Client> = {}): Client => ({
  id: "c1", name: "Mario Gutierrez", riskLevel: "low", createdAt: 1, ...over,
}) as Client;

const prestamo = (over: Partial<Loan> = {}): Loan => ({
  id: "l1", clientId: "c1", clientName: "Mario Gutierrez", amount: 1000, interestRate: 8,
  startDate: "2026-05-01", dueDate: "2026-06-01", paymentType: "30", payments: [], contacts: [],
  guarantyType: "cash", guarantyDetail: "", status: "active", noDueDate: false, notes: "",
  ...over,
}) as Loan;

const estado = (over: Partial<AppState> = {}): AppState => ({ ...initialState, loaded: true, ...over });

describe("UPDATE_CLIENT", () => {
  it("renombrar al cliente actualiza el nombre en TODOS sus préstamos", () => {
    // Cada préstamo guarda una copia de `clientName`: sin esto la lista de clientes decía
    // un nombre y los préstamos, el buscador y el push seguían con el viejo.
    const s = estado({
      clients: [cliente()],
      loans: [prestamo({ id: "l1" }), prestamo({ id: "l2" })],
    });
    const r = reducer(s, { type: "UPDATE_CLIENT", payload: { ...cliente(), name: "Mario Gutiérrez" } });
    expect(r.clients[0].name).toBe("Mario Gutiérrez");
    expect(r.loans.map((l) => l.clientName)).toEqual(["Mario Gutiérrez", "Mario Gutiérrez"]);
  });

  it("no toca los préstamos de otros clientes", () => {
    const s = estado({
      clients: [cliente(), cliente({ id: "c2", name: "Laura" })],
      loans: [prestamo({ id: "l1" }), prestamo({ id: "l2", clientId: "c2", clientName: "Laura" })],
    });
    const r = reducer(s, { type: "UPDATE_CLIENT", payload: { ...cliente(), name: "Mario G." } });
    expect(r.loans.find((l) => l.id === "l2")!.clientName).toBe("Laura");
  });

  it("si el nombre no cambió, los préstamos quedan exactamente como estaban (misma referencia)", () => {
    // Importa para los memos: una copia nueva invalidaría todo lo derivado sin necesidad.
    const s = estado({ clients: [cliente()], loans: [prestamo()] });
    const r = reducer(s, { type: "UPDATE_CLIENT", payload: { ...cliente(), phone: "1155551234" } });
    expect(r.loans).toBe(s.loans);
    expect(r.clients[0].phone).toBe("1155551234");
  });

  it("cambiar otro dato (riesgo, teléfono) no reescribe el nombre de los préstamos", () => {
    const s = estado({ clients: [cliente()], loans: [prestamo({ clientName: "Alias viejo" })] });
    const r = reducer(s, { type: "UPDATE_CLIENT", payload: { ...cliente(), riskLevel: "high" } });
    expect(r.loans[0].clientName).toBe("Alias viejo");
  });
});
