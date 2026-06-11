// Números animados: count-up con ease-out-expo vía rAF. Respeta
// prefers-reduced-motion y el flag hideBalances (sin animación al ocultar).
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../../lib/utils.js";

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Anima desde el valor anterior hacia `target`. En el primer render arranca
// desde 0 para el efecto de "carga" del panel.
export function useCountUp(target: number, duration = 1100): number {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(display);
  const rafRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = from + (target - from) * easeOutExpo(t);
      fromRef.current = value;
      setDisplay(value);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

interface AnimatedMoneyProps {
  value: number | string;
  hide?: boolean;
  currency?: string;
  className?: string;
  duration?: number;
}

// Reemplazo drop-in de <Money> con count-up. Usar en cifras protagonistas
// (capital total, stats); para listas largas conviene <Money> plano.
export const AnimatedMoney = ({ value, hide, currency = "$", className = "", duration }: AnimatedMoneyProps) => {
  const target = hide ? 0 : Number(value) || 0;
  const display = useCountUp(target, duration);
  return (
    <span className={`tabular-nums ${className}`}>
      {hide ? formatMoney(value, true, currency) : formatMoney(Math.round(display), false, currency)}
    </span>
  );
};
