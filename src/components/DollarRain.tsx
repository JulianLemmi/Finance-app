// Animación de fondo: billetes cayendo con vaivén + chispas doradas en canvas.
// Solo se muestra en tema oscuro (GlobalStyles oculta el canvas con
// .theme-light canvas { display: none }). Respeta prefers-reduced-motion.
import { useRef, useEffect } from "react";

interface Bill {
  x: number; y: number; w: number; h: number;
  speed: number; alpha: number; rot: number; rotSpeed: number;
  drift: number; swayPhase: number; swayAmp: number;
}

interface Spark {
  x: number; y: number; r: number;
  phase: number; twinkle: number; driftY: number;
}

export default function DollarRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const makeBill = (initial: boolean): Bill => {
      const w = Math.random() * 46 + 26;
      return {
        x: Math.random() * canvas.width,
        y: initial ? Math.random() * canvas.height : -50,
        w, h: w * 0.44,
        speed: Math.random() * 0.65 + 0.22,
        alpha: Math.random() * 0.10 + 0.025,
        rot: (Math.random() - 0.5) * 0.55,
        rotSpeed: (Math.random() - 0.5) * 0.006,
        drift: (Math.random() - 0.5) * 0.16,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: Math.random() * 0.35 + 0.1,
      };
    };

    const makeSpark = (): Spark => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.3 + 0.5,
      phase: Math.random() * Math.PI * 2,
      twinkle: Math.random() * 0.015 + 0.006,
      driftY: -(Math.random() * 0.08 + 0.02),
    });

    const bills: Bill[] = Array.from({ length: 28 }, () => makeBill(true));
    const sparks: Spark[] = Array.from({ length: 22 }, makeSpark);

    const drawBill = (b: Bill) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = b.alpha;
      const hw = b.w / 2, hh = b.h / 2, r = 2.5;
      ctx.beginPath();
      ctx.moveTo(-hw + r, -hh); ctx.lineTo(hw - r, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + r); ctx.lineTo(hw, hh - r);
      ctx.quadraticCurveTo(hw, hh, hw - r, hh); ctx.lineTo(-hw + r, hh);
      ctx.quadraticCurveTo(-hw, hh, -hw, hh - r); ctx.lineTo(-hw, -hh + r);
      ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh); ctx.closePath();
      ctx.fillStyle = "#78350f"; ctx.fill();
      ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = "rgba(245,158,11,0.35)"; ctx.lineWidth = 0.35;
      ctx.strokeRect(-hw + 3.5, -hh + 2.5, b.w - 7, b.h - 5);
      ctx.fillStyle = "#fde68a";
      ctx.font = `bold ${b.h * 0.58}px Georgia, serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 0);
      ctx.restore();
    };

    const drawSpark = (s: Spark, t: number) => {
      const a = Math.max(0, Math.sin(s.phase + t * s.twinkle)) * 0.35;
      if (a < 0.01) return;
      ctx.save();
      ctx.globalAlpha = a;
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      glow.addColorStop(0, "rgba(253,230,138,0.9)");
      glow.addColorStop(1, "rgba(253,230,138,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    let raf: number;
    let t = 0;
    const animate = () => {
      t += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparks.forEach((s) => {
        s.y += s.driftY;
        if (s.y < -10) { s.y = canvas.height + 10; s.x = Math.random() * canvas.width; }
        drawSpark(s, t);
      });
      bills.forEach((b) => {
        b.y += b.speed;
        b.x += b.drift + Math.sin(b.swayPhase + t * 0.012) * b.swayAmp * 0.4;
        b.rot += b.rotSpeed;
        if (b.y > canvas.height + 60) Object.assign(b, makeBill(false));
        drawBill(b);
      });
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />;
}
