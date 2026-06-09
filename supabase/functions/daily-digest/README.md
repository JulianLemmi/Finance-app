# daily-digest

Envía 1 push por día a cada usuario con sus **próximos vencimientos** (próximos
`DIGEST_WINDOW_DAYS` días, default 7), con nombre del cliente y fecha.

## 1. Secrets y deploy

```bash
# Secret compartido que el cron debe mandar en X-Cron-Secret
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)

# (opcional) ventana de días y huso
supabase secrets set DIGEST_WINDOW_DAYS=7
supabase secrets set DIGEST_TZ_OFFSET=-3

# La función es server-to-server: NO debe verificar JWT en el gateway
supabase functions deploy daily-digest --no-verify-jwt
```

> Requiere también que `send-push` esté desplegada y con las claves VAPID seteadas
> (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

## 2. Cron diario a las 9 AM (hora Argentina)

9 AM ART (UTC-3) = **12:00 UTC**. En el SQL editor de Supabase:

```sql
-- Extensiones (una sola vez): Dashboard → Database → Extensions → habilitar pg_cron y pg_net
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Programar el disparo diario 09:00 ART
select cron.schedule(
  'daily-digest-9am',
  '0 12 * * *',                       -- 12:00 UTC = 09:00 ART
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', '<CRON_SECRET>'   -- el mismo valor que el secret
               ),
    body    := '{}'::jsonb
  );
  $$
);
```

Reemplazá `<PROJECT_REF>` y `<CRON_SECRET>`.

### Verificar / administrar
```sql
select * from cron.job;                          -- ver jobs programados
select * from cron.job_run_details order by start_time desc limit 10;  -- últimas corridas
-- probar a mano (debería devolver { processed, sent, today }):
select net.http_post(
  url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-digest',
  headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret','<CRON_SECRET>'),
  body := '{}'::jsonb
);
-- borrar el job:
select cron.unschedule('daily-digest-9am');
```

## 3. Que llegue al celular

Las suscripciones push son **por dispositivo/navegador**. Para recibir en el celular:
1. Abrí la app en el celular y (en iOS **obligatorio**) instalala: *Compartir → Agregar a inicio*.
   iOS necesita 16.4+ y la PWA instalada; en Safari/tab normal el push no funciona.
2. Entrá a **Perfil → Notificaciones** y activalas **desde el celular** (crea su propia suscripción).
3. Probá con el botón de notificación de prueba: si llega, el cron diario también llegará.
