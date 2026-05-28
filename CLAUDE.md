# Finance-app

App mobile-first en español para gestión personal de préstamos, clientes, gastos, ingresos y activos. UI dark theme con tab bar inferior.

## Stack
- React 19 + Vite 8
- Tailwind CSS 4 (vía `@tailwindcss/vite`, sin `tailwind.config.js`)
- Supabase (`@supabase/supabase-js`) — auth + key-value storage + storage bucket de fotos
- Recharts (gráficos), lucide-react (iconos)
- ESLint 10 (flat config)
- Sin TypeScript, sin tests

## Scripts
- `npm run dev` — Vite dev server
- `npm run build` — build de producción a `dist/`
- `npm run lint` — ESLint sobre `**/*.{js,jsx}`
- `npm run preview` — preview del build

## Setup
Copiar `.env.example` a `.env` y completar:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Si faltan o tienen los placeholders, la app muestra `SetupScreen` (ver `FinanceApp.jsx`). El check vive en `src/lib/storage.js:SUPABASE_READY`.

## Arquitectura

### Estado global
`useReducer` + `Context` (sin Redux/Zustand). Definido en `src/store/index.js`:
- `initialState` con `loans`, `clients`, `expenses`, `income`, `history`, `assets`, `settings`, `ui`
- `reducer` con acciones tipo `HYDRATE`, `SET_TAB`, `ADD_LOAN`, `UPDATE_SETTINGS`, etc.
- `AppContext` expuesto desde el mismo archivo
- `useDerived` para cálculos derivados memoizados

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
├── FinanceApp.jsx       # root component (auth gate + tab routing)
├── main.jsx             # entry point
├── components/          # componentes globales (BottomTabBar, ModalRoot, etc.)
│   └── ui/              # primitives (button, card, sheet, chart, badge, form)
├── screens/             # una por tab principal
├── features/            # lógica por dominio
│   ├── assets/
│   ├── clients/
│   └── loans/
├── sheets/              # bottom sheets (TransactionSheet)
├── lib/                 # storage, calcs, hooks, constants, utils, backup
└── store/               # reducer + context
```

### Cálculos de negocio
Todo lo relacionado con préstamos vive en `src/lib/calcs.js`: `resolveStatus`, `paidAmount`, `remainingDebt`, `loanProgress`, `expectedProfit`, `expectedReturn`, `compoundReturn`, `daysUntilDue`, `loanIntegrityErrors`. Reglas duras en `BUSINESS_RULES` (constants.js).

## Convenciones
- UI en español (textos visibles al usuario).
- Identificadores y comentarios pueden estar en inglés o español indistintamente.
- Imports relativos con extensión `.js`/`.jsx` explícita (ESM puro).
- Modales globales vía `ui.modal` en el state + `ModalRoot`.
- Sheets (bottom sheets) son componentes separados en `features/*/...Sheet.jsx` o `sheets/`.
- IDs generados con `uid()` de `lib/utils.js` (no UUID nativo).
- Defaults de configuración: `defaultRate: 8`, `defaultDays: 30`, currency `$`.

## Cosas a tener en cuenta al editar
- **No romper el contrato de `storage`**: los tres backends esperan la misma API (`getAll(keys)`, etc.). Cambios deben actualizar las tres ramas.
- **No agregar `react-router`**: la app navega por reducer, mantener ese patrón.
- **Tailwind 4 sin config**: las clases se generan on-the-fly. No hay safelist ni purge manual.
- **Lazy loading de screens es intencional** para mantener el bundle inicial chico (Recharts pesa). No convertir a imports directos.
- **`useDerived`** memoiza pesado — usar para todo cálculo derivado del state global en vez de recalcular en componentes.
