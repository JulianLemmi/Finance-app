// Barra de navegación inferior con 6 tabs. Soporta navegación con teclado
// (flechas, Home, End) mediante refs por tab.
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

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextTab = TABS[nextIdx];
    dispatch({ type: "SET_TAB", payload: nextTab.id });
    refs.current[nextTab.id]?.focus();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <nav role="tablist" aria-label="Navegación principal"
        className="pointer-events-auto mx-3 flex w-full max-w-md items-center justify-between rounded-2xl border border-zinc-700/30 bg-zinc-950/90 px-1 py-1 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(245,158,11,0.04),inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-2xl">
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
              onClick={() => dispatch({ type: "SET_TAB", payload: t.id })}
              className="relative flex flex-1 flex-col items-center justify-center rounded-xl py-2 transition-all duration-200"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                active
                  ? "bg-amber-500/15 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.25)]"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}>
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
