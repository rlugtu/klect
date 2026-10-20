import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { buildManifest } from "./manifest.config";

const root = import.meta.dirname;

const pkg = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
) as { version: string };

const PROD_API_URL = "https://klect.vercel.app";
const DEV_API_URL = "http://localhost:3000";

/** Emits `dist/manifest.json` from the single manifest source, per environment. */
function manifestPlugin(apiUrl: string, dev: boolean): Plugin {
  return {
    name: "klect-manifest",
    generateBundle() {
      const manifest = buildManifest({ apiUrl, version: pkg.version, dev });
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const dev = mode !== "production";
  const env = loadEnv(mode, root, "VITE_");
  const apiUrl = env.VITE_API_URL || (dev ? DEV_API_URL : PROD_API_URL);

  return {
    root,
    plugins: [react(), tailwindcss(), manifestPlugin(apiUrl, dev)],

    // Only the extension's own `@/` — deliberately NOT `@web/*`. That alias exists for
    // tsc alone (a type-only import, erased at compile time); leaving it unresolvable at
    // bundle time means an accidental *runtime* import of web's server code fails the
    // build loudly instead of being quietly bundled into the extension.
    resolve: {
      alias: { "@": resolve(root, "src") },
    },

    // One value feeds both the manifest's host permission and the client's request URL.
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
    },

    build: {
      outDir: dev ? "dist-dev" : "dist",
      emptyOutDir: true,
      sourcemap: dev,
      // Chrome is the only target (v1 decision), so no legacy transpilation.
      target: "chrome116",
      rollupOptions: {
        input: {
          popup: resolve(root, "popup.html"),
          background: resolve(root, "src/background/index.ts"),
        },
        output: {
          // ES modules, matching `background.type: "module"` in the manifest.
          format: "es",
          // Entry names are unhashed so the manifest can point at a stable path.
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
