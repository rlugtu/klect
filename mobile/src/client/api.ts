import { createTRPCClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@web/server/trpc/router";
import { readStoredBearerToken, API_URL, clearBearerToken } from "./bearer-store";

/**
 * Live (cookie/session-aware) token resolver, injected by `./auth` at app startup via
 * `setLiveTokenResolver`. We do NOT import `./auth` here on purpose: constructing its better-auth
 * Expo client wires up deep-link native APIs that crash the iOS Share Extension's process. The
 * extension reuses this tRPC client but never loads `./auth`, so `liveResolver` stays the no-op
 * default and requests fall back to the shared-keychain read — its only token source.
 */
let liveResolver: () => string | null = () => null;
export function setLiveTokenResolver(fn: () => string | null) {
  liveResolver = fn;
}

/**
 * Drop a server-rejected bearer token so the next request re-resolves from the fresh cookie/keychain
 * instead of resending the dead one — the tRPC counterpart to the auth client's onError 401 hook
 * (the two clients don't share an interceptor). Deliberately imports only `clearBearerToken` from
 * `./bearer-store` (never `./auth`), so the Share Extension's tRPC client stays better-auth-free.
 */
const clearBearerOnUnauthorized: TRPCLink<AppRouter> = () => {
  return ({ op, next }) =>
    observable((observer) =>
      next(op).subscribe({
        next: (v) => observer.next(v),
        error: (err) => {
          const status =
            (err.data as { httpStatus?: number } | undefined)?.httpStatus ??
            (err.meta?.response as Response | undefined)?.status;
          if (status === 401) clearBearerToken();
          observer.error(err);
        },
        complete: () => observer.complete(),
      }),
    );
};

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
    clearBearerOnUnauthorized,
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      async headers() {
        // Resolve from the captured token or the stored session cookie (covers both the
        // email/password and Google OAuth sign-in paths); fall back to the shared-keychain read
        // for the cold-start race before the in-memory token has hydrated. In the Share Extension's
        // fresh process there is no cache/cookie, so that stored read is the only token source.
        const token = liveResolver() ?? (await readStoredBearerToken());
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
