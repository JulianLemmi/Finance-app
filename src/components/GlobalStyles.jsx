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
    `}</style>
  );
}
