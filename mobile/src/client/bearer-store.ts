import * as SecureStore from "expo-secure-store";

/**
 * Dependency-light bearer-token storage — imports **only** `expo-secure-store`, never
 * `better-auth`. This is deliberate: the iOS Share Extension runs in a **separate process**
 * where `@better-auth/expo`'s `expoClient` (deep-link / web-browser native APIs) isn't
 * available and crashes the JS bundle at load. The extension only needs to *read* the stored
 * token, so those primitives live here, away from the auth client in `./auth`. Keep this module
 * free of any import that pulls in the better-auth client.
 */

/** Base URL of the web app, which hosts the better-auth server + tRPC API. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const BEARER_KEY = "klect_bearer";
let cachedToken: string | null = null;

/**
 * App Group shared with the iOS Share Extension (`group.com.klect.app`, wired into both targets'
 * entitlements by the expo-share-extension config plugin). On iOS an app group listed under
 * `com.apple.security.application-groups` is also treated as a keychain access group, so storing the
 * bearer token under it lets the extension's **separate process** read it (the extension has no
 * access to `cachedToken` or the better-auth cookie). Keeping every `klect_bearer` read/write scoped
 * to this group keeps the app and the extension pointed at the same keychain item.
 */
export const SHARED_KEYCHAIN_ACCESS_GROUP = "group.com.klect.app";
const SHARED_OPTS = { accessGroup: SHARED_KEYCHAIN_ACCESS_GROUP } as const;

// Avoid redundant keychain writes when the resolved token hasn't changed (notably the OAuth path,
// which re-derives the same cookie token on every request — see resolveBearerToken in ./auth).
let lastPersistedToken: string | null = null;

/** The in-memory token, for synchronous request-header reads. Hydrated on startup below and kept
 *  fresh by `persistBearer`. */
export function getCachedToken(): string | null {
  return cachedToken;
}

/** Persist the token in memory (sync request reads) + the shared keychain (survives restarts, and
 *  is the only copy the Share Extension can see). */
export function persistBearer(token: string) {
  cachedToken = token;
  if (token === lastPersistedToken) return;
  lastPersistedToken = token;
  SecureStore.setItemAsync(BEARER_KEY, token, SHARED_OPTS).catch(() => {});
}

/** Read the persisted token from the shared keychain. Used by the tRPC client's cold-start fallback
 *  (before `cachedToken` hydrates) and — since it needs no in-memory/cookie state — by the Share
 *  Extension, whose fresh process only ever has this stored copy to go on. */
export function readStoredBearerToken(): Promise<string | null> {
  return SecureStore.getItemAsync(BEARER_KEY, SHARED_OPTS);
}

// Hydrate the in-memory token on startup (async; the tRPC client falls back to a direct
// SecureStore read for the cold-start race before this resolves).
readStoredBearerToken()
  .then((t) => {
    if (t) cachedToken = t;
  })
  .catch(() => {});

/** Drop the stored bearer token (call on sign-out). */
export function clearBearerToken() {
  cachedToken = null;
  lastPersistedToken = null;
  SecureStore.deleteItemAsync(BEARER_KEY, SHARED_OPTS).catch(() => {});
}
