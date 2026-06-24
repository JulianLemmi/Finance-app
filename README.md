# Finance App

Panel financiero personal para administrar préstamos, clientes, gastos, ingresos y activos. PWA instalable con sincronización vía Supabase y bot de Telegram opcional.

## Stack

- **Frontend:** React 19 + Vite 8 + Tailwind 4
- **Charts:** Recharts
- **Backend:** Supabase (auth OTP + key-value en `user_data` + storage bucket `loan-photos`)
- **Funciones serverless:** Deno edge functions (Telegram bot + saldo Mercado Pago)
- **PWA:** `vite-plugin-pwa` con autoUpdate y runtime caching

## Setup

### 1. Dependencias

```bash
npm install
```

### 2. Variables de entorno

Copiá `.env.example` a `.env` y completá:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```

Sin estas variables la app arranca en modo "setup" y guarda todo en `localStorage` (sin sincronización).

### 3. Schema Supabase

Necesitás una tabla `user_data` (key-value por usuario) y un bucket de storage:

```sql
create table user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- RLS: cada user solo accede a sus rows
alter table user_data enable row level security;
create policy "own rows" on user_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Bucket: crear `loan-photos` en Supabase Storage (público).

### 4. Auth

La app usa magic-link por email (`signInWithOtp`). Habilitá email auth en Supabase → Authentication → Providers.

### 5. Run

```bash
npm run dev      # dev server en http://localhost:5173
npm run build    # build producción
npm run preview  # preview del build
npm run lint     # eslint
```

## Edge functions opcionales

### Telegram bot

`supabase/functions/telegram-bot/index.ts` — webhook + helper de notificaciones. Comandos: `/resumen`, `/vencimientos`, `/gasto`, `/ingreso`, `/chatid`.

Setup:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=...
supabase functions deploy telegram-bot --no-verify-jwt
# Configurar webhook
curl "https://api.telegram.org/bot$TG_TOKEN/setWebhook?url=https://<project>.functions.supabase.co/telegram-bot"
```

### Mercado Pago balance

`supabase/functions/mp-balance/index.ts` — proxy al endpoint `users/me` de MP para evitar CORS.

```bash
supabase functions deploy mp-balance --no-verify-jwt
```

### Web push notifications

`supabase/functions/send-push/index.ts` envía notificaciones web push al user. Setup:

1. **Generar claves VAPID:**
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Pegar la public key en `.env`:**
   ```env
   VITE_VAPID_PUBLIC_KEY=BPx...
   ```
3. **Configurar secrets en Supabase:**
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=BPx...
   supabase secrets set VAPID_PRIVATE_KEY=...
   supabase secrets set VAPID_SUBJECT=mailto:tu@email.com
   ```
4. **Crear tabla:**
   ```sql
   create table push_subscriptions (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users(id) on delete cascade,
     endpoint text not null,
     p256dh text not null,
     auth text not null,
     user_agent text,
     created_at timestamptz default now(),
     unique(user_id, endpoint)
   );
   alter table push_subscriptions enable row level security;
   create policy "own subs" on push_subscriptions
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
5. **Desplegar la función:**
   ```bash
   supabase functions deploy send-push
   ```
6. En la app: Perfil → Notificaciones push → Activar. Probar con el botón "Probar".

Para enviar desde otra edge function (por ejemplo el cron de vencimientos):
```ts
await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
  body: JSON.stringify({ userId, title: "Vencimiento hoy", body: "Mario Esteban — US$7.420", url: "/" }),
});
```

### Daily digest (cron)

`supabase/functions/daily-digest/index.ts` corre 1×/día, calcula los vencimientos del día por usuario (originales + renovaciones de atrasados) y dispara `send-push` con el resumen.

1. **Generar un secret aleatorio y configurarlo:**
   ```bash
   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   # En PowerShell:
   # supabase secrets set CRON_SECRET=$(-join ((48..57)+(97..122) | Get-Random -Count 64 | % {[char]$_}))
   ```
   Anotá el valor — lo vas a necesitar para el SQL del cron.

2. **Desplegar la función:**
   ```bash
   supabase functions deploy daily-digest --no-verify-jwt
   ```

3. **Habilitar las extensiones de cron y HTTP en Supabase:**

   Dashboard → Database → Extensions → buscar y activar:
   - `pg_cron`
   - `pg_net`

4. **Programar el cron** (Dashboard → SQL Editor):
   ```sql
   select cron.schedule(
     'finance-daily-digest',
     '0 12 * * *',  -- 12:00 UTC = 09:00 Argentina
     $$
     select net.http_post(
       url := 'https://lolbedlxkcclkjwuhfma.functions.supabase.co/daily-digest',
       headers := jsonb_build_object(
         'X-Cron-Secret', 'PEGA_AQUI_TU_CRON_SECRET',
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   Reemplazá `PEGA_AQUI_TU_CRON_SECRET` con el valor del paso 1.

5. **Verificar / disparar manualmente:**
   ```bash
   curl -X POST \
     -H "X-Cron-Secret: TU_CRON_SECRET" \
     https://lolbedlxkcclkjwuhfma.functions.supabase.co/daily-digest
   ```
   Respuesta esperada: `{"processed": N, "sent": M}`.

6. **Para listar / borrar el cron:**
   ```sql
   select * from cron.job;
   select cron.unschedule('finance-daily-digest');
   ```

### Alertas de dólar (cron)

`supabase/functions/dollar-watch/index.ts` vigila el dólar blue (bluelytics) y manda push. Dos modos: `watch` (avisa cuando el blue venta se movió más que el umbral del usuario desde el último aviso) y `summary` (un resumen diario al cierre con la variación del día). Opt-in por usuario desde Perfil → Notificaciones push → "Alertas de dólar".

1. **Crear la tabla de estado global** (Dashboard → SQL Editor):
   ```sql
   create table app_kv (
     key text primary key,
     value jsonb,
     updated_at timestamptz default now()
   );
   alter table app_kv enable row level security;  -- sin policies: sólo el service role (edge functions) la toca
   ```

2. **Desplegar la función** (reutiliza `CRON_SECRET` del daily-digest):
   ```bash
   supabase functions deploy dollar-watch --no-verify-jwt
   ```

3. **Programar los crons** (Dashboard → SQL Editor). Reemplazá `PEGA_AQUI_TU_CRON_SECRET` y el `<project>`:
   ```sql
   -- watch: cada 30 min de 10 a 18 hs ART (13–21 UTC), lun a vie
   select cron.schedule(
     'finance-dollar-watch',
     '*/30 13-21 * * 1-5',
     $$
     select net.http_post(
       url := 'https://<project>.functions.supabase.co/dollar-watch?mode=watch',
       headers := jsonb_build_object('X-Cron-Secret', 'PEGA_AQUI_TU_CRON_SECRET', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     );
     $$
   );

   -- summary: 18:05 ART (21:05 UTC), lun a vie
   select cron.schedule(
     'finance-dollar-summary',
     '5 21 * * 1-5',
     $$
     select net.http_post(
       url := 'https://<project>.functions.supabase.co/dollar-watch?mode=summary',
       headers := jsonb_build_object('X-Cron-Secret', 'PEGA_AQUI_TU_CRON_SECRET', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     );
     $$
   );
   ```

4. **Probar manualmente:**
   ```bash
   curl -X POST -H "X-Cron-Secret: TU_CRON_SECRET" "https://<project>.functions.supabase.co/dollar-watch?mode=watch"
   ```
   Respuesta esperada: `{"mode":"watch","sell":N,"users":N,"sent":M,...}`. El primer run sólo fija la base (no manda nada).

## Estructura

```
src/
  App.jsx, FinanceApp.jsx, main.jsx
  components/        UI compartida (BottomTabBar, GlobalSearch, LockScreen, etc.)
  components/ui/     Primitives (button, card, sheet, form, …)
  screens/           Tabs (Home, Loans, Clients, Finance, Profile)
  features/          Sheets de detalle (loans/clients/assets)
  lib/               calcs, storage, utils, backup, lock, telegram, hooks, constants
  store/             reducer + useDerived
  sheets/            TransactionSheet
scripts/
  gen-icons.mjs      Generador de iconos PWA
supabase/functions/  Edge functions Deno
```

## Features clave

- **Préstamos:** alta/edit/extender/refinanciar/pagar; estados active/overdue/paid/refinanced
- **Clientes:** ficha + histórico
- **Gastos/ingresos:** transacciones simples categorizadas
- **Activos:** registro de bienes (valor manual)
- **Mapa de vencimientos:** heatmap 30d con ganancia por día y long-press para ver cliente
- **Dólar blue:** cotización vía bluelytics.com.ar (cache 5min)
- **Saldo MP:** entrada manual o vía edge function
- **PWA + lock:** instalable, PIN/huella en standalone mode
- **Backup:** export/import JSON versionado

## Convenciones de datos

Cada préstamo en `state.loans`:

```ts
{
  id, clientId, clientName, alias?,
  amount, interestRate, // % por ciclo
  startDate, dueDate,   // ISO YYYY-MM-DD
  paymentType,          // "15" | "30" | "custom"
  customDays?,
  status,               // "active" | "overdue" | "paid" | "refinanced"
  guarantyType,         // "vehicle" | "other" | …
  payments: [{ id, amount, date, … }],
  photos?, notes?, refinancedFromId?,
}
```

Los campos derivados (`_status`, `_remaining`, `_profit`, `_progress`, `_daysUntilDue`) se calculan en `useDerived` y nunca se persisten.
