// Contrato de la pantalla de bloqueo. Lo que estos tests cuidan es el pedido concreto:
// el PIN se pide al entrar, el acceso dura 5 minutos y, dentro de esa ventana, actualizar
// la página NO lo vuelve a pedir. Esto último sólo se cumple si el sello del último
// desbloqueo vive en localStorage — en memoria se perdería en cada recarga y el PIN
// volvería a aparecer en cada F5.
//
// El reloj va congelado (`vi.setSystemTime`) porque toda la regla es una resta contra
// `Date.now()`: sin congelarlo, el test del límite pasaría o fallaría por milisegundos.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  lockGate, markUnlocked, getLastUnlock, getLockConfig, saveLockConfig,
  clearLockConfig, savePin, checkPin, LOCK_GRACE_MS,
} from "./lock.js";

const T0 = new Date(2026, 9, 28, 12, 0, 0);
const SELLO_KEY = "finance:lock-last-unlock";
const CONFIG_KEY = "finance:lock";
const PIN_FALSO = "v2:salt:hash"; // `lockGate` sólo mira si hay pinHash, no lo verifica

const avanzar = (ms: number) => vi.setSystemTime(new Date(T0.getTime() + ms));

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  localStorage.clear();
  vi.setSystemTime(T0);
});

describe("qué se muestra al entrar", () => {
  it("sin PIN guardado, pide crear uno", () => {
    expect(lockGate()).toBe("setup");
  });

  it("un config viejo con el bloqueo apagado también pide crear uno", () => {
    // Antes el lock era opcional y se guardaba `{ enabled: false }`. Ese flag ya no se
    // lee: no tener pinHash es lo único que importa, y significa que hay que crear uno.
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ enabled: false }));
    expect(lockGate()).toBe("setup");
  });

  it("con PIN guardado y sin haber desbloqueado nunca, pide el PIN", () => {
    saveLockConfig({ pinHash: PIN_FALSO });
    expect(lockGate()).toBe("pin");
  });

  it("recién desbloqueado, deja pasar", () => {
    saveLockConfig({ pinHash: PIN_FALSO });
    markUnlocked();
    expect(lockGate()).toBe("open");
  });
});

describe("la ventana de acceso de 5 minutos", () => {
  beforeEach(() => {
    saveLockConfig({ pinHash: PIN_FALSO });
    markUnlocked();
  });

  it("dura exactamente lo que dice la constante", () => {
    expect(LOCK_GRACE_MS).toBe(5 * 60 * 1000);
  });

  it("actualizar la página adentro de la ventana no vuelve a pedir el PIN", () => {
    avanzar(4 * 60 * 1000);
    expect(lockGate()).toBe("open");
  });

  it("justo en el límite todavía deja pasar", () => {
    avanzar(LOCK_GRACE_MS);
    expect(lockGate()).toBe("open");
  });

  it("pasada la ventana, actualizar vuelve a pedir el PIN", () => {
    avanzar(LOCK_GRACE_MS + 1);
    expect(lockGate()).toBe("pin");
  });

  it("el sello queda en localStorage, que es lo que lo hace sobrevivir a un F5", () => {
    // Si el sello viviera en memoria, cada recarga arrancaría en cero y la ventana de
    // 5 minutos no existiría: el PIN aparecería en cada actualización.
    expect(localStorage.getItem(SELLO_KEY)).toBe(String(T0.getTime()));
    expect(getLastUnlock()).toBe(T0.getTime());
  });

  it("un sello corrupto se lee como nunca desbloqueado, no como acceso libre", () => {
    localStorage.setItem(SELLO_KEY, "mañana");
    expect(getLastUnlock()).toBe(0);
    expect(lockGate()).toBe("pin");
  });

  it("desbloquear de nuevo reinicia la ventana", () => {
    avanzar(LOCK_GRACE_MS + 1);
    expect(lockGate()).toBe("pin");
    markUnlocked();
    expect(lockGate()).toBe("open");
    avanzar(LOCK_GRACE_MS + 1 + 4 * 60 * 1000);
    expect(lockGate()).toBe("open");
  });
});

describe("cambiar el PIN", () => {
  it("el PIN nuevo valida y el viejo deja de servir", async () => {
    await savePin("1234");
    const viejo = getLockConfig().pinHash;
    await savePin("5678");
    expect(await checkPin("5678", getLockConfig().pinHash)).toBe(true);
    expect(await checkPin("1234", getLockConfig().pinHash)).toBe(false);
    expect(getLockConfig().pinHash).not.toBe(viejo);
  });

  it("conserva la huella registrada", async () => {
    // Guardar el config entero desde cero borraba `credentialId`: cambiar el PIN dejaba
    // al usuario sin biométrico y sin explicación.
    saveLockConfig({ pinHash: PIN_FALSO, credentialId: [1, 2, 3] });
    await savePin("4321");
    expect(getLockConfig().credentialId).toEqual([1, 2, 3]);
  });
});

describe("olvidé mi PIN", () => {
  it("borra el PIN y también el sello de acceso", () => {
    saveLockConfig({ pinHash: PIN_FALSO, credentialId: [1] });
    markUnlocked();
    clearLockConfig();
    // Dejar el sello haría que el próximo que entre aproveche los minutos que le
    // quedaban al anterior: tiene que caer en el alta de PIN, no en "open".
    expect(getLastUnlock()).toBe(0);
    expect(getLockConfig()).toEqual({});
    expect(lockGate()).toBe("setup");
  });
});
