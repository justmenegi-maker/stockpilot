// StockPilot PWA icon generator — zero dependencies (Node built-ins only).
// Draws the StockPilot package icon (indigo gradient, white box with seam+tape)
// and encodes it as PNGs via a minimal built-in PNG writer.
//
//   node scripts/gen-icons.js   →  icons/icon-192.png, icons/icon-512.png,
//                                  icons/maskable-192.png, icons/maskable-512.png
//
// Deterministic output; safe to re-run. 2x supersampling for smooth edges.

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------- Minimal PNG encoder (RGBA, 8-bit) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  // raw scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- Drawing (unit coordinates 0..1, supersampled) ----------
// Signed distance to a rounded rectangle centered at (cx, cy), half-sizes hw/hh.
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function lerp(a, b, t) { return a + (b - a) * t; }

// Gradient: top #6366f1 → bottom #4338ca (indigo, matches app brand)
function bgColor(y) {
  return [lerp(0x63, 0x43, y), lerp(0x66, 0x38, y), lerp(0xf1, 0xca, y)];
}
const ACCENT = [0x4f, 0x46, 0xe5]; // seam + tape
const WHITE = [0xff, 0xff, 0xff];

// Box pictogram: white rounded box with an indigo horizontal seam and vertical tape.
function drawUnit(px, py, maskable) {
  // Background
  const bgR = maskable ? 0 : 0.22; // maskable icons must be full-bleed (no transparency)
  const inBg = maskable || roundedRectSDF(px, py, 0.5, 0.5, 0.5, 0.5, bgR) <= 0;
  if (!inBg) return [0, 0, 0, 0];

  // Pictogram geometry (maskable keeps the box inside the 80% safe zone)
  const s = maskable ? 0.78 : 1;
  const hw = 0.28 * s, hh = 0.24 * s;
  const inBox = roundedRectSDF(px, py, 0.5, 0.5, hw, hh, 0.05 * s) <= 0;

  let col = bgColor(py);
  if (inBox) {
    col = WHITE;
    const inSeam = py >= 0.5 - 0.115 * s && py <= 0.5 - 0.06 * s;           // lid seam band
    const inTape = Math.abs(px - 0.5) <= 0.03 * s;                          // vertical tape strip
    if (inSeam || inTape) col = ACCENT;
  }
  return [col[0], col[1], col[2], 255];
}

function render(size, maskable) {
  const SS = 2; // 2x2 supersampling
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = drawUnit((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, maskable);
          // straight-alpha blend of samples
          const w = c[3] / 255;
          r += c[0] * w; g += c[1] * w; b += c[2] * w; a += c[3];
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      const aw = a / n / 255;
      buf[i] = aw > 0 ? Math.round(r / n / (aw)) : 0;
      buf[i + 1] = aw > 0 ? Math.round(g / n / (aw)) : 0;
      buf[i + 2] = aw > 0 ? Math.round(b / n / (aw)) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, buf);
}

// ---------- Main ----------
const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-192.png", size: 192, maskable: true },
  { file: "maskable-512.png", size: 512, maskable: true },
];
for (const j of jobs) {
  const png = render(j.size, j.maskable);
  fs.writeFileSync(path.join(outDir, j.file), png);
  console.log("wrote icons/" + j.file + " (" + png.length + " bytes)");
}
