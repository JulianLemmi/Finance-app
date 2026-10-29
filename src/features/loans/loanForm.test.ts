// Contrato del payload que el formulario le manda al reducer. Lo que se cuida acá es que
// EDITAR un préstamo no pise lo que el formulario no toca: UPDATE_LOAN mezcla con
// `{ ...l, ...payload }`, así que una clave presente con valor `undefined` o `[]` borra lo
// guardado.
import { describe, it, expect } from "vitest";
import { buildLoanPayload, emptyLoan, type LoanFormState } from "./loanForm.js";
import { reducer, initialState } from "../../store/index.js";
import type { Loan } from "../../types";

/** Un préstamo con historia: adelantos, cobros de estacionamiento y adicionales. */
const prestamoConHistoria = (): Loan => ({
  id: "l1", clientId: "c1", clientName: "Mario", amount: 10000, interestRate: 8,
  startDate: "2026-05-01", dueDate: "2026-06-01", paymentType: "30", payments: [],
  contacts: [], guarantyType: "cash", guarantyDetail: "", status: "active",
  compoundInterest: false, noDueDate: false, notes: "",
  advancedAt: ["2026-06-20", { date: "2026-07-25", pos: 2 }],
  halfAdvancedAt: ["2026-08-10"],
  parkingFee: 5000,
  parkingPayments: [{ id: "pk1", amount: 5000, date: "2026-06-05" }],
  extras: [{ id: "e1", amount: 2000, date: "2026-07-01" }],
  createdAt: 1_700_000_000_000,
} as Loan);

/** El formulario de edición se arma como en LoanFormSheet: emptyLoan + el préstamo. */
const formDeEdicion = (loan: Loan): LoanFormState => ({
  ...emptyLoan(),
  ...loan,
  vehicle: loan.vehicle ?? {},
  vehicleOn: !!loan.vehicle,
} as LoanFormState);

describe("editar un préstamo", () => {
  it("el payload conserva los adelantos y los cobros de estacionamiento", () => {
    const loan = prestamoConHistoria();
    const payload = buildLoanPayload(formDeEdicion(loan), loan.clientId);
    expect((payload as Partial<Loan>).advancedAt).toEqual(loan.advancedAt);
    expect(payload.parkingPayments).toEqual(loan.parkingPayments);
  });

  it("guardar una edición no pierde nada de la historia (extremo a extremo con el reducer)", () => {
    const loan = prestamoConHistoria();
    const antes = { ...initialState, loaded: true, loans: [loan] };
    // El usuario sólo cambia la nota.
    const form = { ...formDeEdicion(loan), notes: "llamar el lunes" };
    const despues = reducer(antes, { type: "UPDATE_LOAN", payload: buildLoanPayload(form, loan.clientId) as Partial<Loan> & { id: string } });

    const guardado = despues.loans[0];
    expect(guardado.notes).toBe("llamar el lunes");
    expect(guardado.advancedAt).toEqual(loan.advancedAt);
    expect(guardado.halfAdvancedAt).toEqual(loan.halfAdvancedAt);
    expect(guardado.parkingPayments).toEqual(loan.parkingPayments);
    expect(guardado.extras).toEqual(loan.extras);
  });

  it("el payload no trae las claves del historial cuando el préstamo no las tenía", () => {
    // Una clave presente con valor undefined también pisa: no tiene que aparecer.
    const sinHistoria = { ...prestamoConHistoria(), advancedAt: undefined };
    const payload = buildLoanPayload(formDeEdicion(sinHistoria), "c1");
    expect((payload as Partial<Loan>).advancedAt).toBeUndefined();
  });
});

describe("refinanciar", () => {
  it("el formulario arranca sin adelantos ni cobros de estacionamiento", () => {
    // La refinanciación arma su formulario desde emptyLoan, no desde el padre.
    const payload = buildLoanPayload({ ...emptyLoan(), amount: "9000", clientName: "Mario" }, "c1");
    expect((payload as Partial<Loan>).advancedAt).toBeUndefined();
    expect(payload.parkingPayments).toEqual([]);
  });
});

describe("armado del payload", () => {
  const base = (): LoanFormState => ({ ...emptyLoan(), amount: "1000", interestRate: "8", clientName: "A" });

  it("convierte los campos numéricos del formulario", () => {
    const p = buildLoanPayload(base(), "c1");
    expect(p.amount).toBe(1000);
    expect(p.interestRate).toBe(8);
  });

  it("fixedInterest sólo viaja en modo fijo", () => {
    expect(buildLoanPayload({ ...base(), fixedInterest: "500" }, "c1").fixedInterest).toBeUndefined();
    expect(buildLoanPayload({ ...base(), interestMode: "fixed", fixedInterest: "500" }, "c1").fixedInterest).toBe(500);
  });

  it("'Mi %' fuera de (0, 100) o sin socio se descarta", () => {
    expect(buildLoanPayload({ ...base(), sharedWith: "Papá", myPercent: "50" }, "c1").myPercent).toBe(50);
    expect(buildLoanPayload({ ...base(), sharedWith: "Papá", myPercent: "100" }, "c1").myPercent).toBeUndefined();
    expect(buildLoanPayload({ ...base(), sharedWith: "Papá", myPercent: "0" }, "c1").myPercent).toBeUndefined();
    expect(buildLoanPayload({ ...base(), sharedWith: "", myPercent: "50" }, "c1").myPercent).toBeUndefined();
  });

  it("el estacionamiento sin cargo no guarda destinatario", () => {
    const p = buildLoanPayload({ ...base(), parkingFee: "", parkingRecipient: "Papá" }, "c1");
    expect(p.parkingFee).toBeUndefined();
    expect(p.parkingRecipient).toBeUndefined();
  });

  it("los datos del auto sólo viajan con garantía de auto", () => {
    const vehiculo = { model: "Suran", plate: "ab123cd" };
    const conAuto = buildLoanPayload({ ...base(), guarantyType: "vehicle", vehicleOn: true, vehicle: vehiculo }, "c1");
    expect(conAuto.vehicle).toEqual({ model: "Suran", plate: "AB123CD" });
    const enEfectivo = buildLoanPayload({ ...base(), guarantyType: "cash", vehicleOn: true, vehicle: vehiculo }, "c1");
    expect(enEfectivo.vehicle).toBeUndefined();
  });

  it("vehicleOn es estado de formulario y no viaja", () => {
    expect("vehicleOn" in buildLoanPayload(base(), "c1")).toBe(false);
  });
});
