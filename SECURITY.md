# Seguridad — Finance-app

Auditoría y endurecimiento. Documento ágil: qué se encontró, qué se cambió, y qué falta hacer en consola.
Última revisión: 2026-06-09.

---

## 1. Resumen de hallazgos (alcance: Finance-app)

| Sev | Capa | Hallazgo | Estado |
|-----|------|----------|--------|
| 🟥 P0 | Edge Fn | `send-push` confiaba en `body.userId` sin auth → cualquiera mandaba push a cualquier usuario | ✅ Corregido (código) |
| 🟧 P1 | Edge Fn | `telegram-bot`: webhook sin validar origen + acción `notify` sin auth | ✅ Corregido (código) — requiere config en consola |
| 🟧 P1 | Frontend | Sin Content-Security-Policy ni security headers | ✅ Headers agregados; CSP en Report-Only |
| 🟧 P1 | Infra/RLS | La app depende 100% de RLS de Supabase; no verificable desde el repo | ⚠️ **Verificar** (checklist §4) |
| 🟨 P2 | Edge Fn | CORS `*` en todas las functions | ➖ Bajo riesgo (auth por bearer, no cookies); opcional acotar por origen |
| 🟨 P2 | Cliente | Datos financieros en `localStorage` (fallback sin Supabase) en claro | ➖ Aceptable; lock PIN/WebAuthn mitiga |

**Ya estaba bien:** `.env` en `.gitignore`; `npm audit` = 0 vulns; auth sin contraseñas propias (magic-link/Google); lock PBKDF2-SHA256 + WebAuthn; `mp-balance` y `daily-digest` ya protegidas con shared secret.

> ⚠️ **Fuera de este alcance pero P0:** hay una clave privada de Firebase Admin SDK suelta en disco
> (`Desktop/Proyectos/powergy-46c6b-firebase-adminsdk-*.json`). Rotarla en la consola de Firebase y
> quitarla del disco apenas puedas — da acceso total al proyecto `powergy`.

---

## 2. Cambios aplicados (código)

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/send-push/index.ts` | Auth obligatoria: SERVICE_ROLE (server) **o** JWT de usuario válido. Para usuarios se ignora `body.userId` y se usa el id del token. |
| `supabase/functions/telegram-bot/index.ts` | `notify` exige JWT/SERVICE_ROLE. Webhook exige header `X-Telegram-Bot-Api-Secret-Token` si `TELEGRAM_WEBHOOK_SECRET` está seteado (backward-compatible). |
| `vercel.json` + `public/_headers` | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `HSTS`, `Permissions-Policy`, `COOP`, y `Content-Security-Policy-Report-Only`. |

Ningún cambio rompe a los llamadores actuales (cliente y cron ya envían `Authorization`). Las Edge Functions **no afectan producción hasta redeploy**.

---

## 3. Checklist de consola (acción del owner) — por sensibilidad

**Ola 0 — hoy**
- [ ] **Firebase:** deshabilitar/rotar la service-account key expuesta; borrar el `.json` del disco.
- [ ] Redeploy `send-push`: `supabase functions deploy send-push` (ya valida auth en código).
- [ ] Confirmar que `send-push` y `daily-digest` **NO** sean invocables sin token (no son webhooks).

**Ola 1**
- [ ] Telegram: `supabase secrets set TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)`
- [ ] Re-registrar webhook con ese secret:
      `curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=<FN_URL>" -d "secret_token=<SECRET>"`
- [ ] Redeploy `telegram-bot --no-verify-jwt` (debe ser público para recibir el webhook; la auth la hace el secret-token + JWT en `notify`).
- [ ] Verificar RLS (§4).

**Ola 2**
- [ ] Tras observar reportes de CSP, pasar `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (enforce). Quitar `'unsafe-inline'` de `style-src` si se eliminan los estilos inline.
- [ ] (Opcional) Acotar CORS de las functions a tu dominio en vez de `*`.

---

## 4. Verificación de RLS en Supabase (crítico)

La seguridad de los datos depende de esto. En el SQL editor de Supabase confirmá:

```sql
-- 1) RLS activo en todas las tablas
select relname, relrowsecurity from pg_class
where relname in ('user_data','push_subscriptions');  -- ambas deben ser true

-- 2) Políticas: cada usuario solo ve/edita lo suyo
select tablename, policyname, cmd, qual from pg_policies
where tablename in ('user_data','push_subscriptions');
-- Deben filtrar por: auth.uid() = user_id  (en SELECT/INSERT/UPDATE/DELETE)
```

- [ ] `user_data`: RLS ON, política `auth.uid() = user_id` en las 4 operaciones.
- [ ] `push_subscriptions`: RLS ON, misma política.
- [ ] Storage bucket `loan-photos`: **privado** (no público); políticas que aten el path al `auth.uid()`.
- [ ] Auth → expiración de OTP corta, rate-limit activo, y **Redirect URLs** restringidas a tu dominio (no `*`).

---

## 5. Puertos y accesos

| Puerto | Servicio | Estado | Nota |
|--------|----------|--------|------|
| 5173 | Vite dev | solo desarrollo | No exponer nunca en prod |
| 443 | Supabase / hosting | gestionado (TLS) | OK; reforzado con headers §2 |
| — | Postgres | no expuesto (gestionado) | OK |

Finance-app no abre puertos propios en prod (SPA estática + Supabase BaaS). No hay superficie de puertos que cerrar más allá de no exponer el dev server.

---

## 6. Rendimiento (notas rápidas)

- ✅ Screens lazy-loaded; Recharts en chunk aparte (ya optimizado).
- ✅ `useDerived` memoiza en cascada; sincronización de storage con debounce.
- 🔎 A revisar en profundidad (pendiente): tamaño del bundle (`npm run build` + análisis), índice en `user_data(user_id, key)` para acelerar lecturas, y `daily-digest` que hace N+1 queries (1 por usuario) — batchear si crece la base.

---

## 7. Mantenimiento recomendado

- **CI:** correr `npm audit --audit-level=high` y `npx tsc --noEmit` en cada PR. Activar Dependabot.
- **Secretos:** rotación periódica (Telegram, VAPID, MP, CRON_SECRET); nunca en el repo (usar Supabase secrets / env del hosting). Auditar el disco por keys sueltas.
- **Repo:** nunca versionar `node_modules` ni `.env` (Finance-app ya OK).
- **Datos:** revisar RLS tras cada migración de schema. Backups periódicos (export JSON ya disponible).
- **Headers/CSP:** una vez en enforce, revisar reportes ante cada feature nueva que agregue un origen (analytics, fuentes, etc.).
- **Logs:** evitar loguear tokens o el body de errores upstream al cliente.
