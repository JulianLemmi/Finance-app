import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uid } from "./utils.js";
import type { Photo } from "../types";

declare global {
  interface Window {
    storage?: {
      get: (key: string, options?: { shared?: boolean }) => Promise<unknown>;
      set: (key: string, value: unknown, options?: { shared?: boolean }) => Promise<void>;
    };
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_READY =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR_ANON_KEY");

export const supabase: SupabaseClient | null = SUPABASE_READY
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export const PHOTO_BUCKET = "loan-photos";

/** Se despacha en `window` cuando el almacenamiento local se queda sin espacio. */
export const STORAGE_QUOTA_EVENT = "finance:storage-quota-exceeded";
/** Se despacha en `window` cuando un guardado en Supabase falla (red, permisos, sin sesión). */
export const STORAGE_SAVE_FAILED_EVENT = "finance:storage-save-failed";

const avisar = (evento: string, key: string) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(evento, { detail: { key } }));
  } catch {
    // Un aviso que no se puede mostrar no tiene que romper el guardado que lo originó.
  }
};

// `getSession` y no `getUser`: la sesión sale del almacenamiento local, mientras que
// `getUser` hace una llamada de red a Supabase. Con `getUser` cada guardado de cada slice
// costaba un viaje de ida y vuelta (hasta nueve por cambio), y si esa llamada fallaba el
// guardado se descartaba en silencio. `autoRefreshToken` ya renueva la sesión sola.
export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export const storage = {
  /**
   * Lee todas las claves. Devuelve `null` cuando NO PUDO leer (red caída, sin sesión,
   * error de permisos) y un objeto —posiblemente vacío— cuando leyó: un usuario nuevo sin
   * datos es `{}`, un fallo es `null`.
   *
   * La diferencia es plata. Antes los dos casos devolvían `{}`, la app arrancaba vacía y
   * marcaba los datos como cargados, y el primer gasto que se cargaba hacía `upsert` de
   * una lista de UN elemento encima de la lista real guardada en Supabase.
   */
  async getAll(keys: string[]): Promise<Record<string, unknown> | null> {
    if (supabase) {
      try {
        const userId = await getCurrentUserId();
        if (!userId) return null;
        const { data, error } = await supabase
          .from("user_data")
          .select("key, value")
          .eq("user_id", userId)
          .in("key", keys);
        if (error) { console.warn("supabase getAll", error); return null; }
        return Object.fromEntries((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
      } catch (e) {
        console.warn("storage.getAll error", e);
        return null;
      }
    }
    if (typeof window !== "undefined" && window.storage?.get) {
      try {
        const entries = await Promise.all(
          keys.map(async (k) => {
            try { return [k, await window.storage!.get(k, { shared: false })]; }
            catch { return [k, null]; }
          })
        );
        return Object.fromEntries(entries);
      } catch {
        // window.storage falló en bloque: se sigue con localStorage, abajo.
      }
    }
    const out: Record<string, unknown> = {};
    keys.forEach((k) => {
      try { const raw = localStorage.getItem(k); out[k] = raw ? JSON.parse(raw) : null; }
      catch { out[k] = null; }
    });
    return out;
  },

  async set(key: string, value: unknown): Promise<void> {
    if (supabase) {
      // Un guardado que falla avisa (STORAGE_SAVE_FAILED_EVENT) en vez de quedarse en un
      // `console.warn`: si el usuario cierra la app creyendo que se guardó, pierde el cambio.
      try {
        const userId = await getCurrentUserId();
        if (!userId) { avisar(STORAGE_SAVE_FAILED_EVENT, key); return; }
        const { error } = await supabase.from("user_data").upsert(
          { user_id: userId, key, value, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
        if (error) { console.warn(`supabase set ${key}`, error); avisar(STORAGE_SAVE_FAILED_EVENT, key); }
      } catch (e) {
        console.warn(`storage.set(${key}) error`, e);
        avisar(STORAGE_SAVE_FAILED_EVENT, key);
      }
      return;
    }
    if (typeof window !== "undefined" && window.storage?.set) {
      try { await window.storage.set(key, value, { shared: false }); return; }
      catch (e) { console.warn(`storage.set(${key}) window.storage error`, e); }
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      const err = e as { name?: string; code?: number; message?: string };
      const quotaExceeded = err?.name === "QuotaExceededError"
        || err?.code === 22
        || err?.code === 1014
        || /quota/i.test(err?.message || "");
      console.warn(`storage.set(${key}) localStorage error${quotaExceeded ? " — quota exceeded" : ""}`, e);
      if (quotaExceeded) avisar(STORAGE_QUOTA_EVENT, key);
    }
  },
};

async function toBase64(file: File, photoId: string): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) =>
      resolve({ id: photoId, data: e.target?.result as string, name: file.name, createdAt: Date.now() });
    // Sin esto, un archivo ilegible dejaba la promesa colgada para siempre y la galería en
    // "subiendo" sin salida.
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export async function uploadPhoto(userId: string, loanId: string, file: File): Promise<Photo> {
  const photoId = uid("photo");
  if (!supabase || !userId) return toBase64(file, photoId);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${loanId}/${photoId}.${ext}`;
  try {
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return { id: photoId, url: urlData.publicUrl, path, name: file.name, createdAt: Date.now() };
  } catch {
    return toBase64(file, photoId);
  }
}

export async function deletePhoto(photo: Photo): Promise<void> {
  if (photo.path && supabase) {
    try {
      await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
    } catch (e) {
      // La foto ya salió de la lista del préstamo: si el archivo no se pudo borrar queda
      // huérfano en el bucket. No se le avisa al usuario, pero que quede registro.
      console.warn("deletePhoto: no se pudo borrar del bucket", photo.path, e);
    }
  }
}
