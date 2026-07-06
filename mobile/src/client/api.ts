import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@web/server/trpc/router";
import { authClient, API_URL } from "./auth";

/**
 * Typed tRPC client for web's API. `AppRouter` is a **type-only** import from
 * web/src (erased at compile time — no runtime dependency on web), giving
 * end-to-end type safety against the exact procedures web exposes.
 *
 * Requests carry the better-auth session cookie so `protectedProcedure` sees the
 * signed-in user.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      headers() {
        const cookie = authClient.getCookie();
        return cookie ? { Cookie: cookie } : {};
      },
    }),
  ],
});
