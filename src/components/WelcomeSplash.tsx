// Pantalla de bienvenida que se muestra brevemente al abrir la app.
// Anillo dorado que se dibuja, saludo con barrido de luz y revelado escalonado.
// Se desvanece sola a los 3 s o al hacer tap/click.
import { useState, useEffect } from "react";
import { Briefcase } from "lucide-react";

const QUOTES = [
  "El capital crece con disciplina y consistencia.",
  "Cada inversión bien analizada es un paso hacia la libertad financiera.",
  "El dinero es una herramienta; la sabiduría, el verdadero activo.",
  "Quien controla sus finanzas, controla su futuro.",
  "La riqueza no es suerte, es estrategia.",
  "Un registro claro hoy es una decisión inteligente mañana.",
  "La constancia supera al talento en las finanzas.",
  "Pequeños hábitos financieros, grandes resultados a largo plazo.",
  "Invertir en conocimiento siempre da los mejores intereses.",
  "El presupuesto es el mapa, tus metas son el destino.",
];

// Partículas doradas flotantes: posición/tamaño/delay fijos para evitar saltos.
const PARTICLES = [
  { left: "12%", top: "22%", size: 3, delay: "0s",    dur: "7s" },
  { left: "82%", top: "18%", size: 2, delay: "1.2s",  dur: "9s" },
  { left: "24%", top: "72%", size: 2, delay: "0.6s",  dur: "8s" },
  { left: "70%", top: "78%", size: 3, delay: "2s",    dur: "7.5s" },
  { left: "48%", top: "12%", size: 2, delay: "1.6s",  dur: "10s" },
  { left: "90%", top: "55%", size: 2, delay: "0.3s",  dur: "8.5s" },
  { left: "8%",  top: "52%", size: 2, delay: "2.4s",  dur: "9.5s" },
];

interface WelcomeSplashProps {
  userName?: string;
}

export default function WelcomeSplash({ userName }: WelcomeSplashProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2400);
    const hideTimer = setTimeout(() => setVisible(false), 3000);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setFading(true);
    setTimeout(() => setVisible(false), 600);
  };

  return (
    <div
      onClick={dismiss}
      style={{ transition: "opacity 0.6s ease" }}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#06060a] cursor-pointer select-none ${fading ? "opacity-0" : "opacity-100"}`}
    >
      <style>{`
        @keyframes fa-splash-up {
          from { opacity: 0; transform: translateY(18px); filter: blur(4px) }
          to   { opacity: 1; transform: translateY(0); filter: blur(0) }
        }
        @keyframes fa-splash-ring { from { stroke-dashoffset: 264 } to { stroke-dashoffset: 0 } }
        @keyframes fa-splash-icon {
          0%, 35% { opacity: 0; transform: scale(0.6) }
          70%     { opacity: 1; transform: scale(1.12) }
          100%    { opacity: 1; transform: scale(1) }
        }
        @keyframes fa-splash-float {
          0%, 100% { transform: translateY(0); opacity: 0.25 }
          50%      { transform: translateY(-16px); opacity: 0.9 }
        }
        @media (prefers-reduced-motion: reduce) {
          .fa-splash-anim { animation-duration: 0.01ms !important; }
        }
      `}</style>

      {/* Glow de fondo + partículas */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-48 -top-48 h-[520px] w-[520px] rounded-full bg-amber-900/10 blur-[130px]" />
        <div className="absolute -bottom-48 -left-48 h-[480px] w-[480px] rounded-full bg-amber-950/15 blur-[110px]" />
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="fa-splash-anim absolute rounded-full bg-amber-300"
            style={{
              left: p.left, top: p.top, width: p.size, height: p.size,
              boxShadow: "0 0 8px rgba(253,230,138,0.8)",
              animation: `fa-splash-float ${p.dur} ease-in-out ${p.delay} infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative max-w-sm px-8 text-center">
        {/* Anillo que se dibuja con el icono apareciendo adentro */}
        <div className="relative mx-auto mb-6 h-24 w-24">
          <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(245,158,11,0.12)" strokeWidth="1.5" />
            <circle
              cx="48" cy="48" r="42" fill="none"
              stroke="url(#fa-splash-gold)" strokeWidth="2" strokeLinecap="round"
              strokeDasharray="264" strokeDashoffset="264"
              className="fa-splash-anim"
              style={{ animation: "fa-splash-ring 1.4s cubic-bezier(.4,0,.2,1) 0.15s forwards" }}
            />
            <defs>
              <linearGradient id="fa-splash-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="55%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#92400e" />
              </linearGradient>
            </defs>
          </svg>
          <div
            className="fa-splash-anim absolute inset-0 flex items-center justify-center"
            style={{ animation: "fa-splash-icon 1.5s cubic-bezier(.3,1.3,.4,1) forwards" }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-700 to-amber-950 text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.25),inset_0_1px_0_rgba(253,230,138,0.25)]">
              <Briefcase className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div
          className="fa-splash-anim mb-3 text-[11px] uppercase tracking-[0.3em] text-amber-500/80"
          style={{ animation: "fa-splash-up 700ms cubic-bezier(.21,1.02,.27,1) 0.5s both" }}
        >
          Bienvenido
        </div>
        <h1
          className="fa-splash-anim fa-gold-text text-3xl font-semibold tracking-tight"
          style={{ animation: "fa-splash-up 700ms cubic-bezier(.21,1.02,.27,1) 0.7s both" }}
        >
          {userName ? `Hola, ${userName}` : "Bienvenido al panel"}
        </h1>
        <p
          className="fa-splash-anim mt-5 text-sm italic leading-relaxed text-zinc-400"
          style={{ animation: "fa-splash-up 700ms cubic-bezier(.21,1.02,.27,1) 0.95s both" }}
        >
          &ldquo;{quote}&rdquo;
        </p>
        <p
          className="fa-splash-anim mt-8 text-[11px] uppercase tracking-widest text-zinc-700"
          style={{ animation: "fa-splash-up 700ms ease 1.4s both" }}
        >
          Toca para continuar
        </p>
      </div>
    </div>
  );
}
