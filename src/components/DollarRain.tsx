// Animación de fondo: billetes cayendo con vaivén + chispas doradas en canvas.
// Solo se muestra en tema oscuro (GlobalStyles oculta el canvas con
// .theme-light canvas { display: none }). Respeta prefers-reduced-motion.
//
// Dos decisiones que la hacen funcionar en una pantalla grande:
//
// 1. La cantidad sale de la SUPERFICIE, no es un número fijo. Con 28 billetes clavados,
//    una pantalla de 1826×1000 tiene 5,5 veces el área de un teléfono y la misma cantidad
//    de billetes: se dispersaban tanto que el fondo parecía apagado.
// 2. Cada billete y cada chispa se dibujan UNA vez en un sprite y después se estampan con
//    `drawImage`. Antes cada billete rehacía su contorno (cuatro curvas), dos trazos y un
//    `fillText` en cada frame, y cada chispa creaba un degradado radial nuevo —
//    construir degradados dentro del bucle de animación es de lo más caro que hay en
//    canvas 2D. Con sprites, subir de 28 a 120 billetes sale más barato que los 28 de
//    antes.
import { useRef, useEffect } from "react";
import { hayOverlay, onOverlayChange } from "../lib/overlay.js";

interface DollarRainProps {
  /** `undefined` sigue la preferencia del sistema; `true`/`false` la pisan. */
  animated?: boolean;
}

interface Bill {
  x: number; y: number; w: number; h: number;
  speed: number; alpha: number; rot: number; rotSpeed: number;
  drift: number; swayPhase: number; swayAmp: number;
}

interface Spark {
  x: number; y: number; r: number;
  phase: number; twinkle: number; driftY: number;
}

/** Un billete por cada tanto de superficie, con techo para que no se vuelva un enjambre. */
const AREA_POR_BILLETE = 11_000;
const BILLETES_MIN = 24;
const BILLETES_MAX = 120;
/** Ancho del sprite: el doble del billete más grande, para que no se note al escalar. */
const SPRITE_W = 160;
const SPARK_SPRITE = 48;

function spriteBillete(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const w = SPRITE_W, h = Math.round(SPRITE_W * 0.44);
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const hw = w / 2, hh = h / 2, r = (2.5 / 46) * w;
  g.translate(hw, hh);
  g.beginPath();
  g.moveTo(-hw + r, -hh); g.lineTo(hw - r, -hh);
  g.quadraticCurveTo(hw, -hh, hw, -hh + r); g.lineTo(hw, hh - r);
  g.quadraticCurveTo(hw, hh, hw - r, hh); g.lineTo(-hw + r, hh);
  g.quadraticCurveTo(-hw, hh, -hw, hh - r); g.lineTo(-hw, -hh + r);
  g.quadraticCurveTo(-hw, -hh, -hw + r, -hh); g.closePath();
  g.fillStyle = "#78350f"; g.fill();
  g.strokeStyle = "#f59e0b"; g.lineWidth = (0.7 / 46) * w; g.stroke();
  g.strokeStyle = "rgba(245,158,11,0.35)"; g.lineWidth = (0.35 / 46) * w;
  g.strokeRect(-hw + (3.5 / 46) * w, -hh + (2.5 / 46) * w, w - (7 / 46) * w, h - (5 / 46) * w);
  g.fillStyle = "#fde68a";
  g.font = `bold ${h * 0.58}px Georgia, serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("$", 0, 0);
  return c;
}

function spriteChispa(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SPARK_SPRITE;
  const g = c.getContext("2d")!;
  const m = SPARK_SPRITE / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, "rgba(253,230,138,0.9)");
  glow.addColorStop(1, "rgba(253,230,138,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.fill();
  return c;
}

export default function DollarRain({ animated }: DollarRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Con las animaciones reducidas el fondo se dibuja UNA vez y se queda quieto, en vez
    // de no dibujarse. Antes se salía acá mismo y el canvas quedaba transparente para
    // siempre: en una máquina con los efectos de Windows apagados —que es lo que Chrome
    // informa como `prefers-reduced-motion: reduce`— no había ni un billete, y desde
    // afuera se veía como si la animación estuviera rota. Lo que molesta de este fondo es
    // el movimiento, no los billetes.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mover = animated ?? !reduce;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const bill = spriteBillete();
    const spark = spriteChispa();

    // Ancho y alto en píxeles CSS; el canvas se dibuja a `dpr` para que el "$" no salga
    // borroso en pantallas escaladas, topeado en 1.5 porque cada paso multiplica los
    // píxeles a pintar por su cuadrado.
    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const makeBill = (initial: boolean): Bill => {
      const w = Math.random() * 46 + 26;
      return {
        x: Math.random() * W,
        y: initial ? Math.random() * H : -50,
        w, h: w * 0.44,
        speed: Math.random() * 0.65 + 0.22,
        alpha: Math.random() * 0.13 + 0.05,
        rot: (Math.random() - 0.5) * 0.55,
        rotSpeed: (Math.random() - 0.5) * 0.006,
        drift: (Math.random() - 0.5) * 0.16,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: Math.random() * 0.35 + 0.1,
      };
    };

    const makeSpark = (): Spark => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.5,
      phase: Math.random() * Math.PI * 2,
      twinkle: Math.random() * 0.015 + 0.006,
      driftY: -(Math.random() * 0.08 + 0.02),
    });

    const cuantos = () =>
      Math.round(Math.min(BILLETES_MAX, Math.max(BILLETES_MIN, (W * H) / AREA_POR_BILLETE)));

    let bills: Bill[] = [];
    let sparks: Spark[] = [];
    const poblar = () => {
      const n = cuantos();
      while (bills.length > n) bills.pop();
      while (bills.length < n) bills.push(makeBill(true));
      const s = Math.round(n * 0.8);
      while (sparks.length > s) sparks.pop();
      while (sparks.length < s) sparks.push(makeSpark());
    };

    resize();
    poblar();
    // Al cambiar el tamaño de la ventana las posiciones se remapean en proporción. Sin
    // esto, al achicar quedaban casi todos los billetes fuera del borde derecho y el
    // fondo se vaciaba hasta que cada uno terminara de caer y volviera a nacer.
    const onResize = () => {
      const prevW = W, prevH = H;
      resize();
      if (prevW > 0 && prevH > 0) {
        const fx = W / prevW, fy = H / prevH;
        for (const b of bills) { b.x *= fx; b.y *= fy; }
        for (const s of sparks) { s.x *= fx; s.y *= fy; }
      }
      poblar();
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let t = 0;
    const animate = () => {
      t += 1;
      ctx.clearRect(0, 0, W, H);

      for (const s of sparks) {
        s.y += s.driftY;
        if (s.y < -10) { s.y = H + 10; s.x = Math.random() * W; }
        const a = Math.max(0, Math.sin(s.phase + t * s.twinkle)) * 0.35;
        if (a < 0.01) continue;
        const d = s.r * 8;
        ctx.globalAlpha = a;
        ctx.drawImage(spark, s.x - d / 2, s.y - d / 2, d, d);
      }

      for (const b of bills) {
        b.y += b.speed;
        b.x += b.drift + Math.sin(b.swayPhase + t * 0.012) * b.swayAmp * 0.4;
        b.rot += b.rotSpeed;
        if (b.y > H + 60) Object.assign(b, makeBill(false));
        ctx.globalAlpha = b.alpha;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.drawImage(bill, -b.w / 2, -b.h / 2, b.w, b.h);
        ctx.rotate(-b.rot);
        ctx.translate(-b.x, -b.y);
      }

      ctx.globalAlpha = 1;
      if (corriendo) raf = requestAnimationFrame(animate);
    };

    // Mientras hay un sheet o el buscador abiertos, el fondo se frena. Esas capas tapan
    // la pantalla con un desenfoque, y desenfocar encima de un canvas que se mueve obliga
    // al navegador a rehacer el desenfoque de TODO en cada frame: con el detalle de un
    // préstamo abierto aparecían frames de 50-67 ms contra 18 ms con el sheet cerrado.
    // Detrás del overlay no se ve nada, así que frenarlo no se nota.
    let corriendo = false;
    const arrancar = () => {
      if (corriendo || !mover) return;
      corriendo = true;
      raf = requestAnimationFrame(animate);
    };
    const frenar = () => {
      corriendo = false;
      cancelAnimationFrame(raf);
    };

    if (mover) {
      // Un cuadro siempre, aunque arranque tapado: si no, al cerrar la capa el fondo
      // aparecería de golpe desde el negro.
      animate();
      if (!hayOverlay()) arrancar();
    } else {
      // Quieto: un solo cuadro. Se redibuja al cambiar el tamaño para no quedar estirado.
      animate();
      window.addEventListener("resize", animate);
    }

    const desuscribir = onOverlayChange((hay) => { if (hay) frenar(); else arrancar(); });

    return () => {
      frenar();
      desuscribir();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("resize", animate);
    };
  }, [animated]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
