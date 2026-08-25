// Inyecta estilos globales: sistema de motion (springs, stagger, aurora dorada,
// grain), scrollbar, modo claro y soporte de prefers-reduced-motion.
// No recibe props — se renderiza una sola vez en la raíz de la app.
export default function GlobalStyles() {
  return (
    <style>{`
      html { scroll-behavior: smooth; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(63,63,70,0.9); border-radius: 9999px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(161,106,20,0.6); }
      ::selection { background: rgba(245,158,11,0.28); color: #fff; }

      /* ───────────────────────── Motion primitives ───────────────────────── */
      @keyframes fa-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes fa-fade-out { from { opacity: 1 } to { opacity: 0 } }
      @keyframes fa-sheet {
        from { opacity: 0; transform: translateY(36px) scale(0.985) }
        60%  { opacity: 1 }
        to   { opacity: 1; transform: translateY(0) scale(1) }
      }
      @keyframes fa-rise {
        from { opacity: 0; transform: translateY(14px) scale(0.99); filter: blur(3px) }
        to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) }
      }
      .fa-rise > * { animation: fa-rise 520ms cubic-bezier(.21,1.02,.27,1) both }
      .fa-rise > *:nth-child(2) { animation-delay: 45ms }
      .fa-rise > *:nth-child(3) { animation-delay: 90ms }
      .fa-rise > *:nth-child(4) { animation-delay: 135ms }
      .fa-rise > *:nth-child(5) { animation-delay: 180ms }
      .fa-rise > *:nth-child(6) { animation-delay: 225ms }
      .fa-rise > *:nth-child(7) { animation-delay: 270ms }
      .fa-rise > *:nth-child(n+8) { animation-delay: 310ms }
      @keyframes fa-pop {
        0%   { transform: scale(1) }
        45%  { transform: scale(1.22) }
        100% { transform: scale(1) }
      }
      @keyframes fa-ring {
        0%, 100% { transform: rotate(0) }
        12% { transform: rotate(13deg) }
        24% { transform: rotate(-11deg) }
        36% { transform: rotate(8deg) }
        48% { transform: rotate(-6deg) }
        60% { transform: rotate(3deg) }
        72% { transform: rotate(0) }
      }
      .fa-ring { animation: fa-ring 2.4s ease-in-out infinite; transform-origin: 50% 2px; }

      /* Barra de progreso de "mantener apretado" (archivar préstamo). La duración la pone
         el componente con animationDuration, a partir del progressMs de useLongPress
         (lib/hooks.ts), para que la barra termine justo cuando dispara la acción. */
      @keyframes fa-longpress-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
      .fa-longpress-fill { transform-origin: left; animation: fa-longpress-fill 1650ms linear forwards; }

      /* ─────────────────────── Aurora ring (borde vivo) ───────────────────── */
      @property --fa-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
      @keyframes fa-rotate { to { --fa-angle: 360deg } }
      .fa-aurora { position: relative; }
      .fa-aurora::before {
        content: '';
        position: absolute; inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: conic-gradient(from var(--fa-angle),
          transparent 0%,
          rgba(245,158,11,0.0) 8%,
          rgba(245,158,11,0.45) 14%,
          rgba(253,230,138,0.95) 18%,
          rgba(245,158,11,0.45) 22%,
          rgba(245,158,11,0.0) 30%,
          transparent 52%,
          rgba(245,158,11,0.18) 66%,
          transparent 80%);
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask-composite: exclude;
        animation: fa-rotate 7s linear infinite;
        pointer-events: none;
        z-index: 1;
      }

      /* ────────────────────────── Grain (textura) ─────────────────────────── */
      .fa-grain::after {
        content: '';
        position: absolute; inset: 0;
        border-radius: inherit;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        opacity: 0.05;
        mix-blend-mode: overlay;
        pointer-events: none;
      }

      /* ──────────────────────── Brillos existentes ────────────────────────── */
      @keyframes glow-amber {
        0%,100% { box-shadow: 0 0 18px rgba(180,83,9,0.12), 0 0 0 1px rgba(245,158,11,0.06); }
        50%      { box-shadow: 0 0 30px rgba(180,83,9,0.22), 0 0 0 1px rgba(245,158,11,0.12); }
      }
      .glow-card { animation: glow-amber 4s ease-in-out infinite; }
      @keyframes shine { 0% { left: -80% } 100% { left: 120% } }
      .btn-shine { position: relative; overflow: hidden; }
      .btn-shine::after {
        content: '';
        position: absolute;
        top: 0; left: -80%;
        width: 50%; height: 100%;
        background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
        animation: shine 3.5s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes fa-bar-shine {
        0%   { transform: translateX(-100%) }
        60%, 100% { transform: translateX(250%) }
      }
      .fa-bar-shine { position: relative; overflow: hidden; }
      .fa-bar-shine::after {
        content: '';
        position: absolute; top: 0; bottom: 0; left: 0;
        width: 40%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
        animation: fa-bar-shine 2.6s cubic-bezier(.4,0,.2,1) infinite;
      }

      /* Texto dorado con barrido de luz (capital, splash) */
      @keyframes fa-gold-sweep { to { background-position: -200% center } }
      .fa-gold-text {
        background: linear-gradient(100deg, #fff 38%, #fde68a 46%, #f59e0b 50%, #fde68a 54%, #fff 62%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: fa-gold-sweep 5.5s linear infinite;
      }

      /* ─────────────────────────── Modo claro ─────────────────────────────── */
      .theme-light { background-color: #f5f2eb; color: #1c1917; color-scheme: light; }
      .theme-light [class*="bg-[#06060a]"],
      .theme-light [class*="bg-[#0d0a06]"],
      .theme-light [class*="bg-zinc-950"] { background-color: #f5f2eb !important; }
      .theme-light [class*="bg-zinc-900"] { background-color: rgba(255,253,249,0.92) !important; }
      .theme-light [class*="bg-zinc-800"] { background-color: rgba(232,228,220,0.85) !important; }
      .theme-light [class*="from-zinc-9"] { --tw-gradient-from: rgba(248,245,238,0.95) var(--tw-gradient-from-position) !important; }
      .theme-light [class*="from-[#0d0a06]"] { --tw-gradient-from: rgba(248,245,238,0.95) var(--tw-gradient-from-position) !important; }
      .theme-light [class*="via-[#0d0a06]"] { --tw-gradient-via: rgba(248,245,238,0.9) var(--tw-gradient-via-position) !important; }
      .theme-light [class*="to-zinc-9"],
      .theme-light [class*="to-amber-950"] { --tw-gradient-to: rgba(245,242,235,0.8) var(--tw-gradient-to-position) !important; }
      .theme-light [class*="text-white"] { color: #1c1917 !important; }
      .theme-light [class*="text-zinc-100"] { color: #1c1917 !important; }
      .theme-light [class*="text-zinc-200"] { color: #292524 !important; }
      .theme-light [class*="text-zinc-300"] { color: #44403c !important; }
      .theme-light [class*="text-zinc-400"] { color: #57534e !important; }
      .theme-light [class*="text-zinc-600"] { color: #78716c !important; }
      .theme-light [class*="text-zinc-700"] { color: #a8a29e !important; }
      .theme-light [class*="border-zinc-7"],
      .theme-light [class*="border-zinc-8"],
      .theme-light [class*="border-zinc-9"] { border-color: rgba(200,196,188,0.65) !important; }
      .theme-light input::placeholder,
      .theme-light textarea::placeholder { color: #a8a29e !important; }
      .theme-light select { color: #1c1917 !important; }
      .theme-light select option { background-color: #f5f2eb; color: #1c1917; }
      .theme-light canvas { display: none !important; }
      .theme-light ::-webkit-scrollbar-thumb { background: rgba(180,174,164,0.6); }
      .theme-light ::selection { background: rgba(245,158,11,0.28); color: #1c1917; }
      .theme-light .fa-aurora::before,
      .theme-light .fa-grain::after { display: none; }
      .theme-light .glow-card { animation: none; }
      .theme-light .fa-gold-text {
        background: none; color: #1c1917; animation: none;
        -webkit-background-clip: initial; background-clip: initial;
      }

      /* ──────────────────── Accesibilidad: reduced motion ─────────────────── */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
        html { scroll-behavior: auto; }
      }
    `}</style>
  );
}
