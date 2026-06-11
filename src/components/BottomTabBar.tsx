// Barra de navegación inferior con 6 tabs. El indicador activo es una píldora
// que se desliza con física de resorte entre tabs; el icono hace "pop" al
// activarse y en dispositivos táctiles hay feedback háptico sutil.
// Soporta navegación con teclado (flechas, Home, End) mediante refs por tab.
import { useRef } from "react";
import { Home as HomeIcon, Wallet, Users, TrendingUp, User as UserIcon, Car } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "../store/index.js";
import type { TabName } from "../types";

interface Tab {
  id: TabName;
  label: string;
  Icon: LucideIcon;
}

const TABS: Tab[] = [
  { id: "home",    label: "Inicio",    Icon: HomeIcon   },
  { id: "loans",   label: "Préstamos", Icon: Wallet     },
  { id: "clients", label: "Clientes",  Icon: Users      },
  { id: "cars",    label: "Autos",     Icon: Car        },
  { id: "finance", label: "Finanzas",  Icon: TrendingUp },
  { id: "profile", label: "Perfil",    Icon: UserIcon   },
];

export default function BottomTabBar() {
  const { state, dispatch } = useApp();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIdx = Math.max(0, TABS.findIndex((t) => t.id === state.ui.activeTab));

  const goTo = (tab: TabName) => {
    if (tab !== state.ui.activeTab) navigator.vibrate?.(6);
    dispatch({ type: "SET_TAB", payload: tab });
  };

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextTab = TABS[nextIdx];
    goTo(nextTab.id);
    refs.current[nextTab.id]?.focus();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <nav role="tablist" aria-label="Navegación principal"
        className="pointer-events-auto relative mx-3 flex w-full max-w-md items-center justify-between rounded-2xl border border-zinc-700/30 bg-zinc-950/90 px-1 py-1 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(245,158,11,0.04),inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-2xl">
        {/* Píldora deslizante del tab activo */}
        <span
          aria-hidden
          className="absolute bottom-1 top-1 rounded-xl border border-amber-500/15 bg-gradient-to-b from-amber-500/12 to-amber-700/5 shadow-[0_0_16px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(253,230,138,0.1)]"
          style={{
            left: `calc(0.25rem + ${activeIdx} * ((100% - 0.5rem) / ${TABS.length}))`,
            width: `calc((100% - 0.5rem) / ${TABS.length})`,
            transition: "left 380ms cubic-bezier(.3,1.35,.4,1)",
          }}
        />
        {TABS.map((t, idx) => {
          const active = state.ui.activeTab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[t.id] = el; }}
              role="tab"
              aria-selected={active}
              aria-label={t.label}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, idx)}
              onClick={() => goTo(t.id)}
              className="relative z-10 flex flex-1 flex-col items-center justify-center rounded-xl py-2 transition-all duration-200"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-200 ${
                  active ? "text-amber-300" : "text-zinc-600 hover:text-zinc-400"
                }`}
                style={active ? { animation: "fa-pop 420ms cubic-bezier(.3,1.4,.4,1)" } : undefined}
              >
                <t.Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.7} />
              </span>
              <span className={`mt-0.5 text-[10px] font-medium tracking-wide transition-colors duration-200 ${
                active ? "text-amber-300" : "text-zinc-600"
              }`}>
                {t.label}
              </span>
              {active && (
                <span className="absolute -bottom-0.5 h-0.5 w-5 rounded-full bg-amber-400/90 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
