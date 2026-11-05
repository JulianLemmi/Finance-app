// Achicar fotos: la cuenta de tamaños, y que ante cualquier cosa rara se devuelva la
// original en vez de perder la foto. El redibujado en canvas no se prueba acá (jsdom no
// lo implementa): se verifica en navegador real.
import { describe, it, expect } from "vitest";
import { dimensionesEscaladas, achicarFoto, FOTO_MAX_LADO } from "./image.js";

describe("dimensionesEscaladas", () => {
  it("una foto de teléfono (4032×3024) queda con el lado largo en 1600", () => {
    expect(dimensionesEscaladas(4032, 3024)).toEqual({ w: 1600, h: 1200 });
  });

  it("vertical: el lado largo es el alto", () => {
    expect(dimensionesEscaladas(3024, 4032)).toEqual({ w: 1200, h: 1600 });
  });

  it("nunca agranda una imagen que ya es chica", () => {
    expect(dimensionesEscaladas(800, 600)).toEqual({ w: 800, h: 600 });
    expect(dimensionesEscaladas(FOTO_MAX_LADO, 100)).toEqual({ w: FOTO_MAX_LADO, h: 100 });
  });

  it("una franja finísima no se redondea a 0 de alto", () => {
    expect(dimensionesEscaladas(20000, 3).h).toBeGreaterThanOrEqual(1);
  });

  it("medidas rotas dan 0×0 (y no NaN)", () => {
    expect(dimensionesEscaladas(0, 100)).toEqual({ w: 0, h: 0 });
    expect(dimensionesEscaladas(Number.NaN, 100)).toEqual({ w: 0, h: 0 });
  });
});

describe("achicarFoto devuelve la original cuando no puede o no corresponde", () => {
  it("lo que no es imagen", async () => {
    const f = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect(await achicarFoto(f)).toBe(f);
  });

  it("gif y svg no se tocan (se perdería la animación / el vector)", async () => {
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    const svg = new File(["x"], "a.svg", { type: "image/svg+xml" });
    expect(await achicarFoto(gif)).toBe(gif);
    expect(await achicarFoto(svg)).toBe(svg);
  });

  it("si el navegador no la puede decodificar, no se pierde la foto", async () => {
    // jsdom no tiene createImageBitmap: es el mismo camino que un formato raro.
    const f = new File(["no soy una imagen"], "a.jpg", { type: "image/jpeg" });
    expect(await achicarFoto(f)).toBe(f);
  });
});
