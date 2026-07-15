// Generates PWA icons from inline SVG using sharp (bundled with Next).
// Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const BG = "#111111"; // logo background (from the source SVG)
const INK = "#F7F6F3"; // bookmark glyph

// The Klect bookmark glyph, in a 1024x1024 space (centered).
const BOOKMARK = `M352 220 C352 193 373 172 400 172 H624 C651 172 672 193 672 220 V702 C672 721 651 731 636 720 L512 628 L388 720 C373 731 352 721 352 702 Z`;

// Compose the glyph on a full-bleed background. `scale` shrinks the glyph
// around the center to leave safe-zone padding (for maskable/adaptive icons).
function icon(scale = 1) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <path d="${BOOKMARK}" fill="${INK}"/>
  </g>
</svg>`;
}

// "any" fills the canvas; "maskable" pulls the glyph into the safe zone.
const anySvg = icon(1);
const maskableSvg = icon(0.78);

const targets = [
  { svg: anySvg, size: 192, file: "public/icon-192.png" },
  { svg: anySvg, size: 512, file: "public/icon-512.png" },
  { svg: maskableSvg, size: 192, file: "public/icon-maskable-192.png" },
  { svg: maskableSvg, size: 512, file: "public/icon-maskable-512.png" },
  { svg: anySvg, size: 180, file: "public/apple-icon.png" },
  // Next.js App Router convention: src/app/icon.png becomes the tab favicon.
  { svg: anySvg, size: 32, file: "src/app/icon.png" },
];

await mkdir("public", { recursive: true });

for (const { svg, size, file } of targets) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(file);
  console.log(`wrote ${file} (${size}x${size})`);
}
