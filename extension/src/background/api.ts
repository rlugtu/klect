import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@web/server/trpc/router";

import { API_URL } from "@/shared/env";
import { readSessionToken } from "./auth";

/**
 * The typed tRPC client for web's API — **the only place in this extension that talks to
 * the network.** It lives in the background service worker on purpose: MV3 extension
 * pages are exempt from page-level CORS for origins declared in `host_permissions`,
 * content scripts are not, and `/api/trpc` has no CORS configuration at all today
 * (`web/next.config.ts` sets no headers). Calling the API from anywhere else fails as an
 * opaque CORS error that tempts someone into adding CORS headers to the server, which
 * this build must not do.
 *
 * `AppRouter` is a **type-only** import from web/src (erased at compile time — no runtime
 * dependency on web), mirroring `mobile/src/client/api.ts`. `httpBatchLink` matches
 * mobile's wire format, which Stage 1 confirmed authenticates in its batched shape too.
 *
 * The auth header resolves from a **fresh cookie read on every call** — see
 * `./auth.ts` for why nothing is cached.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      async headers() {
        const token = await readSessionToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
