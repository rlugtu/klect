// Generates the Expo source icons/splash from the Klect logo glyph.
// Run: node scripts/gen-icons.mjs   (then `npx expo prebuild --clean`)
//
// Dev-only tooling: `sharp` isn't a mobile dependency, so we borrow it from the
// sibling web app (which bundles it). This never ships in the app bundle.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const sharp = require(path.resolve(root, "../web/node_modules/sharp"));

const BG = "#111111"; // logo background (from the source SVG)
const INK = "#F7F6F3"; // bookmark glyph

const BOOKMARK = `M352 220 C352 193 373 172 400 172 H624 C651 172 672 193 672 220 V702 C672 721 651 731 636 720 L512 628 L388 720 C373 731 352 721 352 702 Z`;

// Glyph on a full-bleed background, `scale` shrinks it around the center.
function onBg(scale = 1, ink = INK, bg = BG) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${bg}"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <path d="${BOOKMARK}" fill="${ink}"/>
  </g>
</svg>`;
}

// Glyph only, transparent background (for Android foreground / splash / mono).
function glyphOnly(scale = 1, ink = INK) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <path d="${BOOKMARK}" fill="${ink}"/>
  </g>
</svg>`;
}

// Solid color square (Android adaptive-icon background layer).
function solid(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${color}"/></svg>`;
}

const img = (name) => path.join(root, "assets/images", name);

async function write(svg, size, file, { trim = false } = {}) {
  let pipe = sharp(Buffer.from(svg)).resize(size, size);
  if (trim) pipe = sharp(await pipe.png().toBuffer()).trim();
  await pipe.png().toFile(file);
  console.log(`wrote ${path.relative(root, file)}`);
}

// Main app icon — full-bleed, opaque (iOS masks its own corners).
await write(onBg(1), 1024, img("icon.png"));
// Android adaptive icon layers (foreground glyph inside the safe zone).
await write(glyphOnly(0.72), 512, img("android-icon-foreground.png"));
await write(solid(BG), 512, img("android-icon-background.png"));
await write(glyphOnly(0.72, "#FFFFFF"), 432, img("android-icon-monochrome.png"));
// Splash logo — glyph only, tightly cropped (Expo sizes it via imageWidth).
await write(glyphOnly(1), 1024, img("splash-icon.png"), { trim: true });
// Web favicon.
await write(onBg(1), 48, img("favicon.png"));
