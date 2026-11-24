// Generates the Foundy Flashcards PWA icons (PNG) and favicon (SVG) with no
// native dependencies: shapes are rasterised with 4x4 supersampling and
// encoded with node:zlib. Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PURPLE = [124, 58, 237];
const PURPLE_DARK = [91, 33, 182];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
// Signed-distance test for a rotated rounded rectangle (unit coords 0..1).
function inRoundRect(px, py, r) {
  const { cx, cy, w, h, rad, angle = 0 } = r;
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const dx = px - cx, dy = py - cy;
  const x = dx * cos - dy * sin, y = dx * sin + dy * cos;
  const qx = Math.abs(x) - (w / 2 - rad), qy = Math.abs(y) - (h / 2 - rad);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rad <= 0;
}
function render(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = maskable ? 0 : 0.0;
  const bg = { cx: 0.5, cy: 0.5, w: 1 - pad * 2, h: 1 - pad * 2, rad: maskable ? 0 : 0.22 };
  const s = maskable ? 0.78 : 1; // keep glyph inside the maskable safe zone
  const back = { cx: 0.5 + 0.06 * s, cy: 0.47 - 0.03 * s, w: 0.5 * s, h: 0.36 * s, rad: 0.06 * s, angle: -0.18 };
  const front = { cx: 0.5 - 0.03 * s, cy: 0.54, w: 0.52 * s, h: 0.37 * s, rad: 0.06 * s, angle: 0.06 };
  const line1 = { cx: 0.5 - 0.06 * s, cy: 0.5, w: 0.26 * s, h: 0.04 * s, rad: 0.02 * s, angle: 0.06 };
  const line2 = { cx: 0.5 - 0.09 * s, cy: 0.585, w: 0.2 * s, h: 0.04 * s, rad: 0.02 * s, angle: 0.06 };
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = (x + (sx + 0.5) / SS) / size, py = (y + (sy + 0.5) / SS) / size;
        let c = null, ca = 0;
        if (inRoundRect(px, py, bg)) {
          const t = py; // subtle vertical shade
          c = PURPLE.map((v, i) => Math.round(v * (1 - t * 0.25) + PURPLE_DARK[i] * t * 0.25)); ca = 255;
          if (inRoundRect(px, py, back)) c = c.map((v) => Math.round(v * 0.45 + 255 * 0.55));
          if (inRoundRect(px, py, front)) c = [255, 255, 255];
          if (inRoundRect(px, py, line1) || inRoundRect(px, py, line2)) c = PURPLE;
        }
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += ca; }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      const cov = a / 255;
      buf[i] = cov ? Math.round(r / cov) : 0;
      buf[i + 1] = cov ? Math.round(g / cov) : 0;
      buf[i + 2] = cov ? Math.round(b / cov) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, buf);
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/icon-512-maskable.png', render(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', render(180, { maskable: true }));
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#7c3aed"/>
  <rect x="19" y="13" width="32" height="23" rx="4" fill="#c4b0f7" transform="rotate(-10 35 24.5)"/>
  <rect x="13" y="23" width="33" height="24" rx="4" fill="#fff" transform="rotate(3.5 29.5 35)"/>
  <rect x="17" y="30.5" width="17" height="2.6" rx="1.3" fill="#7c3aed" transform="rotate(3.5 25.5 31.8)"/>
  <rect x="17" y="36" width="13" height="2.6" rx="1.3" fill="#7c3aed" transform="rotate(3.5 23.5 37.3)"/>
</svg>
`);
console.log('icons written');
