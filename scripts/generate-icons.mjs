// Regenerates every app icon from the one Caliber watch mark (the same
// geometry as components/Logo.tsx), rendered in the LUME palette on true
// black — case, crown, and lugs in accent #b8f24e, hands in accent-soft
// #d2ff7a, with a soft lume glow behind the dial.
//
// Run `node scripts/generate-icons.mjs` after any palette or mark change,
// then commit the regenerated binaries. Outputs:
//   public/icon-192.png            192×192  (manifest + <link rel=icon>)
//   public/icon-512.png            512×512  (manifest + <link rel=icon>)
//   public/icon-maskable-512.png   512×512  (manifest, purpose: maskable —
//                                  mark shrunk into the 80% safe zone)
//   public/apple-touch-icon.png    180×180  (iOS home screen, opaque)
//   app/favicon.ico                16+32+48 (PNG-compressed ICO container)

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const BG = "#050506";
const ACCENT = "#b8f24e";
const ACCENT_SOFT = "#d2ff7a";

// The Logo.tsx mark in a 48-unit frame. `pad` grows the frame around it
// (for the maskable safe zone); `sw` fattens strokes at tiny favicon sizes.
function markSvg({ pad = 0, sw = 2 } = {}) {
  const o = -pad;
  const size = 48 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o} ${o} ${size} ${size}">
  <defs>
    <radialGradient id="lume" cx="50%" cy="46%" r="55%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="${o}" y="${o}" width="${size}" height="${size}" fill="${BG}"/>
  <circle cx="24" cy="24" r="21" fill="url(#lume)"/>
  <circle cx="24" cy="24" r="15" stroke="${ACCENT}" stroke-width="${sw}" fill="none"/>
  <circle cx="24" cy="24" r="1.8" fill="${ACCENT}"/>
  <rect x="38" y="21.5" width="5" height="5" rx="1.2" fill="${ACCENT}"/>
  <path d="M17 10l2 4M31 10l-2 4M17 38l2-4M31 38l-2-4" stroke="${ACCENT}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>
  <path d="M24 24V15M24 24l6 3" stroke="${ACCENT_SOFT}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>
</svg>`;
}

function renderPng(size, opts) {
  return sharp(Buffer.from(markSvg(opts)), { density: 300 })
    .resize(size, size)
    .png()
    .toBuffer();
}

// ICO container with PNG-compressed entries (valid since Windows Vista;
// what browsers actually read).
function packIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dirs = [];
  const blobs = [];
  let offset = 6 + entries.length * 16;
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0); // width
    dir.writeUInt8(size >= 256 ? 0 : size, 1); // height
    dir.writeUInt8(0, 2); // palette
    dir.writeUInt8(0, 3); // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(dir);
    blobs.push(png);
  }
  return Buffer.concat([header, ...dirs, ...blobs]);
}

const out = (...p) => path.join(ROOT, ...p);

await fs.writeFile(out("public", "icon-192.png"), await renderPng(192));
await fs.writeFile(out("public", "icon-512.png"), await renderPng(512));
// Maskable: launchers may crop to a circle of 40% of the edge — pad the
// frame so the crown (the widest point) stays comfortably inside it.
await fs.writeFile(out("public", "icon-maskable-512.png"), await renderPng(512, { pad: 9 }));
await fs.writeFile(out("public", "apple-touch-icon.png"), await renderPng(180));
await fs.writeFile(
  out("app", "favicon.ico"),
  packIco([
    { size: 16, png: await renderPng(16, { sw: 3.2 }) },
    { size: 32, png: await renderPng(32, { sw: 2.6 }) },
    { size: 48, png: await renderPng(48, { sw: 2.2 }) },
  ])
);

console.log("icons regenerated: public/icon-*.png, public/apple-touch-icon.png, app/favicon.ico");
