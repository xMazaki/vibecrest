/**
 * Génère les icônes de Vibe Crest sans dépendance ni fichier binaire versionné.
 *
 * Le rendu passe par des fonctions de distance signée suréchantillonnées, ce qui
 * donne un anticrénelage propre à 16 pixels, taille réelle d'affichage dans la
 * zone de notification de Windows.
 */

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build");

/* ---------- encodage PNG ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tag = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([len, tag, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filtre None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- primitives de dessin ---------- */

const SS = 4; // suréchantillonnage

function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function sdCircle(px, py, cx, cy, radius) {
  return Math.hypot(px - cx, py - cy) - radius;
}

function hex(value) {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function render(size, shapes) {
  const buf = Buffer.alloc(size * size * 4);
  const samples = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // Composition source-over de ce sous-pixel seul, les formes étant
          // déclarées de l'arrière vers l'avant.
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          for (const shape of shapes) {
            if (shape.sd(px, py) > 0) continue;
            const [sr, sg, sb] = shape.rgb;
            const sa = shape.alpha ?? 1;
            const inv = 1 - sa;
            r = sr * sa + r * inv;
            g = sg * sa + g * inv;
            b = sb * sa + b * inv;
            a = sa + a * inv;
          }

          accR += r;
          accG += g;
          accB += b;
          accA += a;
        }
      }

      // L'anticrénelage naît de la moyenne des sous-pixels couverts.
      const alpha = accA / samples;
      const o = (y * size + x) * 4;
      buf[o] = alpha > 0 ? Math.round(accR / samples / alpha) : 0;
      buf[o + 1] = alpha > 0 ? Math.round(accG / samples / alpha) : 0;
      buf[o + 2] = alpha > 0 ? Math.round(accB / samples / alpha) : 0;
      buf[o + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  return buf;
}

/* ---------- icônes ---------- */

/* Même direction artistique que l'interface : monochrome chaud, l'or réservé
   aux états qui réclament l'utilisateur. */
const STATUS = {
  idle: "#6E6961",
  working: "#CFC9BE",
  waiting: "#D8A544",
  attention: "#ECC06B",
};

function trayShapes(size, dotColor) {
  const c = size / 2;
  const barW = size * 0.78;
  const barH = size * 0.34;
  const shell = hex("#968E82");
  const dot = hex(dotColor);
  return [
    {
      sd: (x, y) => sdRoundRect(x, y, c, c, barW / 2, barH / 2, barH / 2),
      rgb: shell,
      alpha: 1,
    },
    {
      sd: (x, y) => sdCircle(x, y, c + barW * 0.24, c, barH * 0.28),
      rgb: dot,
      alpha: 1,
    },
  ];
}

function appShapes(size) {
  const c = size / 2;
  const barW = size * 0.62;
  const barH = size * 0.26;
  return [
    {
      sd: (x, y) => sdRoundRect(x, y, c, c, size * 0.46, size * 0.46, size * 0.22),
      rgb: hex("#0A0908"),
      alpha: 1,
    },
    {
      sd: (x, y) => sdRoundRect(x, y, c, c, barW / 2, barH / 2, barH / 2),
      rgb: hex("#ECE7DD"),
      alpha: 1,
    },
    {
      sd: (x, y) => sdCircle(x, y, c + barW * 0.26, c, barH * 0.3),
      rgb: hex("#D8A544"),
      alpha: 1,
    },
  ];
}

fs.mkdirSync(OUT, { recursive: true });

for (const [status, color] of Object.entries(STATUS)) {
  const size = 32;
  const png = encodePng(size, size, render(size, trayShapes(size, color)));
  fs.writeFileSync(path.join(OUT, `tray-${status}.png`), png);
}

const iconSize = 256;
fs.writeFileSync(
  path.join(OUT, "icon.png"),
  encodePng(iconSize, iconSize, render(iconSize, appShapes(iconSize)))
);

console.log(`Icônes écrites dans ${OUT}`);
