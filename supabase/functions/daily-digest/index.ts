/**
 * daily-digest — corre 1×/día (9 AM ART vía cron) y envía push con los
 * próximos vencimientos de cada usuario.
 *
 * Para cada usuario que tenga datos en user_data:
 *   1. Lee sus préstamos
 *   2. Lista los vencimientos dentro de los próximos WINDOW_DAYS días
 *      (activos en su fecha + renovaciones de atrasados), con nombre y fecha
 *   3. Si hay al menos uno, dispara send-push con el resumen
 *
 * Variables de entorno requeridas:
 *   CRON_SECRET                    — string aleatorio que el cron debe enviar en X-Cron-Secret
 *   SUPABASE_URL                   — automática
 *   SUPABASE_SERVICE_ROLE_KEY      — automática
 * Opcionales:
 *   DIGEST_TZ_OFFSET               — offset horario en horas (default -3 = Argentina)
 *   DIGEST_WINDOW_DAYS             — días hacia adelante a incluir (default 7)
 *
 * Deploy:
 *   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
 *   supabase functions deploy daily-digest --no-verify-jwt
 *
 * Ver README para el SQL del cron job.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Loan, todayISOInTz } from "../_shared/loanMath.ts";
import { buildDigest } from "../_shared/digest.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TZ_OFFSET = Number(Deno.env.get("DIGEST_TZ_OFFSET") ?? "-3");
// Ventana de días hacia adelante a incluir en el digest (default 7).
const WINDOW_DAYS = Number(Deno.env.get("DIGEST_WINDOW_DAYS") ?? "7");

async function sendPush(userId: string, title: string, body: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ userId, title, body, url: "/", tag: "daily-digest" }),
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) console.warn(`send-push fail for ${userId}: ${res.status} ${txt}`);
  return { ok: res.ok, status: res.status, text: txt.slice(0, 250) };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Reject without the shared secret to prevent abuse.
  const got = req.headers.get("X-Cron-Secret") ?? req.headers.get("x-cron-secret");
  if (!CRON_SECRET || got !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = todayISOInTz(TZ_OFFSET);

  const { data: rows, error } = await sb
    .from("user_data")
    .select("user_id, value")
    .eq("key", "finance:loans");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let sent = 0;

  for (const row of rows || []) {
    processed++;
    const loans = (Array.isArray(row.value) ? row.value : []) as Loan[];
    if (loans.length === 0) continue;

    const digest = buildDigest(loans, today, WINDOW_DAYS);
    if (!digest) continue;

    const pushRes = await sendPush(row.user_id, digest.title, digest.body);
    if (pushRes.ok) sent++;
  }

  return new Response(JSON.stringify({ processed, sent, today }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
