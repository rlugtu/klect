// Generates PWA icons from inline SVG using sharp (bundled with Next).
// Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const BG = "#14142b";
const PRIMARY = "#6c8cff";
const BORDER = "#0b0b1a";
const INK = "#eae6ff";

// "any" icon — bookmark ribbon fills most of the canvas.
const anySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <path d="M150 88 H362 V432 L256 356 L150 432 Z" fill="${PRIMARY}" stroke="${BORDER}" stroke-width="16" stroke-linejoin="miter"/>
  <rect x="186" y="140" width="140" height="26" fill="${INK}"/>
  <rect x="186" y="196" width="96" height="26" fill="${INK}"/>
</svg>`;

// "maskable" icon — same glyph, smaller, inside the safe zone with full-bleed bg.
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <path d="M196 150 H316 V366 L256 322 L196 366 Z" fill="${PRIMARY}" stroke="${BORDER}" stroke-width="12" stroke-linejoin="miter"/>
</svg>`;

const targets = [
  { svg: anySvg, size: 192, file: "public/icon-192.png" },
  { svg: anySvg, size: 512, file: "public/icon-512.png" },
  { svg: maskableSvg, size: 192, file: "public/icon-maskable-192.png" },
  { svg: maskableSvg, size: 512, file: "public/icon-maskable-512.png" },
  { svg: anySvg, size: 180, file: "public/apple-icon.png" },
];

await mkdir("public", { recursive: true });

for (const { svg, size, file } of targets) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(file);
  console.log(`wrote ${file} (${size}x${size})`);
}
