/**
 * The MV3 manifest, generated per environment from this one source.
 *
 * Per-environment rather than a checked-in `manifest.json` because dev needs
 * `host_permissions` for `http://localhost:3000/*` and a published build must not ship a
 * localhost permission (a Web Store review flag, and a real if small attack surface). The
 * API base URL is threaded through as a build-time variable the way mobile threads
 * `EXPO_PUBLIC_API_URL`, and both the manifest and the tRPC client read that same value,
 * so the host permission can never disagree with the URL the client actually calls.
 *
 * Emitted into `dist/manifest.json` by the `klect-manifest` plugin in vite.config.ts.
 */

export type ManifestEnv = {
  /** API origin, e.g. `https://klect.app`. */
  apiUrl: string;
  /** Extension version — taken from package.json so there is one number to bump. */
  version: string;
  /** True for a development build (localhost API, distinct name so both can be loaded). */
  dev: boolean;
};

export function buildManifest({ apiUrl, version, dev }: ManifestEnv) {
  const { origin } = new URL(apiUrl);

  return {
    manifest_version: 3,
    name: dev ? "Klect (dev)" : "Klect",
    version,
    description: "Save the page you're on into your Klect lists.",

    // The `cookies` + host pair is what makes the whole transport work: the service
    // worker reads the user's own better-auth session cookie for klect.app and
    // sends it as a Bearer token (docs/ARCHITECTURE.md §5). `storage` is here for the
    // list cache Stage 3 adds. `activeTab` — not the much broader `tabs` — is sufficient
    // because the popup only ever opens on a user gesture, and reading the active tab's
    // url/title at that moment is exactly what `activeTab` grants.
    permissions: ["cookies", "storage", "activeTab"],

    // Grants the service worker its CORS exemption for the API origin. MV3 extension
    // pages are exempt from page-level CORS for origins declared here; content scripts
    // are NOT, and `/api/trpc` has no CORS configuration at all — which is why every
    // network call in this extension originates in the service worker.
    host_permissions: [`${origin}/*`],

    background: {
      service_worker: "assets/background.js",
      type: "module",
    },

    // A popup, not a side panel (the locked-in decision). Deliberately no `side_panel`
    // key and no `contentScripts`/`content_scripts` key at all.
    action: {
      default_popup: "popup.html",
      default_title: "Save to Klect",
    },
  };
}
