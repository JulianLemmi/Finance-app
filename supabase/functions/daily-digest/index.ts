/**
 * daily-digest — corre 1×/día y envía push con los vencimientos del día.
 *
 * Para cada usuario que tenga datos en user_data:
 *   1. Lee sus préstamos
 *   2. Detecta los que vencen hoy (originales + renovaciones de atrasados)
 *   3. Si hay al menos uno, dispara send-push con el resumen
 *
 * Variables de entorno requeridas:
 *   CRON_SECRET                    — string aleatorio que el cron debe enviar en X-Cron-Secret
 *   SUPABASE_URL                   — automática
 *   SUPABASE_SERVICE_ROLE_KEY      — automática
 * Opcionales:
 *   DIGEST_TZ_OFFSET               — offset horario en horas (default -3 = Argentina)
 *
 * Deploy:
 *   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
 *   supabase functions deploy daily-digest --no-verify-jwt
 *
 * Ver README para el SQL del cron job.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Loan,
  getNextRenewalDate,
  remainingDebt,
  expectedProfit,
  todayISOInTz,
} from "../_shared/loanMath.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TZ_OFFSET = Number(Deno.env.get("DIGEST_TZ_OFFSET") ?? "-3");

type Settings = { currency?: string; userName?: string };

function money(n: number, currency: string): string {
  return `${currency}${Math.round(n).toLocaleString("es-AR")}`;
}

function buildDigest(loans: Loan[], settings: Settings, today: string) {
  const cur = settings.currency || "$";
  const items: { name: string; gain: number; renewal: boolean }[] = [];

  for (const l of loans) {
    if (l.status !== "active" && l.status !== "overdue") continue;
    if (!l.dueDate) continue;

    if (l.status === "active" && l.dueDate === today) {
      // Active loan reaching its original due date today.
      items.push({
        name: l.clientName ?? "Sin nombre",
        gain: expectedProfit(l),
        renewal: false,
      });
      continue;
    }
    if (l.status === "overdue") {
      const next = getNextRenewalDate(l, today);
      if (next === today) {
        // Overdue loan compounding today — gain is interest on current debt.
        const debt = remainingDebt(l, today);
        const gain = debt * (Number(l.interestRate ?? 0) / 100);
        items.push({
          name: l.clientName ?? "Sin nombre",
          gain,
          renewal: true,
        });
      }
    }
  }

  if (items.length === 0) return null;

  const totalGain = items.reduce((a, x) => a + x.gain, 0);
  const top = items.slice(0, 4).map((i) => `• ${i.name}${i.renewal ? " ↻" : ""}: ${money(i.gain, cur)}`);
  const more = items.length > 4 ? `\n+${items.length - 4} más` : "";
  const title = items.length === 1
    ? `Hoy vence ${items[0].name}`
    : `Hoy: ${items.length} vencimientos — ${money(totalGain, cur)}`;
  const body = `${top.join("\n")}${more}`;
  return { title, body, count: items.length, total: totalGain };
}

async function sendPush(userId: string, title: string, body: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ userId, title, body, url: "/", tag: "daily-digest" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.warn(`send-push fail for ${userId}: ${res.status} ${txt}`);
    return false;
  }
  return true;
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

    const { data: sRow } = await sb
      .from("user_data")
      .select("value")
      .eq("user_id", row.user_id)
      .eq("key", "finance:settings")
      .maybeSingle();
    const settings = (sRow?.value || {}) as Settings;

    const digest = buildDigest(loans, settings, today);
    if (!digest) continue;

    const ok = await sendPush(row.user_id, digest.title, digest.body);
    if (ok) sent++;
  }

  return new Response(JSON.stringify({ processed, sent, today }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
