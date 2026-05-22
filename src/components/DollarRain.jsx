import { useRef, useEffect } from "react";

export default function DollarRain() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const BILL_COUNT = 28;
    const makeBill = (initial) => {
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
      };
    };

    const bills = Array.from({ length: BILL_COUNT }, () => makeBill(true));

    const drawBill = (b) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = b.alpha;
      const hw = b.w / 2, hh = b.h / 2, r = 2.5;
      ctx.beginPath();
      ctx.moveTo(-hw + r, -hh);
      ctx.lineTo(hw - r, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
      ctx.lineTo(hw, hh - r);
      ctx.quadraticCurveTo(hw, hh, hw - r, hh);
      ctx.lineTo(-hw + r, hh);
      ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
      ctx.lineTo(-hw, -hh + r);
      ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
      ctx.closePath();
      ctx.fillStyle = "#78350f";
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.strokeStyle = "rgba(245,158,11,0.35)";
      ctx.lineWidth = 0.35;
      ctx.strokeRect(-hw + 3.5, -hh + 2.5, b.w - 7, b.h - 5);
      ctx.fillStyle = "#fde68a";
      ctx.font = `bold ${b.h * 0.58}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 0);
      ctx.restore();
    };

    let raf;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bills.forEach((b) => {
        b.y += b.speed;
        b.x += b.drift;
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
