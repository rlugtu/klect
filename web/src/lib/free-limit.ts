import { toast } from "@/lib/toast";
import type { FreeLimitResult } from "@/lib/core/entitlements";

/**
 * Turning a free-tier cap refusal into a path to pay.
 *
 * `createList`, `createBookmark`, `createBookmarkInLists`, and `duplicateList`
 * all resolve to a {@link FreeLimitResult} instead of throwing when a cap stops
 * them. Every one of those trigger sites used to just toast the message, which
 * told the user they were stuck without telling them how to get unstuck. This is
 * the one place that decides what a refusal does, so the four sites can never
 * drift apart.
 *
 * Importing the *type* from `core/entitlements` (a `server-only` module) is safe
 * and intentional: a type-only import is erased at compile time, so nothing from
 * that module reaches the client bundle. The same trick mobile uses in
 * `mobile/src/client/free-limit.ts`.
 */

/**
 * Cap toasts live longer than the 3s default. They carry the upgrade action, and
 * an offer that disappears before it can be read is not an offer.
 */
export const FREE_LIMIT_TOAST_DURATION = 8000;

/**
 * Where a refusal sends the user. `reason` only picks the paywall's copy. The
 * numbers it shows are re-read server-side from the entitlement state, never
 * taken from the URL, so a hand-edited query string cannot misstate the caps.
 */
export function upgradeHref(refusal: FreeLimitResult): string {
  return `/upgrade?reason=${encodeURIComponent(refusal.limit)}`;
}

/**
 * Report a cap refusal and offer the upgrade page alongside it.
 *
 * Deliberately *offers* rather than navigates. Two of the trigger sites hold a
 * form the user has already filled in, and redirecting out from under them would
 * throw that work away to show a page they may not want; the action button keeps
 * the choice theirs while still making the paid path one click away.
 *
 * `goToUpgrade` is passed in rather than taken from `useRouter` here so this
 * stays a plain function callable from any handler. Give it
 * `() => router.push(upgradeHref(refusal))`.
 */
export function showFreeLimitToast(
  refusal: FreeLimitResult,
  goToUpgrade: () => void,
): void {
  toast.error(refusal.message, {
    duration: FREE_LIMIT_TOAST_DURATION,
    action: { label: "Upgrade", onClick: goToUpgrade },
  });
}
