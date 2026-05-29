import { supabase, getCurrentUserId } from "./storage.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const PUSH_SUPPORTED =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const PUSH_CONFIGURED = !!VAPID_PUBLIC_KEY;

export interface SubscriptionState {
  supported: boolean;
  permission: NotificationPermission | "default";
  subscribed: boolean;
  endpoint?: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64Url(buffer: ArrayBuffer | null): string | null {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getSubscriptionState(): Promise<SubscriptionState> {
  if (!PUSH_SUPPORTED) return { supported: false, permission: "default", subscribed: false };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: !!sub,
      endpoint: sub?.endpoint ?? null,
    };
  } catch {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }
}

export async function subscribePush(): Promise<PushSubscription> {
  if (!PUSH_SUPPORTED) throw new Error("Tu navegador no soporta notificaciones push.");
  if (!PUSH_CONFIGURED) throw new Error("Falta VITE_VAPID_PUBLIC_KEY en el .env.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permiso de notificaciones denegado.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    });
  }

  if (supabase) {
    const userId = await getCurrentUserId();
    if (userId) {
      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? bufferToBase64Url((sub as PushSubscription & { getKey?: (name: string) => ArrayBuffer | null }).getKey?.("p256dh") ?? null),
          auth: json.keys?.auth ?? bufferToBase64Url((sub as PushSubscription & { getKey?: (name: string) => ArrayBuffer | null }).getKey?.("auth") ?? null),
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "user_id,endpoint" },
      );
      if (error) console.warn("push_subscriptions upsert", error);
    }
  }

  return sub;
}

export async function unsubscribePush(): Promise<void> {
  if (!PUSH_SUPPORTED) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (e) { console.warn("push unsubscribe", e); }
  if (supabase) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
      if (error) console.warn("push_subscriptions delete", error);
    }
  }
}

export async function sendTestPush(): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Sesión no encontrada.");
  const { error } = await supabase.functions.invoke("send-push", {
    body: { userId, title: "Finance App", body: "✅ Notificaciones funcionando correctamente.", url: "/" },
  });
  if (error) throw error;
}
