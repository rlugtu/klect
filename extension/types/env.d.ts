/// <reference types="vite/client" />

/**
 * The API base URL is threaded in at build time the way mobile threads
 * `EXPO_PUBLIC_API_URL`: one source (`manifest.config.ts` + `vite.config.ts`) fills both
 * the manifest's `host_permissions` and the client's request URL, so the two can never
 * disagree. Declared as a plain `string` because vite.config.ts always substitutes a
 * value (the per-mode default when `.env` sets none).
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
