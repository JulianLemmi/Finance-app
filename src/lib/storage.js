import { createClient } from "@supabase/supabase-js";
import { uid } from "./utils.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_READY =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR_ANON_KEY");

export const supabase = SUPABASE_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export const PHOTO_BUCKET = "loan-photos";

export async function getCurrentUserId() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export const storage = {
  async getAll(keys) {
    if (supabase) {
      try {
        const userId = await getCurrentUserId();
        if (!userId) return {};
        const { data, error } = await supabase
          .from("user_data")
          .select("key, value")
          .eq("user_id", userId)
          .in("key", keys);
        if (error) { console.warn("supabase getAll", error); return {}; }
        return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      } catch (e) {
        console.warn("storage.getAll error", e);
        return {};
      }
    }
    if (typeof window !== "undefined" && window.storage?.get) {
      try {
        const entries = await Promise.all(
          keys.map(async (k) => {
            try { return [k, await window.storage.get(k, { shared: false })]; }
            catch { return [k, null]; }
          })
        );
        return Object.fromEntries(entries);
      } catch {}
    }
    const out = {};
    keys.forEach((k) => {
      try { const raw = localStorage.getItem(k); out[k] = raw ? JSON.parse(raw) : null; }
      catch { out[k] = null; }
    });
    return out;
  },

  async set(key, value) {
    if (supabase) {
      try {
        const userId = await getCurrentUserId();
        if (!userId) return;
        const { error } = await supabase.from("user_data").upsert(
          { user_id: userId, key, value, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
        if (error) console.warn(`supabase set ${key}`, error);
      } catch (e) { console.warn(`storage.set(${key}) error`, e); }
      return;
    }
    if (typeof window !== "undefined" && window.storage?.set) {
      try { await window.storage.set(key, value, { shared: false }); return; } catch {}
    }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

async function toBase64(file, photoId) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) =>
      resolve({ id: photoId, data: e.target.result, name: file.name, createdAt: Date.now() });
    reader.readAsDataURL(file);
  });
}

export async function uploadPhoto(userId, loanId, file) {
  const photoId = uid("photo");
  if (!supabase || !userId) return toBase64(file, photoId);

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
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

export async function deletePhoto(photo) {
  if (photo.path && supabase) {
    try { await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]); } catch {}
  }
}
