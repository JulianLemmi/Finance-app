export default function GlobalStyles() {
  return (
    <style>{`
      html { scroll-behavior: smooth; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(63,63,70,0.9); border-radius: 9999px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(161,106,20,0.6); }
      ::selection { background: rgba(245,158,11,0.28); color: #fff; }
      @keyframes fa-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes fa-sheet {
        from { opacity: 0; transform: translateY(24px) }
        to   { opacity: 1; transform: translateY(0) }
      }
      @keyframes fa-rise {
        from { opacity: 0; transform: translateY(10px) }
        to   { opacity: 1; transform: translateY(0) }
      }
      .fa-rise > * { animation: fa-rise 380ms cubic-bezier(.22,1,.36,1) both }
      .fa-rise > *:nth-child(2) { animation-delay: 50ms }
      .fa-rise > *:nth-child(3) { animation-delay: 100ms }
      .fa-rise > *:nth-child(4) { animation-delay: 150ms }
      .fa-rise > *:nth-child(5) { animation-delay: 200ms }
      .fa-rise > *:nth-child(6) { animation-delay: 250ms }
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

      /* ── Light theme ─────────────────────────────────── */
      .theme-light { background-color: #f5f2eb; color: #1c1917; color-scheme: light; }

      /* Backgrounds */
      .theme-light [class*="bg-[#06060a]"],
      .theme-light [class*="bg-[#0d0a06]"],
      .theme-light [class*="bg-zinc-950"] { background-color: #f5f2eb !important; }
      .theme-light [class*="bg-zinc-900"] { background-color: rgba(255,253,249,0.92) !important; }
      .theme-light [class*="bg-zinc-800"] { background-color: rgba(232,228,220,0.85) !important; }

      /* Gradients from zinc → light */
      .theme-light [class*="from-zinc-9"] { --tw-gradient-from: rgba(248,245,238,0.95) var(--tw-gradient-from-position) !important; }
      .theme-light [class*="from-[#0d0a06]"] { --tw-gradient-from: rgba(248,245,238,0.95) var(--tw-gradient-from-position) !important; }
      .theme-light [class*="via-[#0d0a06]"] { --tw-gradient-via: rgba(248,245,238,0.9) var(--tw-gradient-via-position) !important; }
      .theme-light [class*="to-zinc-9"],
      .theme-light [class*="to-amber-950"] { --tw-gradient-to: rgba(245,242,235,0.8) var(--tw-gradient-to-position) !important; }

      /* Text */
      .theme-light [class*="text-white"] { color: #1c1917 !important; }
      .theme-light [class*="text-zinc-100"] { color: #1c1917 !important; }
      .theme-light [class*="text-zinc-200"] { color: #292524 !important; }
      .theme-light [class*="text-zinc-300"] { color: #44403c !important; }
      .theme-light [class*="text-zinc-400"] { color: #57534e !important; }
      .theme-light [class*="text-zinc-600"] { color: #78716c !important; }
      .theme-light [class*="text-zinc-700"] { color: #a8a29e !important; }

      /* Borders */
      .theme-light [class*="border-zinc-7"],
      .theme-light [class*="border-zinc-8"],
      .theme-light [class*="border-zinc-9"] { border-color: rgba(200,196,188,0.65) !important; }

      /* Form elements */
      .theme-light input::placeholder,
      .theme-light textarea::placeholder { color: #a8a29e !important; }
      .theme-light select { color: #1c1917 !important; }
      .theme-light select option { background-color: #f5f2eb; color: #1c1917; }

      /* Hide canvas (DollarRain) */
      .theme-light canvas { display: none !important; }

      /* Scrollbar */
      .theme-light ::-webkit-scrollbar-thumb { background: rgba(180,174,164,0.6); }
      .theme-light ::selection { background: rgba(245,158,11,0.28); color: #1c1917; }
    `}</style>
  );
}
