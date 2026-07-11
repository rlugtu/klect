import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@web/server/trpc/router";
import * as SecureStore from "expo-secure-store";
import { getBearerToken, API_URL } from "./auth";

/**
 * Typed tRPC client for web's API. `AppRouter` is a **type-only** import from
 * web/src (erased at compile time — no runtime dependency on web), giving
 * end-to-end type safety against the exact procedures web exposes.
 *
 * Requests carry the better-auth session token as `Authorization: Bearer` so
 * `protectedProcedure` sees the signed-in user. We use the bearer token rather than the
 * session cookie because iOS release builds swallow `Secure` cookies before the auth client
 * can store them (see `getBearerToken` in ./auth).
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      async headers() {
        // Prefer the in-memory token; fall back to SecureStore for the cold-start race
        // before the in-memory copy has hydrated.
        const token = getBearerToken() ?? (await SecureStore.getItemAsync("klect_bearer"));
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
