/**
 * Telegram Bot — webhook + notificaciones
 *
 * Variables de entorno requeridas (Supabase secrets):
 *   TELEGRAM_BOT_TOKEN  — token del bot (@BotFather)
 *   SUPABASE_URL        — automática en Edge Functions
 *   SUPABASE_SERVICE_ROLE_KEY — automática en Edge Functions
 *
 * Comandos disponibles:
 *   /start | /ayuda       — muestra ayuda
 *   /chatid               — devuelve el chat ID del usuario
 *   /resumen              — capital, préstamos activos, ganancias
 *   /vencimientos         — próximos 7 días
 *   /gasto [monto] [desc] — registra gasto rápido
 *   /ingreso [monto] [desc] — registra ingreso rápido
 *
 * Endpoint adicional para notificaciones desde la app:
 *   POST /telegram-bot   body: { action: "notify", chatId, message }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Secret que Telegram reenvía en cada update (setWebhook secret_token). Si está
// configurado, exigimos que coincida → evita que falsifiquen updates al webhook.
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Telegram helpers ────────────────────────────────────────────────────────

async function sendMessage(chatId: number | string, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function getKey(userId: string, key: string): Promise<unknown> {
  const { data } = await sb()
    .from("user_data")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

async function setKey(userId: string, key: string, value: unknown) {
  await sb().from("user_data").upsert(
    { user_id: userId, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
}

async function findUserByChatId(chatId: number | string): Promise<string | null> {
  const { data } = await sb()
    .from("user_data")
    .select("user_id, value")
    .eq("key", "finance:settings");
  if (!data) return null;
  for (const row of data) {
    const s = row.value as Record<string, unknown>;
    if (String(s?.telegramChatId) === String(chatId)) return row.user_id;
  }
  return null;
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cur(settings: Record<string, unknown>) {
  return String(settings?.currency ?? "$");
}

function money(n: number, currency: string) {
  return `${currency}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

async function cmdResumen(chatId: number | string, userId: string) {
  const [loans, settings] = await Promise.all([
    getKey(userId, "finance:loans"),
    getKey(userId, "finance:settings"),
  ]);
  const s = (settings ?? {}) as Record<string, unknown>;
  const ls = (Array.isArray(loans) ? loans : []) as Array<Record<string, unknown>>;
  const c = cur(s);

  const active = ls.filter((l) => l.status === "active" || l.status === "overdue");
  const overdue = ls.filter((l) => l.status === "overdue");
  const capitalInvested = active.reduce((a, l) => a + Number(l.amount ?? 0), 0);
  const expectedProfit = active.reduce(
    (a, l) => a + Number(l.amount ?? 0) * (Number(l.interestRate ?? 0) / 100),
    0,
  );
  const cash = Number(s.cashOnHand ?? 0);

  await sendMessage(
    chatId,
    `<b>Resumen financiero</b>\n\n` +
      `💰 Capital invertido: <b>${money(capitalInvested, c)}</b>\n` +
      `💵 Efectivo disponible: <b>${money(cash, c)}</b>\n` +
      `📈 Ganancia esperada: <b>${money(expectedProfit, c)}</b>\n` +
      `📊 Préstamos activos: <b>${active.length}</b>\n` +
      `⚠️ Atrasados: <b>${overdue.length}</b>`,
  );
}

async function cmdVencimientos(chatId: number | string, userId: string) {
  const [loans, settings] = await Promise.all([
    getKey(userId, "finance:loans"),
    getKey(userId, "finance:settings"),
  ]);
  const s = (settings ?? {}) as Record<string, unknown>;
  const ls = (Array.isArray(loans) ? loans : []) as Array<Record<string, unknown>>;
  const c = cur(s);
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const upcoming = ls
    .filter((l) => (l.status === "active" || l.status === "overdue") && l.dueDate)
    .filter((l) => String(l.dueDate) <= in7)
    .sort((a, b) => (String(a.dueDate) < String(b.dueDate) ? -1 : 1))
    .slice(0, 10);

  if (!upcoming.length) {
    await sendMessage(chatId, "✅ No hay vencimientos en los próximos 7 días.");
    return;
  }

  const lines = upcoming.map((l) => {
    const isOverdue = String(l.dueDate) < today;
    const paid = ((l.payments ?? []) as Array<{ amount: unknown }>).reduce(
      (s, p) => s + Number(p.amount ?? 0),
      0,
    );
    const remaining = Math.max(
      0,
      Number(l.amount ?? 0) * (1 + Number(l.interestRate ?? 0) / 100) - paid,
    );
    const emoji = isOverdue ? "🔴" : String(l.dueDate) === today ? "🟡" : "🟢";
    return (
      `${emoji} <b>${l.clientName}</b> — ${money(remaining, c)}\n` +
      `    ${isOverdue ? "Vencido" : "Vence"}: ${l.dueDate}`
    );
  });

  await sendMessage(chatId, `<b>Próximos vencimientos</b>\n\n${lines.join("\n\n")}`);
}

async function cmdGasto(
  chatId: number | string,
  userId: string,
  args: string[],
) {
  if (args.length < 2) {
    await sendMessage(chatId, "Uso: /gasto [monto] [descripción]\nEjemplo: /gasto 5000 combustible");
    return;
  }
  const amount = Number(args[0].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    await sendMessage(chatId, "❌ Monto inválido. Ejemplo: /gasto 5000 combustible");
    return;
  }
  const description = args.slice(1).join(" ");
  const [expenses, settings] = await Promise.all([
    getKey(userId, "finance:expenses"),
    getKey(userId, "finance:settings"),
  ]);
  const s = (settings ?? {}) as Record<string, unknown>;
  const c = cur(s);
  const list = (Array.isArray(expenses) ? expenses : []) as Array<unknown>;
  const newItem = {
    id: `etg_${Date.now()}`,
    type: "expense",
    amount,
    category: "otros",
    description,
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  list.unshift(newItem);
  await setKey(userId, "finance:expenses", list.slice(0, 500));
  await sendMessage(
    chatId,
    `✅ Gasto registrado\n<b>${description}</b> — ${money(amount, c)}`,
  );
}

async function cmdIngreso(
  chatId: number | string,
  userId: string,
  args: string[],
) {
  if (args.length < 2) {
    await sendMessage(chatId, "Uso: /ingreso [monto] [descripción]\nEjemplo: /ingreso 10000 pago cuota");
    return;
  }
  const amount = Number(args[0].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    await sendMessage(chatId, "❌ Monto inválido. Ejemplo: /ingreso 10000 cobré cuota");
    return;
  }
  const description = args.slice(1).join(" ");
  const [income, settings] = await Promise.all([
    getKey(userId, "finance:income"),
    getKey(userId, "finance:settings"),
  ]);
  const s = (settings ?? {}) as Record<string, unknown>;
  const c = cur(s);
  const list = (Array.isArray(income) ? income : []) as Array<unknown>;
  const newItem = {
    id: `itg_${Date.now()}`,
    type: "income",
    amount,
    category: "otros",
    description,
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  list.unshift(newItem);
  await setKey(userId, "finance:income", list.slice(0, 500));
  await sendMessage(
    chatId,
    `✅ Ingreso registrado\n<b>${description}</b> — ${money(amount, c)}`,
  );
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // ── Notify action from the app ───────────────────────────────────────────
  if (body.action === "notify") {
    // Requiere JWT de usuario válido (o SERVICE_ROLE). El cliente lo adjunta via
    // functions.invoke; sin token válido cualquiera podría spamear vía el bot.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token !== SERVICE_KEY) {
      const { data: { user }, error: authErr } = await sb().auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const { chatId, message } = body as { chatId: string; message: string };
    if (!chatId || !message) {
      return new Response(JSON.stringify({ error: "Missing chatId or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await sendMessage(chatId, message);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Telegram webhook update ──────────────────────────────────────────────
  // Si hay secret configurado, exigimos el header que Telegram envía en cada
  // update (registrado con setWebhook secret_token). Sin esto, cualquiera podría
  // POSTear updates falsos (registrar gastos/ingresos o leer /resumen ajeno).
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (got !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
  }

  const msg = (body as { message?: Record<string, unknown> }).message;
  if (!msg) return new Response("OK");

  const chatId = (msg.chat as { id: number })?.id;
  const text = String((msg.text ?? "")).trim();

  if (!text.startsWith("/")) return new Response("OK");

  const [rawCmd, ...args] = text.split(/\s+/);
  // Strip @BotUsername suffix from command if present
  const cmd = rawCmd.split("@")[0].toLowerCase();

  if (cmd === "/start" || cmd === "/ayuda") {
    await sendMessage(
      chatId,
      `<b>Finance App Bot</b>\n\n` +
        `Comandos disponibles:\n\n` +
        `/resumen — Capital, préstamos y ganancias\n` +
        `/vencimientos — Próximos 7 días\n` +
        `/gasto [monto] [desc] — Registrar gasto\n` +
        `/ingreso [monto] [desc] — Registrar ingreso\n` +
        `/chatid — Tu Chat ID\n\n` +
        `Para vincular tu cuenta:\n` +
        `1. Enviá <code>/chatid</code>\n` +
        `2. Copiá el número\n` +
        `3. Pegalo en Finance App → Perfil → Telegram`,
    );
    return new Response("OK");
  }

  if (cmd === "/chatid") {
    await sendMessage(
      chatId,
      `Tu Chat ID es: <code>${chatId}</code>\n\nCopialo y pegalo en Finance App → Perfil → Telegram.`,
    );
    return new Response("OK");
  }

  const userId = await findUserByChatId(chatId);

  if (!userId) {
    await sendMessage(
      chatId,
      `⚠️ Tu Telegram no está vinculado a ninguna cuenta.\n\nEnviá /chatid para obtener tu ID y configurarlo en Finance App → Perfil → Telegram.`,
    );
    return new Response("OK");
  }

  if (cmd === "/resumen") { await cmdResumen(chatId, userId); return new Response("OK"); }
  if (cmd === "/vencimientos") { await cmdVencimientos(chatId, userId); return new Response("OK"); }
  if (cmd === "/gasto") { await cmdGasto(chatId, userId, args); return new Response("OK"); }
  if (cmd === "/ingreso") { await cmdIngreso(chatId, userId, args); return new Response("OK"); }

  await sendMessage(chatId, "Comando desconocido. Enviá /ayuda para ver las opciones.");
  return new Response("OK");
});
