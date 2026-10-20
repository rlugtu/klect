// Flat config, matching the shape web (`eslint-config-next`) and mobile
// (`eslint-config-expo`) use — neither of those presets applies to a Vite MV3 extension,
// so this is the equivalent built from typescript-eslint + the React Hooks plugin.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist/**", "dist-dev/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      // The popup is a DOM page; the service worker shares that global shape closely
      // enough for linting, and `chrome.*` comes from @types/chrome, not from globals.
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
  {
    // The build config and the manifest source run in Node, not the browser.
    files: ["vite.config.ts", "manifest.config.ts"],
    languageOptions: { globals: globals.node },
  },
]);
