import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

/** Base URL of the web app, which hosts the better-auth server + tRPC API. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Bearer session token for authenticating API calls.
 *
 * We can't rely on the session **cookie** for the tRPC client: in an iOS release build over
 * HTTPS the native networking layer intercepts `Secure` Set-Cookie headers into its own store,
 * so `@better-auth/expo` never captures them and `authClient.getCookie()` comes back empty —
 * which is why TestFlight requests were rejected as "Sign in required". Instead the web server
 * runs better-auth's `bearer()` plugin, which emits the session token in a plain `set-auth-token`
 * response header (not swallowed by the cookie machinery) and accepts `Authorization: Bearer`.
 *
 * We mirror the token in memory (sync reads for request headers) and in SecureStore (survives
 * restarts). `fetchOptions.onSuccess` below refreshes it whenever better-auth rotates it.
 */
const BEARER_KEY = "klect_bearer";
let cachedToken: string | null = null;

// Hydrate the in-memory token on startup (async; the tRPC client falls back to a direct
// SecureStore read for the cold-start race before this resolves).
SecureStore.getItemAsync(BEARER_KEY)
  .then((t) => {
    if (t) cachedToken = t;
  })
  .catch(() => {});

export const getBearerToken = () => cachedToken;

/** Drop the stored bearer token (call on sign-out). */
export function clearBearerToken() {
  cachedToken = null;
  SecureStore.deleteItemAsync(BEARER_KEY).catch(() => {});
}

/**
 * better-auth client for the native app — same auth server web uses, but with the
 * Expo plugin (tokens in expo-secure-store, deep-link `scheme` for OAuth). Web uses
 * better-auth/react against this same server.
 *
 * `inferAdditionalFields` mirrors the `user.additionalFields` web declares in
 * `web/src/lib/auth.ts`, so the session user is typed with the profile fields —
 * notably `displayName`, which the root layout reads as the "onboarded" signal.
 * (Kept as an explicit schema rather than `inferAdditionalFields<typeof auth>()`:
 * the type-only cross-app inference collapses to `{}` here, so we restate the fields.)
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    // Capture (and refresh) the bearer token whenever the server rotates the session — it
    // rides on every sign-in / sign-up / get-session response via the `bearer()` plugin.
    onSuccess(ctx) {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) {
        cachedToken = token;
        SecureStore.setItemAsync(BEARER_KEY, token).catch(() => {});
      }
    },
    // Authenticate the auth client's own requests (e.g. /get-session, the onboarding gate in
    // app/_layout.tsx) with the bearer token too, so useSession reflects live server state in
    // production rather than only the cached session blob.
    auth: {
      type: "Bearer",
      token: () => cachedToken ?? "",
    },
  },
  plugins: [
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        displayName: { type: "string", required: false },
        birthday: { type: "date", required: false },
        icon: { type: "string", required: false },
        theme: { type: "string", required: false },
      },
    }),
    expoClient({
      scheme: "klect",
      storagePrefix: "klect",
      storage: SecureStore,
    }),
  ],
});
