import type { FreeLimitResult } from '@web/lib/core/entitlements';

/**
 * Reading a free-tier cap refusal off a tRPC error.
 *
 * When `core.assertCanCreateList` / `assertCanCreateBookmark` refuse a write, the thrown
 * `FreeLimitError` is flattened by web's tRPC `errorFormatter` onto `error.data.freeLimit`
 * (web/src/server/trpc/trpc.ts). That optional field is the only reliable "this is a cap
 * hit, not a crash" signal — the error *message* is user-facing copy and will be reworded.
 * Never match on the message.
 *
 * Deliberately standalone, with no imports but a type: the iOS Share Extension needs this
 * too, and that separate process must not pull in `@/client/auth` (better-auth wires up
 * deep-link native APIs that crash an app-extension process — see client/api.ts).
 */

/** The cap refusal as it arrives on the client. Same shape web's paywall reads. */
export type FreeLimit = FreeLimitResult;

/**
 * Local copy of web's `FREE_LIMIT_CODE`. The constant itself can't be imported here —
 * `web/src/lib/core/entitlements.ts` is `server-only`, so only its *types* cross — but
 * annotating with `FreeLimitResult['code']` means a rename on the server fails this
 * file's type check instead of silently breaking every paywall trigger.
 */
const FREE_LIMIT_CODE: FreeLimitResult['code'] = 'FREE_LIMIT';

/**
 * The cap refusal carried by a thrown tRPC error, or null for every other failure
 * (network, permission, validation — all of which stay ordinary errors to report).
 */
export function freeLimitFrom(error: unknown): FreeLimit | null {
  const data = (error as { data?: unknown } | null | undefined)?.data;
  if (typeof data !== 'object' || data === null) return null;

  const freeLimit = (data as { freeLimit?: unknown }).freeLimit;
  if (typeof freeLimit !== 'object' || freeLimit === null) return null;

  return (freeLimit as FreeLimit).code === FREE_LIMIT_CODE
    ? (freeLimit as FreeLimit)
    : null;
}

/** Singular/plural noun for a cap, e.g. `nounFor('lists', 1)` → `'list'`. */
function nounFor(limit: FreeLimit['limit'], count: number): string {
  const singular = limit === 'lists' ? 'list' : 'bookmark';
  return count === 1 ? singular : `${singular}s`;
}

/**
 * The line the paywall (and the Share Extension's nudge) shows above the plans.
 *
 * `adding` is how many rows the blocked action would have created. The ordinary single-create
 * path passes 1 and gets the server's own copy verbatim, so the wording stays in one place.
 * The multi-list create path (`bookmarks.createInLists`) is checked against a *total*, so one
 * tap can be several over the cap at once — "you'd need 3 more" is the only honest framing
 * there, and "free accounts can save 20 bookmarks" would read as a lie to someone sitting at 18.
 *
 * Pure and import-free on purpose, like the rest of this module: the Share Extension's separate
 * process shows the same sentence and must not pull in anything but types.
 */
export function capHitMessage(limit: FreeLimit, adding = 1): string {
  if (adding <= 1) return limit.message;

  const remaining = Math.max(0, limit.max - limit.current);
  const needed = Math.max(1, adding - remaining);
  return (
    `You'd need ${needed} more ${nounFor(limit.limit, needed)} than your free plan allows. ` +
    `Free keeps ${limit.max} ${nounFor(limit.limit, limit.max)}, and you're using ${limit.current}.`
  );
}

/**
 * The `/paywall` route for a cap hit.
 *
 * Carries the finished sentence rather than the raw numbers, so {@link capHitMessage} stays
 * the single author of this copy and the route doesn't have to reassemble a `FreeLimit` out of
 * stringified URL params. The paywall renders a generic pitch when it arrives with no `reason`
 * (a bare `klect:///paywall` deep link from the Share Extension, for instance).
 *
 * Returned as data rather than navigating here so this module stays navigator-free — the Share
 * Extension imports it and has no router at all.
 */
export function paywallRouteFor(limit: FreeLimit, adding = 1) {
  return {
    pathname: '/paywall' as const,
    params: { reason: capHitMessage(limit, adding) },
  };
}
