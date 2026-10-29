import { describe, it, expect, afterEach, vi } from "vitest";
import { lastMonthKeys } from "./utils.js";

afterEach(() => { vi.unstubAllEnvs(); });

describe("lastMonthKeys", () => {
  it("devuelve los meses en orden cronológico terminando en el actual", () => {
    expect(lastMonthKeys(new Date(2026, 9, 15), 4)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("cruza el cambio de año", () => {
    expect(lastMonthKeys(new Date(2026, 1, 10), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("en una zona UTC+ no corre las claves un mes", () => {
    // Es el caso que rompía `new Date(y, m, 1).toISOString().slice(0, 7)`: en Tokio el 1° a
    // medianoche local es el último día del mes anterior en UTC.
    vi.stubEnv("TZ", "Asia/Tokyo");
    // Precondición: si el entorno no respeta el cambio de zona, el test sería vacuo.
    expect(new Date(2026, 9, 1).toISOString().slice(0, 7)).toBe("2026-09");
    expect(lastMonthKeys(new Date(2026, 9, 15), 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});
