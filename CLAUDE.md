# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Finance-app

App mobile-first en español para gestión personal de préstamos, clientes, gastos, ingresos y activos. UI dark theme con tab bar inferior.

## Stack
- React 19 + Vite 8
- Tailwind CSS 4 (vía `@tailwindcss/vite`, sin `tailwind.config.js`)
- Supabase (`@supabase/supabase-js`) — auth + key-value storage + storage bucket de fotos
- Recharts (gráficos), lucide-react (iconos)
- ESLint 10 (flat config)
- Vitest + @testing-library/react (jsdom) — tests de las fórmulas financieras
- **TypeScript strict** — migración completa; toda la codebase es `.ts`/`.tsx` excepto `constants.js`

## Scripts
```bash
npm run dev        # Vite dev server — http://localhost:5173
npm run build      # build de producción a dist/
npm run lint       # ESLint
npm test           # tests (vitest run)
npm run test:watch # tests en watch mientras desarrollás
npm run preview    # preview del build
npx tsc --noEmit   # chequeo de tipos sin emitir (pasa limpio)
```

Edge functions (Deno, requiere Supabase CLI):
```bash
supabase functions deploy <nombre> --no-verify-jwt
supabase secrets set KEY=value
```

## Setup
Copiar `.env.example` a `.env` y completar:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_VAPID_PUBLIC_KEY=BPx...   # opcional, para push notifications
```
Sin `.env` la app muestra `SetupScreen`. El check vive en `src/lib/storage.ts:SUPABASE_READY`.

## Arquitectura

### Estado global
`useReducer` + `Context` (sin Redux/Zustand). Definido en `src/store/index.ts`:
- `initialState: AppState`
- `reducer(state: AppState, action: AppAction): AppState` — union discriminada completamente tipada
- `AppContext` / `useApp(): AppContextValue` — expone `{ state, dispatch, derived, userEmail, signOut, userId, setSearchOpen }`
- `useDerived(state): Derived` — 5 etapas de memoización: loans resolved → grupos → financials → chart → client stats

**Todos los tipos** viven en `src/types.ts`: `Loan`, `Client`, `Transaction`, `Asset`, `Car`, `PrepCost`, `Photo`, `Settings`, `AppState`, `AppAction`, `Derived`, `AppContextValue`, etc.

### Persistencia
Tres backends en cascada (`src/lib/storage.ts`):
1. **Supabase** si `SUPABASE_READY`: tabla `user_data(user_id, key, value)`. Fotos en bucket `loan-photos`.
2. **`window.storage`** si existe (wrapper PWA/Electron).
3. **`localStorage`** como fallback final — dispara `finance:storage-quota-exceeded` si se llena.

Claves centralizadas en `src/lib/constants.js:STORAGE_KEYS`. Sync debounced vía `useStorageSync` (`src/lib/hooks.ts`).

Schema Supabase (no hay migraciones en el repo — crear a mano; SQL completo en `README.md`):
- `user_data(user_id, key, value jsonb)` — key-value por usuario, PK compuesta, RLS `auth.uid() = user_id`.
- `push_subscriptions(user_id, endpoint, p256dh, auth, ...)` — suscripciones web push.
- Bucket de storage `loan-photos`.

### Auth
Gate en `src/FinanceApp.tsx`: `SetupScreen` (sin `.env`) → `LoginScreen` → `AuthedApp`. Dos métodos en `LoginScreen`: Google OAuth (`signInWithOAuth`) y magic-link por email (`signInWithOtp`).

### Routing
No usa react-router. Navegación por `ui.activeTab` en el reducer, renderizado por `BottomTabBar`. Pantallas lazy-loaded para code-splitting (Recharts pesa):
- `HomeScreen`, `LoansScreen`, `ClientsScreen`, `CarsScreen`, `FinanceScreen`, `ProfileScreen`

### Estructura de carpetas
```
src/
├── types.ts                  # todos los tipos de dominio
├── FinanceApp.tsx             # root: auth gate (SetupScreen → LoginScreen → AuthedApp)
├── main.tsx                  # entry point
├── components/
│   ├── ui/                   # primitivos tipados: badge, button, card, chart, delta, form, sheet
│   ├── ui.tsx                # barrel re-export de ui/
│   ├── BottomTabBar.tsx
│   ├── DolarBlue.tsx         # widget cotización dólar (bluelytics API)
│   ├── DollarRain.tsx        # animación canvas de fondo (solo tema oscuro)
│   ├── ErrorBoundary.tsx     # class component, captura errores por tab
│   ├── GlobalSearch.tsx      # overlay Cmd+K, busca loans/clientes/movimientos
│   ├── GlobalStyles.tsx      # CSS global + tema claro via .theme-light
│   ├── LockScreen.tsx        # PIN/biométrico (WebAuthn)
│   ├── ModalRoot.tsx         # monta el sheet activo según state.ui.modal
│   ├── NetworkStatus.tsx     # pill offline/online con estado transitorio
│   ├── PortfolioAnalytics.tsx # cobrabilidad, heatmap 30 días, cash flow
│   └── WelcomeSplash.tsx     # splash 2.8 s al iniciar
├── screens/                  # una por tab, lazy-loaded
├── features/
│   ├── assets/AssetSheet.tsx
│   ├── cars/CarFormSheet.tsx
│   ├── clients/ClientFormSheet.tsx + ClientDetailSheet.tsx
│   └── loans/                # LoanFormSheet, LoanDetailSheet, PaymentSheet,
│                             # LoanTimeline, PaymentHistory, LoanChain, PhotoGallery
├── sheets/TransactionSheet.tsx
├── lib/
│   ├── calcs.ts              # cálculos financieros (resolveStatus, remainingDebt, etc.)
│   ├── utils.ts              # uid, fechas ISO, formatMoney, daysBetween
│   ├── storage.ts            # tiered storage (Supabase / window.storage / localStorage)
│   ├── hooks.ts              # useStorageSync
│   ├── backup.ts             # downloadBackup, readBackupFile (con migraciones)
│   ├── lock.ts               # PIN PBKDF2-SHA256 v2 + WebAuthn biométrico
│   ├── push.ts               # Web Push VAPID, subscribe/unsubscribe/test
│   ├── telegram.ts           # sendTelegramNotification via edge function
│   └── constants.js          # STORAGE_KEYS, LOAN_STATUSES, EXPENSE_CATEGORIES, etc.
└── store/index.ts            # reducer + AppContext + useDerived
```

### Tests (`npm test`)
Cuatro suites, ~293 tests, corren en ~3 s:
- `src/lib/calcs.test.ts` — fórmulas puras: fechas de ciclo, mora, devengado, proyección, validación.
- `src/store/useDerived.test.tsx` — los agregados que alimentan gráficos y cards (renderiza el hook con `renderHook`).
- `src/lib/notificaciones.test.ts` — paridad frontend ↔ edge function y armado del digest de push.
- `src/lib/useLongPress.test.tsx` — el gesto de archivar, sobre todo que no se dispare al scrollear.

**Correr `npm test` después de tocar cualquier fórmula de `calcs.ts`, `utils.ts` o `useDerived`.** Todo lo que afirman es plata que el usuario ve: ante una falla, la sospecha default es la fórmula, no el test.

Tres cosas que la suite cuida especialmente:
- **El reloj está congelado** (`vi.setSystemTime`) y la zona fijada a Argentina en `vitest.config.ts`. Sin eso los tests pasarían o fallarían según el día y la máquina. Ojo: el cuerpo de un `describe` corre **antes** que `beforeAll`, así que todo lo que dependa de "hoy" tiene que calcularse dentro de un `it` o un `beforeAll`.
- **Un gráfico y la card de al lado tienen que dar el mismo número** (ej. `months[último].capitalInvested === capitalInvested`). Varios bugs históricos fueron exactamente esa divergencia.
- **La notificación y la pantalla tienen que decir la misma fecha.** Ver la nota sobre `loanMath.ts` más abajo.

### Fechas: nunca usar `toISOString()` para armar un YYYY-MM-DD
Convierte a UTC y devuelve otro día según la zona y la hora. Usar `toISODate(date)` de `utils.ts`, que formatea en hora **local**. Con `toISOString()`, en Argentina `todayISO()` ya era "mañana" a partir de las 21:00 (y quedaba en desacuerdo con `todayDate()`), y en zonas UTC+ `addDays(d, 1)` ni siquiera avanzaba el día.

### Cálculos de negocio
`src/lib/calcs.ts`: `resolveStatus`, `paidAmount`, `remainingDebt`, `loanProgress`, `expectedProfit`, `expectedReturn`, `compoundReturn`, `daysUntilDue`, `loanIntegrityErrors`, `validateLoan`, `calcProjection`. Reglas duras en `BUSINESS_RULES` (constants.js).

**Fechas de ciclo** (`src/lib/utils.ts`) — usar SIEMPRE estos helpers, nunca aritmética de días a mano:
- `loanPeriodDate(loan, anchor, n)` — fecha del período n. En `paymentType: "30"` avanza por **meses calendario** (vence siempre el mismo día del mes, con clamp a fin de mes vía `addCalendarMonths`); en "15"/"custom" suma días fijos.
- `loanElapsedPeriods(loan, anchor, asOf)` — períodos completos transcurridos (inverso de `loanPeriodDate`). Define cuántos ciclos de mora se cobraron, así que afecta plata, no sólo la fecha mostrada.
- `getNextRenewalDate(loan)` / `getLoanCycleDays(loan)`.

Un préstamo pasa a `overdue` **el mismo día de su vencimiento** (`isOverdue` compara con `<=`), no al día siguiente. Ojo al escribir etiquetas: chequear `_daysUntilDue === 0` ("Vence hoy") antes que el estado, o sale "Atrasado 0d".

La **deuda cobra el interés del ciclo por adelantado** (al prestar $100k al 10% ya se deben $110k) mientras que el **devengado** (`interestAccruals`) lo reconoce al cerrar cada período. Ese desfasaje de un ciclo es intencional y consistente en todos los tipos de préstamo — no es un bug.

Modelo de devengado/proyección para los gráficos (mismo archivo):
- `remainingDebtAt(loan, asOf)` — deuda (principal + interés capitalizado por vencimientos/re-vencimientos) a una fecha dada. Con `asOf = hoy` coincide con `remainingDebt`.
- `loanCapitalAt(loan, asOf)` — capital desplegado a una fecha, con la misma clasificación que `capitalInvested` (vencidos: deuda completa; activos: principal acotado). Alimenta la curva "Evolución del capital".
- `interestAccruals(loan)` — eventos de interés devengado por vencimiento, lo paguen o no (hasta hoy o el cierre). Base del ROI histórico y del gráfico "Mes actual" (`months[].accrued`). Si el préstamo se canceló **antes** de su vencimiento, el interés contratado se devenga en la fecha de cierre (si no, la ganancia de los pagos anticipados desaparecía del ROI).
- `upcomingInterest(loan, until)` — interés a cobrar entre hoy y `until`; proyecta el crecimiento del capital (usado en la proyección "En 30d" de la card de capital).

Todo agregado global se prorratea por `myShare(loan)` (préstamos compartidos). Los campos `_*` de `ResolvedLoan` quedan **brutos** para la UI del detalle; el share se aplica en `useDerived`, en `calcProjection` y en cualquier importe de ganancia que se muestre por préstamo.

### Sueldo fijo virtual (`settings.fixedIncomeAmount` / `fixedIncomeDay`)
Ingreso fijo mensual **virtual**: helpers `salaryForMonth` / `totalSalary` en `store/index.ts`. Se suma al ingreso de cada mes (desde la primera actividad registrada, sólo si la fecha de cobro ya pasó) y por eso aparece en: `months[].income` (gráfico "Mes actual", balance/ahorro mensual), `totalIncome` (cards Ingresos/Balance de Finanzas) y `fixedIncomeThisMonth` (sumado a "Ganancia mensual" del inicio). **No** crea transacción (`state.income`), **no** afecta `cashOnHand`/capital, y **no** entra en las métricas de interés de préstamos (`nextProfitTotal` "Ganancia por cobrar", ROI).

### Pasivos (`state.liabilities`)
Deudas propias (ej: plata que le debo a mi papá) con sus pagos. Se cargan en Finanzas → Pasivos. Sólo **restan de `totalCapital`** (y de la curva "Evolución del capital"); no tocan el flujo de ingresos/gastos. Como el capital puede quedar negativo, los gráficos que lo muestran no pueden fijar el piso del eje en 0.

### Archivado de préstamos (`loan.archived`)
Manteniendo apretada una card en Préstamos se archiva/restaura (ver `useLongPress` en `lib/hooks.ts`, funciona con mouse y touch). Sólo **oculta del listado** — el préstamo sigue contando en todas las métricas de Inicio/Finanzas. Si un overlay de feedback tapa el elemento durante el gesto, necesita `pointer-events-none` o cancela el propio long-press.

### Edge functions (`supabase/functions/` — Deno)
- `telegram-bot` — webhook + comandos `/resumen /vencimientos /gasto /ingreso /chatid`
- `mp-balance` — proxy CORS para Mercado Pago
- `send-push` — notificaciones web push via VAPID
- `daily-digest` — cron (pg_cron) que llama `send-push` con vencimientos del día
- `dollar-watch` — cron que vigila el dólar blue (bluelytics) y manda push por umbral (`?mode=watch`) o resumen diario (`?mode=summary`). Estado global en tabla `app_kv`; opt-in vía `settings.dollarAlerts`/`dollarThreshold`. SQL/cron en README.

## Convenciones
- UI en español (textos visibles al usuario). Código en inglés o español, indistinto.
- Imports con extensión explícita (ESM puro): `.js`, `.jsx`, `.ts`, `.tsx`. Los `.ts`/`.tsx` importan `.js` con su extensión original; Vite resuelve correctamente.
- Modales globales: despachar `OPEN_MODAL` con `{ type, payload }` → `ModalRoot` lo monta.
- Sheets: componentes en `features/*/...Sheet.tsx` o `sheets/`. Se montan vía `ModalRoot` o estado local.
- IDs: `uid(prefix)` de `lib/utils.ts` (no UUID nativo).
- Formularios: el estado de form usa `string` para inputs numéricos; la conversión a `number` ocurre en `onSubmit`.
- Defaults: `defaultRate: 8`, `defaultDays: 30`, currency `$`.

## Cosas a tener en cuenta al editar
- **`storage.ts` tiene 3 backends**: cambios en la API (`getAll`, `set`) deben funcionar en los 3.
- **No agregar `react-router`**: la app navega por reducer.
- **Tailwind 4 sin config**: clases on-the-fly. Sin safelist ni purge manual.
- **Lazy loading de screens es intencional**: Recharts pesa ~200 KB. No convertir a imports directos.
- **`useDerived` memoiza pesado**: usar para todo cálculo derivado, nunca recalcular en componentes.
- **Campos `_*` son computed-only**: solo existen en `ResolvedLoan`/`ResolvedClient`. Nunca persistir ni despachar.
- **`constants.js` queda como JS**: tiene icons de Lucide como valores; TypeScript infiere sus tipos correctamente con `allowJs: true`.
- **`supabase/functions/_shared/loanMath.ts` duplica los cálculos del frontend**: las edge functions no pueden importar desde `src/` (Deno solo bundlea dentro de la carpeta de la function). Si cambiás una fórmula en `lib/calcs.ts` o `lib/utils.ts`, replicala ahí o las notificaciones divergen de lo que ve el usuario. `src/lib/notificaciones.test.ts` compara las dos implementaciones sobre la misma cartera y falla ante cualquier desvío — es la red que atrapa el olvido.
- **La lógica del digest vive en `_shared/digest.ts`, no en `daily-digest/index.ts`**: `index.ts` importa módulos remotos de Deno y no se puede cargar desde los tests, así que todo lo que decida qué fecha se anuncia va en el shared.
- **PWA service worker**: `vite-plugin-pwa` con `registerType: autoUpdate`; importa `public/push-handler.js` para los push. Runtime caching solo para la API de bluelytics.
- **Los colores de serie de `CHART_COLORS` estan validados, no elegidos a ojo**: caen en la banda de luminosidad del tema oscuro (OKLCH L 0.48-0.67) y el par ingreso/gasto separa dE 8.6 en deuteranopia. El par viejo (`#10b981`/`#f43f5e`) separaba 5.6: un daltonico rojo-verde no distinguia un ingreso de un gasto. Si cambias un tono, revalidalo antes de commitear.
- **Los graficos de Inicio usan tres formas distintas a proposito**: el capital es un nivel que evoluciona (area), el balance es polaridad ingreso/gasto alrededor del cero (barras divergentes, la posicion respecto del eje ya dice cual es cual) y el invertido se lee contra una linea de referencia neutra. Con 2+ series va leyenda si o si, y los valores se etiquetan de forma selectiva (ultimo punto, mes en foco) — nunca un numero por barra.
- **`npx tsc --noEmit` debe pasar siempre**: correrlo antes de commitear cambios de tipos.
