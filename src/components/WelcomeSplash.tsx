// Pantalla de bienvenida que se muestra brevemente al abrir la app.
// Se desvanece sola a los 2.8 s o al hacer tap/click.
import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

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

interface WelcomeSplashProps {
  userName?: string;
}

export default function WelcomeSplash({ userName }: WelcomeSplashProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2200);
    const hideTimer = setTimeout(() => setVisible(false), 2800);
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
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-48 -top-48 h-[520px] w-[520px] rounded-full bg-amber-900/10 blur-[130px]" />
        <div className="absolute -bottom-48 -left-48 h-[480px] w-[480px] rounded-full bg-amber-950/15 blur-[110px]" />
      </div>
      <div className="relative text-center px-8 max-w-sm">
        <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-500/80 mb-3">
          <Sparkles className="h-3 w-3" />
          Bienvenido
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {userName ? `Hola, ${userName}` : "Bienvenido al panel"}
        </h1>
        <p className="mt-5 text-sm text-zinc-400 leading-relaxed italic">
          &ldquo;{quote}&rdquo;
        </p>
        <p className="mt-8 text-[11px] text-zinc-700 uppercase tracking-widest">
          Toca para continuar
        </p>
      </div>
    </div>
  );
}
