# Finance-app

App mobile-first en español para gestión personal de préstamos, clientes, gastos, ingresos y activos. UI dark theme con tab bar inferior.

## Stack
- React 19 + Vite 8
- Tailwind CSS 4 (vía `@tailwindcss/vite`, sin `tailwind.config.js`)
- Supabase (`@supabase/supabase-js`) — auth + key-value storage + storage bucket de fotos
- Recharts (gráficos), lucide-react (iconos)
- ESLint 10 (flat config)
- **TypeScript (strict)** — migración incremental activa; `.ts`/`.tsx` conviven con `.jsx` todavía no migrados

## Scripts
- `npm run dev` — Vite dev server
- `npm run build` — build de producción a `dist/`
- `npm run lint` — ESLint sobre `**/*.{js,jsx,ts,tsx}`
- `npm run preview` — preview del build
- `npx tsc --noEmit` — chequeo de tipos sin emitir

## Setup
Copiar `.env.example` a `.env` y completar:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Si faltan o tienen los placeholders, la app muestra `SetupScreen` (ver `FinanceApp.jsx`). El check vive en `src/lib/storage.js:SUPABASE_READY`.

## Arquitectura

### Estado global
`useReducer` + `Context` (sin Redux/Zustand). Definido en `src/store/index.ts`:
- `initialState` con `loans`, `clients`, `expenses`, `income`, `history`, `assets`, `settings`, `ui`
- `reducer(state: AppState, action: AppAction): AppState` — union discriminada tipada
- `AppContext` / `useApp()` — expone `{ state, dispatch, derived, userEmail, signOut, userId, setSearchOpen }`
- `useDerived(state): Derived` — cálculos derivados memoizados en 5 etapas

Todos los tipos de dominio viven en `src/types.ts`: `Loan`, `Client`, `Transaction`, `Asset`, `Car`, `Settings`, `AppState`, `AppAction`, `Derived`, etc.

### Persistencia
Tres backends en cascada (`src/lib/storage.js`):
1. **Supabase** si `SUPABASE_READY`: tabla `user_data` con columnas `user_id`, `key`, `value`. Fotos en bucket `loan-photos`.
2. **`window.storage`** si existe (probable wrapper de Electron/PWA).
3. **localStorage** como fallback final.

Las claves de storage están centralizadas en `src/lib/constants.js:STORAGE_KEYS`. Sync automático vía `useStorageSync` (`src/lib/hooks.js`).

### Routing
No usa react-router. Navegación por estado `ui.activeTab` en el reducer, renderizado por `BottomTabBar` + screen activa. Pantallas lazy-loaded para code-splitting:
- `HomeScreen`, `LoansScreen`, `ClientsScreen`, `FinanceScreen`, `ProfileScreen`

### Estructura de carpetas
```
src/
├── types.ts             # todos los tipos de dominio
├── FinanceApp.jsx       # root component (auth gate + tab routing)
├── main.jsx             # entry point
├── components/          # componentes globales (BottomTabBar, ModalRoot, etc.)
│   ├── ui/              # primitives (button, card, sheet, chart, badge, form)
│   └── ui.d.ts          # declaraciones de tipos para los .jsx sin migrar
├── screens/             # una por tab principal
├── features/            # lógica por dominio
│   ├── assets/
│   ├── clients/
│   └── loans/
├── sheets/              # bottom sheets (TransactionSheet)
├── lib/                 # storage, calcs.ts, hooks, constants, utils.ts, backup
└── store/               # index.ts (reducer + context + useDerived)
```

### Cálculos de negocio
Todo lo relacionado con préstamos vive en `src/lib/calcs.ts`: `resolveStatus`, `paidAmount`, `remainingDebt`, `loanProgress`, `expectedProfit`, `expectedReturn`, `compoundReturn`, `daysUntilDue`, `loanIntegrityErrors`. Reglas duras en `BUSINESS_RULES` (constants.js).

## Convenciones
- UI en español (textos visibles al usuario).
- Identificadores y comentarios pueden estar en inglés o español indistintamente.
- Imports relativos con extensión `.js`/`.jsx`/`.ts`/`.tsx` explícita (ESM puro). Los `.ts`/`.tsx` pueden importar archivos `.js` con su extensión original.
- Modales globales vía `ui.modal` en el state + `ModalRoot`.
- Sheets (bottom sheets) son componentes separados en `features/*/...Sheet.tsx` o `sheets/`.
- IDs generados con `uid()` de `lib/utils.ts` (no UUID nativo).
- Defaults de configuración: `defaultRate: 8`, `defaultDays: 30`, currency `$`.

## Cosas a tener en cuenta al editar
- **No romper el contrato de `storage`**: los tres backends esperan la misma API (`getAll(keys)`, etc.). Cambios deben actualizar las tres ramas.
- **No agregar `react-router`**: la app navega por reducer, mantener ese patrón.
- **Tailwind 4 sin config**: las clases se generan on-the-fly. No hay safelist ni purge manual.
- **Lazy loading de screens es intencional** para mantener el bundle inicial chico (Recharts pesa). No convertir a imports directos.
- **`useDerived`** memoiza pesado — usar para todo cálculo derivado del state global en vez de recalcular en componentes.
- **Campos `_*` son computed-only**: nunca persistir ni despachar campos prefijados con `_` (viven solo en `ResolvedLoan`/`ResolvedClient`).
