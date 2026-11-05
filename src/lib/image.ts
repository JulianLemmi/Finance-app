// Achicar las fotos antes de subirlas. Una foto de teléfono mide 12 MP y pesa 3-10 MB; la
// galería la dibuja en un cuadradito de 120 px. Decodificar tres de esas encima del fondo
// animado y los desenfoques satura la GPU del teléfono: toda la pantalla titila y se
// traba. Y si la subida al bucket falla, la foto se guarda como base64 DENTRO del préstamo,
// con lo que esos MB viajan en cada guardado de préstamos.
//
// 1600 px de lado largo y JPEG 0,82 dejan un comprobante o una garantía perfectamente
// legibles en ~200-400 KB.
export const FOTO_MAX_LADO = 1600;
export const FOTO_CALIDAD = 0.82;
// Por debajo de esto no vale la pena tocarla (y no se le pierde calidad a una captura chica).
const FOTO_YA_CHICA_BYTES = 300 * 1024;

/** Tamaño escalado para que el lado largo no pase de `max`, sin agrandar nunca. */
export function dimensionesEscaladas(w: number, h: number, max = FOTO_MAX_LADO): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const lado = Math.max(w, h);
  if (lado <= max) return { w: Math.round(w), h: Math.round(h) };
  const k = max / lado;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Devuelve la foto achicada, o la original si no hace falta o si el navegador no puede
 * (formato raro, sin canvas): subir la original es peor que achicarla, pero mejor que
 * perder la foto. Respeta la orientación EXIF (`imageOrientation: "from-image"`).
 */
export async function achicarFoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const { w, h } = dimensionesEscaladas(bmp.width, bmp.height);
      if (!w || !h) return file;
      const yaChica = w === Math.round(bmp.width) && h === Math.round(bmp.height) && file.size <= FOTO_YA_CHICA_BYTES;
      if (yaChica) return file;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", FOTO_CALIDAD));
      // Si "achicada" pesa más que la original (pasa con PNG chicos), queda la original.
      if (!blob || blob.size >= file.size) return file;
      const nombre = file.name.replace(/\.[^.]+$/, "") || "foto";
      return new File([blob], `${nombre}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      bmp.close();
    }
  } catch {
    return file;
  }
}
