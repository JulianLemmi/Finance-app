/**
 * send-push — envía una notificación web push a todas las subscripciones de un usuario.
 *
 * Variables de entorno requeridas (Supabase secrets):
 *   VAPID_PUBLIC_KEY    — pública (la misma que VITE_VAPID_PUBLIC_KEY en la app)
 *   VAPID_PRIVATE_KEY   — privada
 *   VAPID_SUBJECT       — "mailto:tu@email.com" o URL https
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — automáticas en Edge Functions
 *
 * Deploy / Auth:
 *   supabase functions deploy send-push --no-verify-jwt
 *   IMPORTANTE: va con --no-verify-jwt. La auth la hace el código (SERVICE_ROLE
 *   server-to-server, o JWT de usuario verificado con auth.getUser). Si se deja
 *   verify_jwt activo, el gateway rechaza el SERVICE_ROLE (formato no-JWT en
 *   proyectos nuevos) con 401 y daily-digest no puede invocarla.
 *
 * Body POST:
 *   { userId: string, title: string, body: string, url?: string, tag?: string }
 *
 * Tabla requerida:
 *   create table push_subscriptions (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references auth.users(id) on delete cascade,
 *     endpoint text not null,
 *     p256dh text not null,
 *     auth text not null,
 *     user_agent text,
 *     created_at timestamptz default now(),
 *     unique(user_id, endpoint)
 *   );
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@example.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: "VAPID keys missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response("Bad request", { status: 400, headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Aceptamos dos llamadores legítimos:
  //  (a) SERVICE_ROLE  → server-to-server (ej. daily-digest): confía en body.userId.
  //  (b) JWT de usuario → el cliente lo adjunta via functions.invoke; ignoramos
  //      body.userId y usamos el id del token, para que nadie pueda mandar push a
  //      otra cuenta. Sin token válido → 401.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let userId: string;
  if (token && token === SERVICE_KEY) {
    userId = String(body.userId ?? "").trim();
  } else {
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;
  }

  const title = String(body.title ?? "Finance App");
  const text = String(body.body ?? "");
  const url = body.url ? String(body.url) : "/";
  const tag = body.tag ? String(body.tag) : undefined;

  if (!userId) {
    return new Response(JSON.stringify({ error: "userId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({ title, body: text, url, tag });
  const expired: string[] = [];
  const errors: Array<{ endpoint: string; status?: number; message: string }> = [];
  let sent = 0;

  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; body?: string };
      const statusCode = e?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        expired.push(s.endpoint);
      } else {
        const ep = s.endpoint.slice(0, 60) + (s.endpoint.length > 60 ? "..." : "");
        const msg = e?.message || e?.body || String(err);
        console.warn(`push send error [${statusCode ?? "?"}] ${ep}: ${msg}`);
        if (errors.length < 5) errors.push({ endpoint: ep, status: statusCode, message: msg.slice(0, 200) });
      }
    }
  }));

  if (expired.length > 0) {
    await sb.from("push_subscriptions").delete().eq("user_id", userId).in("endpoint", expired);
  }

  return new Response(JSON.stringify({
    sent,
    removed: expired.length,
    failed: errors.length,
    ...(errors.length ? { errors } : {}),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
