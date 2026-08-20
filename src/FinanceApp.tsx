// Componente raíz de la app. Maneja el ciclo de autenticación (SetupScreen →
// LoginScreen → AuthedApp) y monta todo el contexto global de estado.
import React, { lazy, Suspense, useReducer, useEffect, useMemo, useState, useCallback } from "react";
import { Briefcase, Sparkles, CheckCircle2, Search } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { initialState, reducer, AppContext, useDerived } from "./store/index.js";
import { STORAGE_KEYS } from "./lib/constants.js";
import { storage, supabase, SUPABASE_READY } from "./lib/storage.js";
import { stripComputed } from "./lib/utils.js";
import { useStorageSync } from "./lib/hooks.js";
import { shouldLock, markUnlocked } from "./lib/lock.js";
import { Skeleton, Input, Button } from "./components/ui.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import GlobalStyles from "./components/GlobalStyles.jsx";
import DollarRain from "./components/DollarRain.jsx";
import BottomTabBar from "./components/BottomTabBar.jsx";
import ModalRoot from "./components/ModalRoot.jsx";
import WelcomeSplash from "./components/WelcomeSplash.jsx";
import GlobalSearch from "./components/GlobalSearch.jsx";
import LockScreen from "./components/LockScreen.jsx";
import NetworkStatus from "./components/NetworkStatus.jsx";
import FirstRunSheet from "./components/FirstRunSheet.jsx";

declare global {
  interface Navigator {
    readonly standalone?: boolean;
  }
}

const HomeScreen    = lazy(() => import("./screens/HomeScreen.jsx"));
const LoansScreen   = lazy(() => import("./screens/LoansScreen.jsx"));
const ClientsScreen = lazy(() => import("./screens/ClientsScreen.jsx"));
const FinanceScreen = lazy(() => import("./screens/FinanceScreen.jsx"));
const ProfileScreen = lazy(() => import("./screens/ProfileScreen.jsx"));
const CarsScreen    = lazy(() => import("./screens/CarsScreen.jsx"));

function LoadingSkeleton() {
  return (
    <div className="space-y-6 pb-24 pt-1">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-40" /></div>
        <Skeleton className="h-9 w-9" />
      </div>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
      </div>
    </div>
  );
}

function LoadingSkeletonGate() {
  return (
    <div className="space-y-6 pb-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-44" /><Skeleton className="h-9 w-9" />
      </div>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-3xl border border-amber-900/30 bg-gradient-to-br from-zinc-900 to-amber-950/30 p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-500/80">
            <Sparkles className="h-3 w-3" />
            Configuración requerida
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Conectá Supabase para empezar</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Falta cargar las credenciales de tu proyecto. Editá el archivo{" "}
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-200">.env</span>{" "}
            en la raíz y pegá tu <span className="text-zinc-200">Project URL</span> y tu <span className="text-zinc-200">anon public key</span>.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/70 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const onGoogleSignIn = async () => {
    setStatus("sending"); setErrorMsg("");
    try {
      const { error } = await supabase!.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error)?.message || "No se pudo iniciar con Google.");
    }
  };

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.includes("@")) { setStatus("error"); setErrorMsg("Ingresá un email válido."); return; }
    setStatus("sending"); setErrorMsg("");
    try {
      const { error } = await supabase!.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error)?.message || "No se pudo enviar el link.");
    }
  };

  const busy = status === "sending";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 text-amber-100">
            <Briefcase className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Acceder al panel</h1>
          <p className="mt-1.5 text-sm text-zinc-400">Elegí cómo querés entrar.</p>
          <p className="mt-1 text-xs text-zinc-500">¿Primera vez? Te creamos la cuenta al instante.</p>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={onGoogleSignIn}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-zinc-700/60 bg-zinc-800/60 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-700/60 disabled:opacity-50"
          >
            <GoogleIcon />
            Continuar con Google
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-[11px] uppercase tracking-widest text-zinc-600">o</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <Input label="Email" type="email" placeholder="tu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={busy || status === "sent"} />
            {status === "error" && (
              <div className="rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">{errorMsg}</div>
            )}
            {status === "sent" ? (
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
                <div className="text-sm font-medium text-emerald-200">Link enviado</div>
                <div className="mt-1 text-xs text-emerald-300/70">
                  Revisá <span className="font-medium">{email}</span> y hacé click en el link para entrar.
                </div>
              </div>
            ) : (
              <Button type="submit" variant="bronze" className="w-full" disabled={busy}>
                {busy ? "Enviando..." : "Enviar link de acceso"}
              </Button>
            )}
          </form>
        </div>

        <div className="mt-8 text-center text-[11px] uppercase tracking-[0.18em] text-zinc-700">
          Datos privados · sincronización segura
        </div>
      </div>
    </div>
  );
}

interface AuthedAppProps {
  sessionUserId: string;
  userEmail: string;
}

function AuthedApp({ sessionUserId, userEmail }: AuthedAppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const derived = useDerived(state);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  const [locked, setLocked] = useState(() => isStandalone && shouldLock());

  useEffect(() => {
    if (!isStandalone) return;
    const onVisibility = () => {
      // Al volver al foreground, re-bloquear solo si pasó la ventana de gracia (5 min).
      if (!document.hidden && shouldLock()) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isStandalone]);

  const handleUnlock = useCallback(() => { markUnlocked(); setLocked(false); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await storage.getAll(Object.values(STORAGE_KEYS));
      if (cancelled) return;
      const rawLoans = (Array.isArray(data[STORAGE_KEYS.loans]) ? data[STORAGE_KEYS.loans] : []) as Record<string, unknown>[];
      const rawClients = (Array.isArray(data[STORAGE_KEYS.clients]) ? data[STORAGE_KEYS.clients] : []) as Record<string, unknown>[];
      const cleanLoans = rawLoans.map(stripComputed);
      const cleanClients = rawClients.map(stripComputed);
      dispatch({
        type: "HYDRATE",
        payload: {
          loans:    cleanLoans as never,
          clients:  cleanClients as never,
          expenses: Array.isArray(data[STORAGE_KEYS.expenses]) ? data[STORAGE_KEYS.expenses] as never : [],
          income:   Array.isArray(data[STORAGE_KEYS.income])   ? data[STORAGE_KEYS.income] as never   : [],
          history:  Array.isArray(data[STORAGE_KEYS.history])  ? data[STORAGE_KEYS.history] as never  : [],
          assets:   Array.isArray(data[STORAGE_KEYS.assets])   ? data[STORAGE_KEYS.assets] as never   : [],
          cars:     Array.isArray(data[STORAGE_KEYS.cars])     ? data[STORAGE_KEYS.cars] as never     : [],
          liabilities: Array.isArray(data[STORAGE_KEYS.liabilities]) ? data[STORAGE_KEYS.liabilities] as never : [],
          settings: data[STORAGE_KEYS.settings] && typeof data[STORAGE_KEYS.settings] === "object"
            ? data[STORAGE_KEYS.settings] as never : undefined,
        },
      });
      // Limpieza one-shot de campos _* legacy ya guardados. useStorageSync saltea el
      // primer sync post-hydrate, así que re-persistimos manualmente sólo si cambió algo.
      if (cleanLoans.some((l, i) => l !== rawLoans[i])) storage.set(STORAGE_KEYS.loans, cleanLoans);
      if (cleanClients.some((c, i) => c !== rawClients[i])) storage.set(STORAGE_KEYS.clients, cleanClients);
    })();
    return () => { cancelled = true; };
  }, [sessionUserId]);

  useStorageSync(STORAGE_KEYS.loans,    state.loans,    state.loaded);
  useStorageSync(STORAGE_KEYS.clients,  state.clients,  state.loaded);
  useStorageSync(STORAGE_KEYS.expenses, state.expenses, state.loaded);
  useStorageSync(STORAGE_KEYS.income,   state.income,   state.loaded);
  useStorageSync(STORAGE_KEYS.history,  state.history,  state.loaded);
  useStorageSync(STORAGE_KEYS.settings, state.settings, state.loaded);
  useStorageSync(STORAGE_KEYS.assets,   state.assets,   state.loaded);
  useStorageSync(STORAGE_KEYS.cars,     state.cars,     state.loaded);
  useStorageSync(STORAGE_KEYS.liabilities, state.liabilities, state.loaded);

  const [searchOpen, setSearchOpen] = useState(false);
  const [quotaKeys, setQuotaKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const onQuota = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>)?.detail?.key || "datos";
      setQuotaKeys((prev) => {
        if (prev.has(key)) return prev;
        return new Set([...prev, key]);
      });
    };
    window.addEventListener("finance:storage-quota-exceeded", onQuota);
    return () => window.removeEventListener("finance:storage-quota-exceeded", onQuota);
  }, []);

  const signOut = useCallback(async () => {
    try { await supabase?.auth.signOut(); } catch (e) { console.warn("signOut", e); }
  }, []);

  const ctx = useMemo(
    () => ({ state, dispatch, derived, userEmail, signOut, userId: sessionUserId, setSearchOpen }),
    [state, derived, userEmail, signOut, sessionUserId, setSearchOpen]
  );

  const activeTab = state.ui.activeTab;
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [activeTab]);
  const isLight = state.settings.theme === "light";

  return (
    <AppContext.Provider value={ctx}>
      {locked && <LockScreen onUnlock={handleUnlock} />}
      <WelcomeSplash userName={state.settings.userName?.trim()} />
      <FirstRunSheet />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <GlobalStyles />
      <div className={`relative min-h-screen bg-[#06060a] text-zinc-100 antialiased [font-feature-settings:'cv11','ss01']${isLight ? " theme-light" : ""}`}>
        {!isLight && <DollarRain />}
        {!isLight && (
          <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
            <div className="absolute -right-48 -top-48 h-[520px] w-[520px] rounded-full bg-amber-900/10 blur-[130px]" />
            <div className="absolute -bottom-48 -left-48 h-[480px] w-[480px] rounded-full bg-amber-950/15 blur-[110px]" />
            <div className="absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-zinc-800/10 blur-[80px]" />
          </div>
        )}
        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
          {!state.loaded ? (
            <LoadingSkeleton />
          ) : (
            <ErrorBoundary key={activeTab}>
              <Suspense fallback={<LoadingSkeleton />}>
                <div className="fa-rise">
                  {activeTab === "home"    && <HomeScreen />}
                  {activeTab === "loans"   && <LoansScreen />}
                  {activeTab === "clients" && <ClientsScreen />}
                  {activeTab === "cars"    && <CarsScreen />}
                  {activeTab === "finance" && <FinanceScreen />}
                  {activeTab === "profile" && <ProfileScreen />}
                </div>
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
        <NetworkStatus />
        {quotaKeys.size > 0 && (
          <div className="fixed inset-x-0 top-3 z-40 mx-auto flex max-w-md justify-center px-3">
            <div className="flex items-start gap-3 rounded-2xl border border-rose-900/50 bg-rose-950/90 px-4 py-3 text-xs text-rose-100 shadow-2xl backdrop-blur">
              <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-400" />
              <div className="flex-1">
                <div className="font-medium">Sin espacio para guardar localmente</div>
                <div className="mt-0.5 text-rose-200/80">
                  Estas slices no se están sincronizando: <span className="font-mono">{Array.from(quotaKeys).join(", ")}</span>.
                </div>
              </div>
              <button onClick={() => setQuotaKeys(new Set())}
                className="-mr-1 -mt-1 rounded-md p-1 text-rose-300 hover:bg-rose-900/40" aria-label="Cerrar aviso">
                <span aria-hidden>×</span>
              </button>
            </div>
          </div>
        )}
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar"
          className="fixed right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700/40 bg-zinc-950/85 text-zinc-300 shadow-[0_4px_18px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-colors hover:bg-zinc-900 hover:text-amber-300"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.25rem)" }}>
          <Search className="h-4 w-4" />
        </button>
        <BottomTabBar />
        <ModalRoot />
      </div>
    </AppContext.Provider>
  );
}

export default function FinanceApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setAuthReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!mounted) return;
      setSession(sess);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  if (!SUPABASE_READY) return <SetupScreen />;
  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6"><LoadingSkeletonGate /></div>
      </div>
    );
  }
  if (!session) return <LoginScreen />;
  return <AuthedApp sessionUserId={session.user.id} userEmail={session.user.email ?? ""} />;
}
