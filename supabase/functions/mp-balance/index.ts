/**
 * mp-balance — proxy del endpoint /v1/account/balance de Mercado Pago.
 *
 * NOTA: actualmente el frontend no llama esta función (el saldo se
 * ingresa manualmente desde Perfil). La dejamos disponible por si se
 * vuelve a integrar, pero protegida con un shared secret para evitar
 * que cualquiera con la URL pueda leer tu saldo.
 *
 * Variables de entorno:
 *   MP_ACCESS_TOKEN       — token de Mercado Pago (requerido)
 *   MP_FUNCTION_SECRET    — shared secret, requerido en header X-Function-Secret
 *
 * Si querés DESHABILITARLA del todo:
 *   supabase functions delete mp-balance --project-ref <ref>
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-function-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SECRET = Deno.env.get("MP_FUNCTION_SECRET");
  const got = req.headers.get("X-Function-Secret") ?? req.headers.get("x-function-secret");
  if (!SECRET || got !== SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  if (!MP_TOKEN) {
    return json({ error: "Token no configurado" }, 500);
  }

  try {
    const res = await fetch("https://api.mercadopago.com/v1/account/balance", {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    const data = await res.json().catch(() => ({ error: "MP response invalid" }));
    return json(data, res.status);
  } catch (err) {
    console.warn("mp-balance fetch error", err);
    return json({ error: "Network error reaching Mercado Pago" }, 502);
  }
});
