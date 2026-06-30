/**
 * dollar-watch — vigila la cotización del dólar blue (bluelytics) y manda push.
 *
 * Dos modos (via ?mode=):
 *   watch   (default) — corre seguido (ej. cada 30 min). Avisa a cada usuario cuando el
 *                       blue venta se movió más que su umbral desde el último aviso.
 *   summary           — corre 1×/día al cierre. Manda la variación del día vs el cierre
 *                       anterior y resetea las bases del umbral.
 *
 * Opt-in: cada usuario con key 'finance:settings' donde value.dollarAlerts === true.
 * Umbral por usuario: value.dollarThreshold (pesos, default 20).
 *
 * Estado global en tabla app_kv (key 'dollar:state'):
 *   { lastSell, lastAt, prevCloseSell, prevCloseDate, baselines: { [userId]: { sell, at } } }
 *
 * Variables de entorno requeridas:
 *   CRON_SECRET                — string aleatorio que el cron debe enviar en X-Cron-Secret
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — automáticas
 * Opcionales:
 *   DIGEST_TZ_OFFSET           — offset horario en horas (default -3 = Argentina)
 *
 * Tabla requerida:
 *   create table app_kv (
 *     key text primary key,
 *     value jsonb,
 *     updated_at timestamptz default now()
 *   );
 *   alter table app_kv enable row level security;  -- sin policies: sólo service role (edge functions)
 *
 * Deploy:
 *   supabase functions deploy dollar-watch --no-verify-jwt
 *
 * IMPORTANTE — "Verify JWT" debe quedar DESACTIVADO en esta función.
 *   Por qué: el cron la llama con un header X-Cron-Secret (no manda un JWT de Supabase).
 *   Si "Verify JWT" está activado, el gateway de Supabase rechaza la llamada con 401
 *   ANTES de que corra el código (ni siquiera llega a chequear el CRON_SECRET). La auth
 *   real la hace este código comparando X-Cron-Secret === CRON_SECRET.
 *   - Por CLI: el flag --no-verify-jwt ya lo deja off.
 *   - Por Dashboard: Edge Functions → dollar-watch → pestaña "Details" (o el engranaje
 *     "Function settings") → desactivar "Verify JWT". Mismo motivo que send-push/daily-digest.
 *
 * Ver README para el SQL de los cron jobs.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TZ_OFFSET = Number(Deno.env.get("DIGEST_TZ_OFFSET") ?? "-3");
const BLUELYTICS = "https://api.bluelytics.com.ar/v2/latest";
const STATE_KEY = "dollar:state";
const DEFAULT_THRESHOLD = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

type Baselines = Record<string, { sell: number; at: string }>;
interface DollarState {
  lastSell?: number;
  lastAt?: string;
  prevCloseSell?: number;
  prevCloseDate?: string;
  baselines?: Baselines;
}

function todayInTz(offsetHours: number): string {
  return new Date(Date.now() + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

async function fetchBlueSell(): Promise<number | null> {
  try {
    const res = await fetch(BLUELYTICS);
    if (!res.ok) return null;
    const json = await res.json();
    const sell = Number(json?.blue?.value_sell);
    return Number.isFinite(sell) && sell > 0 ? sell : null;
  } catch {
    return null;
  }
}

async function sendPush(userId: string, title: string, body: string, tag: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ userId, title, body, url: "/", tag }),
  });
  if (!res.ok) console.warn(`send-push fail for ${userId}: ${res.status}`);
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const got = req.headers.get("X-Cron-Secret") ?? req.headers.get("x-cron-secret");
  if (!CRON_SECRET || got !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const mode = new URL(req.url).searchParams.get("mode") === "summary" ? "summary" : "watch";

  const sell = await fetchBlueSell();
  if (sell == null) {
    return new Response(JSON.stringify({ error: "bluelytics fetch failed" }), { status: 502, headers: jsonHeaders });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date().toISOString();
  const today = todayInTz(TZ_OFFSET);

  const { data: stateRow } = await sb.from("app_kv").select("value").eq("key", STATE_KEY).maybeSingle();
  const state: DollarState = (stateRow?.value as DollarState) ?? {};
  const baselines: Baselines = state.baselines ?? {};

  const { data: rows, error } = await sb
    .from("user_data")
    .select("user_id, value")
    .eq("key", "finance:settings");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders });
  }

  const users = (rows ?? [])
    .map((r) => ({ userId: r.user_id as string, s: (r.value ?? {}) as Record<string, unknown> }))
    .filter((u) => u.s.dollarAlerts === true);

  let sent = 0;

  if (mode === "watch") {
    for (const u of users) {
      const threshold = Math.max(1, Number(u.s.dollarThreshold) || DEFAULT_THRESHOLD);
      const base = baselines[u.userId];
      if (!base) {
        baselines[u.userId] = { sell, at: now };
        continue;
      }
      const delta = sell - base.sell;
      if (Math.abs(delta) >= threshold) {
        const up = delta > 0;
        const title = `Dólar blue ${up ? "subió" : "bajó"} ${fmt(Math.abs(delta))}`;
        const body = `${fmt(base.sell)} → ${fmt(sell)} (${up ? "+" : "−"}${fmt(Math.abs(delta))})`;
        if (await sendPush(u.userId, title, body, "dollar-watch")) sent++;
        baselines[u.userId] = { sell, at: now };
      }
    }
  } else {
    // summary: variación del día vs el cierre anterior
    const ref = state.prevCloseSell;
    if (ref != null) {
      for (const u of users) {
        const delta = sell - ref;
        const up = delta >= 0;
        const pct = ref > 0 ? (delta / ref) * 100 : 0;
        const title = `Cierre dólar blue: ${fmt(sell)}`;
        const body = `Hoy ${up ? "+" : "−"}${fmt(Math.abs(delta))} (${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%) vs cierre anterior ${fmt(ref)}`;
        if (await sendPush(u.userId, title, body, "dollar-summary")) sent++;
      }
    }
    state.prevCloseSell = sell;
    state.prevCloseDate = today;
    // El cierre fija la nueva base: el umbral del día siguiente se mide desde acá.
    for (const k of Object.keys(baselines)) baselines[k] = { sell, at: now };
  }

  state.lastSell = sell;
  state.lastAt = now;
  state.baselines = baselines;

  const { error: upErr } = await sb.from("app_kv").upsert({ key: STATE_KEY, value: state, updated_at: now });
  if (upErr) console.warn(`app_kv upsert fail: ${upErr.message}`);

  return new Response(JSON.stringify({ mode, sell, users: users.length, sent, today }), { headers: jsonHeaders });
});
