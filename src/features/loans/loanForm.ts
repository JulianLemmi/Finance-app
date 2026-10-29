// Estado y armado del formulario de préstamos. Vive acá, fuera del componente, para poder
// testear lo que viaja al reducer: el formulario es difícil de renderizar en un test, y los
// bugs de este archivo pierden datos sin avisar (ver `buildLoanPayload`).
import { uid, todayISO, addDays, addCalendarMonths } from "../../lib/utils.js";
import { limpiarVehiculo } from "../../lib/vehicle.js";
import type { LoanVehicle, Payment, PaymentType, GuarantyType, LoanStatus, Settings, InterestMode } from "../../types";

/** El bloque cuenta sólo si está prendido Y la garantía es un auto: cambiar la garantía a
 *  efectivo no puede dejar los datos de un auto colgados en el préstamo. */
export const vehicleHabilitado = (f: { vehicleOn: boolean; guarantyType: GuarantyType }) =>
  f.vehicleOn && f.guarantyType === "vehicle";

export interface LoanFormState {
  id: string;
  clientId: string;
  clientName: string;
  alias: string;
  amount: string | number;
  interestRate: string | number;
  interestMode: InterestMode;
  fixedInterest: string | number;
  startDate: string;
  paymentType: PaymentType;
  customDays: string | number;
  dueDate: string;
  guarantyType: GuarantyType;
  guarantyDetail: string;
  status: LoanStatus;
  notes: string;
  payments: Payment[];
  compoundInterest: boolean;
  noDueDate: boolean;
  sharedWith: string;
  myPercent: string | number;
  parkingFee: string | number;
  parkingRecipient: string;
  parkingPayments: Payment[];
  /** Prende el bloque "Datos del auto". Vive sólo en el formulario: lo que se guarda es
   *  `vehicle`, y que haya datos cargados es lo que lo vuelve a prender al editar. */
  vehicleOn: boolean;
  vehicle: LoanVehicle;
  createdAt?: number;
}

export function emptyLoan(defaults: Partial<Settings> = {}): LoanFormState {
  const start = todayISO();
  const rate = defaults.defaultRate ?? 8;
  const days = defaults.defaultDays ?? 30;
  const paymentType: PaymentType = days === 15 ? "15" : days === 30 ? "30" : "custom";
  return {
    id: "", clientId: "", clientName: "", alias: "", amount: "",
    interestRate: String(rate), interestMode: "percent", fixedInterest: "",
    startDate: start, paymentType,
    customDays: days,
    dueDate: paymentType === "30" ? addCalendarMonths(start, 1) : addDays(start, days),
    guarantyType: "cash",
    guarantyDetail: "", status: "active", notes: "", payments: [],
    compoundInterest: false, noDueDate: false,
    sharedWith: "", myPercent: "",
    parkingFee: "", parkingRecipient: "", parkingPayments: [],
    vehicleOn: false, vehicle: {},
  };
}

/**
 * Lo que se despacha al reducer a partir del formulario.
 *
 * El payload NO debe pisar campos que el formulario no edita. `UPDATE_LOAN` hace
 * `{ ...l, ...payload }`, así que cualquier clave presente —aunque valga `undefined` o
 * `[]`— reemplaza lo guardado. Acá se forzaban `advancedAt: undefined` y
 * `parkingPayments: []` "para la refinanciación", y editar un préstamo (cambiar una nota)
 * borraba sus adelantos y sus cobros de estacionamiento: los adelantos mueven la deuda,
 * así que era plata perdida en silencio. La refinanciación no necesita esos overrides: su
 * formulario arranca de `emptyLoan`, que no los trae.
 */
export function buildLoanPayload(form: LoanFormState, clientId: string) {
  const myPercent = Number(form.myPercent);
  const parkingFee = Number(form.parkingFee);
  // `vehicleOn` es estado de formulario y no viaja al préstamo.
  const { vehicleOn: _on, vehicle: vehicleForm, ...formSinUI } = form;
  return {
    ...formSinUI,
    vehicle: vehicleHabilitado(form) ? limpiarVehiculo(vehicleForm) : undefined,
    id: form.id || uid("loan"), clientId,
    amount: Number(form.amount), interestRate: Number(form.interestRate),
    interestMode: form.interestMode,
    fixedInterest: form.interestMode === "fixed" ? Number(form.fixedInterest || 0) : undefined,
    customDays: Number(form.customDays) || undefined,
    sharedWith: form.sharedWith.trim() || undefined,
    myPercent: form.sharedWith.trim() && Number.isFinite(myPercent) && myPercent > 0 && myPercent < 100 ? myPercent : undefined,
    parkingFee: Number.isFinite(parkingFee) && parkingFee > 0 ? parkingFee : undefined,
    parkingRecipient: parkingFee > 0 ? form.parkingRecipient.trim() || undefined : undefined,
    createdAt: form.createdAt || Date.now(),
  };
}
