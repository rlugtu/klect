import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

import { API_URL, getCachedToken, persistBearer } from "./bearer-store";
import { setLiveTokenResolver } from "./api";

// Re-exported so existing importers of `@/client/auth` keep working; the storage itself now lives in
// the better-auth-free `./bearer-store` (see that file for why the Share Extension can't load this).
export { API_URL, clearBearerToken } from "./bearer-store";

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
 * The token is mirrored in memory + SecureStore by `./bearer-store`; `fetchOptions.onSuccess`
 * below refreshes it whenever better-auth rotates it.
 *
 * The `set-auth-token` header only rides on **fetch** responses (email/password sign-in), so it
 * never fires for the Google OAuth flow — there the session arrives as a `cookie` query param on
 * the `klect://` deep-link redirect, which `@better-auth/expo` stores but our client never sees as
 * a response. `resolveBearerToken` therefore falls back to the stored session cookie, whose
 * session-token value the server's `bearer()` plugin accepts as a bearer token.
 */

/**
 * better-auth client for the native app — same auth server web uses, but with the
 * Expo plugin (tokens in expo-secure-store, deep-link `scheme` for OAuth). Web uses
 * better-auth/react against this same server.
 *
 * `inferAdditionalFields` mirrors the `user.additionalFields` web declares in
 * `web/src/lib/auth.ts`, so the session user is typed with the profile fields —
 * notably `handle`, which the root layout reads as the "onboarded" signal.
 * (Kept as an explicit schema rather than `inferAdditionalFields<typeof auth>()`:
 * the type-only cross-app inference collapses to `{}` here, so we restate the fields.)
 *
 * NOTE: constructing this client wires up deep-link / web-browser native APIs that don't exist in
 * an iOS app-extension process — so this module must never be imported by the Share Extension.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    // Capture (and refresh) the bearer token whenever the server rotates the session — it
    // rides on every sign-in / sign-up / get-session response via the `bearer()` plugin.
    onSuccess(ctx) {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) persistBearer(token);
    },
    // Authenticate the auth client's own requests (e.g. /get-session, the onboarding gate in
    // app/_layout.tsx) with the bearer token too, so useSession reflects live server state in
    // production rather than only the cached session blob.
    auth: {
      type: "Bearer",
      token: () => getCachedToken() ?? "",
    },
  },
  plugins: [
    inferAdditionalFields({
      user: {
        handle: { type: "string", required: false },
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
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

/**
 * Pull the session-token value out of the stored better-auth cookie
 * (`<...>session_token=<value>; ...`). Populated by the Google OAuth deep-link flow even when
 * `set-auth-token` never fired. The value is a signed cookie token the `bearer()` plugin accepts.
 */
function sessionTokenFromCookie(): string | null {
  const cookie = authClient.getCookie();
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.endsWith("session_token")) return rest.join("=") || null;
  }
  return null;
}

/**
 * Best available bearer token for authenticating API calls, covering both sign-in paths:
 * the `set-auth-token` header (email/password) and the stored session cookie (Google OAuth).
 */
export function resolveBearerToken(): string | null {
  const cached = getCachedToken();
  if (cached) return cached;
  const cookieToken = sessionTokenFromCookie();
  // OAuth never populates `cachedToken` (its token arrives only via the stored cookie), so the
  // Share Extension would have nothing in the shared keychain to read. Mirror it there on resolve —
  // `persistBearer` de-dupes, so this is a no-op after the first request of a session.
  if (cookieToken) persistBearer(cookieToken);
  return cookieToken;
}

// Register the live (cookie-aware) token resolver with the tRPC client. `api.ts` deliberately does
// NOT import this module (so the Share Extension's bundle stays better-auth-free); instead the app —
// which always loads this module via app/_layout.tsx — pushes the resolver in at startup. Without
// it, `api.ts` falls back to the stored-keychain read, which is exactly what the extension uses.
setLiveTokenResolver(resolveBearerToken);
