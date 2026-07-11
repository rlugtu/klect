import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@web/server/trpc/router";
import * as SecureStore from "expo-secure-store";
import { resolveBearerToken, API_URL } from "./auth";

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
        // Resolve from the captured token or the stored session cookie (covers both the
        // email/password and Google OAuth sign-in paths); fall back to a direct SecureStore
        // read for the cold-start race before the in-memory token has hydrated.
        const token =
          resolveBearerToken() ?? (await SecureStore.getItemAsync("klect_bearer"));
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
