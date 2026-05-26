/**
 * Genera pwa-icon-192.png y pwa-icon-512.png en /public
 * sin dependencias externas — solo Node.js builtins (zlib).
 * Ejecutar con: node scripts/gen-icons.mjs
 */
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0);
}

function chunk(type, data) {
  const tb = Buffer.from(type, "ascii");
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length, 0);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([lb, tb, data, cb]);
}

function makePNG(size, drawFn) {
  const raw = Buffer.allocUnsafe((1 + size * 3) * size);
  for (let y = 0; y < size; y++) {
    const base = y * (1 + size * 3);
    raw[base] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = drawFn(x, y, size);
      raw[base + 1 + x * 3] = r;
      raw[base + 2 + x * 3] = g;
      raw[base + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRoundRect(x, y, size, r) {
  const x1 = r, x2 = size - r, y1 = r, y2 = size - r;
  if (x < 0 || x >= size || y < 0 || y >= size) return false;
  if (x < x1 && y < y1) return (x - x1) ** 2 + (y - y1) ** 2 <= r * r;
  if (x >= x2 && y < y1) return (x - x2) ** 2 + (y - y1) ** 2 <= r * r;
  if (x < x1 && y >= y2) return (x - x1) ** 2 + (y - y2) ** 2 <= r * r;
  if (x >= x2 && y >= y2) return (x - x2) ** 2 + (y - y2) ** 2 <= r * r;
  return true;
}

function drawIcon(x, y, size) {
  const BG = [13, 10, 7];
  const INNER = [26, 18, 8];
  const AMBER = [245, 158, 11];

  if (!insideRoundRect(x, y, size, size * 0.25)) return BG;

  const cx = size / 2, cy = size / 2;

  // Outer ring
  const innerR = size * 0.35, outerR = size * 0.36;
  const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (d < innerR) {
    // inner circle background
  } else if (d <= outerR) {
    return [80, 58, 16]; // dim amber ring
  }

  // Fill inner circle with INNER color
  if (d < innerR) {
    // fall through to draw $ symbol
  }

  const s = size / 512;

  // Vertical bar: centered, height ~50% of icon
  const barW = 30 * s, barH = 256 * s;
  const barX = cx - barW / 2, barY = cy - barH / 2;
  if (x >= barX && x < barX + barW && y >= barY && y < barY + barH) {
    return AMBER;
  }

  // Top arc: centered at (cx, cy - 52*s), radius 108*s, upper half only
  const topArcCY = cy - 52 * s;
  const topR = 108 * s;
  const strokeW = 28 * s;
  const dTop = Math.sqrt((x - cx) ** 2 + (y - topArcCY) ** 2);
  if (Math.abs(dTop - topR) < strokeW / 2 && y < topArcCY + 8 * s) {
    return AMBER;
  }

  // Bottom arc: centered at (cx, cy + 52*s), radius 108*s, lower half only
  const botArcCY = cy + 52 * s;
  const dBot = Math.sqrt((x - cx) ** 2 + (y - botArcCY) ** 2);
  if (Math.abs(dBot - topR) < strokeW / 2 && y > botArcCY - 8 * s) {
    return AMBER;
  }

  if (d < innerR) return INNER;
  return BG;
}

try { mkdirSync("./public", { recursive: true }); } catch {}

writeFileSync("./public/pwa-icon-192.png", makePNG(192, drawIcon));
writeFileSync("./public/pwa-icon-512.png", makePNG(512, drawIcon));
console.log("✓ public/pwa-icon-192.png");
console.log("✓ public/pwa-icon-512.png");
