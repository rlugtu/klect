import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getSelectionStatus } from "@/lib/actions/entitlements";
import { getSelectableBookmarks } from "@/lib/selection";
import {
  DowngradeSelection,
  type SelectionOption,
} from "@/components/entitlements/DowngradeSelection";

export const metadata: Metadata = {
  title: "Choose what stays active",
  robots: { index: false, follow: false },
};

/**
 * The downgrade-selection screen (Stage 4, web half).
 *
 * Reached when an account is over a free cap with no active entitlement, which
 * happens after a paid subscription lapses. It renders exactly one step at a
 * time, because the bookmark step's candidates do not exist until the list step
 * has committed. See the note in `components/entitlements/DowngradeSelection`.
 *
 * ## Two ways in: owed, and offered
 *
 * `status.needsSelection` is the forced route: over a cap, home redirects here, and
 * there is no exit until a selection lands.
 *
 * `status.canReclaim` is the second one, and it is why the old
 * `if (!status.needsSelection) redirect("/")` guard was a bug rather than a tidy
 * invariant. A free user who locked their overflow and later trimmed their *active*
 * content back under the cap (deleted a list, deleted bookmarks) holds locked data
 * and empty slots at the same time. Nothing is owed, so `needsSelection` is false,
 * so that guard bounced them home from the only screen that could give the data
 * back. Now the page accepts either flag and renders in reclaim mode for the second,
 * where the copy is an offer and there is a visible way out. Entry in that mode is a
 * dismissible banner on home (`components/entitlements/ReclaimBanner`), never a
 * redirect. See the "two modes" note in `lib/core/active-selection.ts`.
 *
 * ## The gate, and why it is not in `requireOnboardedUser`
 *
 * `app/page.tsx` sends an over-cap user here, in the same place and the same
 * shape as the existing onboarding redirect right above it (`if
 * (!session.user.handle) redirect("/onboarding")`), and folded into the home
 * page's existing `Promise.all` so it costs no extra round trip. It is not
 * wired into `requireOnboardedUser` on purpose: that guard runs on every
 * authenticated page, and putting an entitlement read behind it would add a
 * query to all of them to catch a state that is rare and already enforced
 * server-side on every write. Home is where a user "next opens" the app, which
 * is exactly what the plan asks for.
 *
 * This page does the same check itself so a direct visit cannot sit on a screen
 * the account does not owe.
 */
export default async function DowngradePage() {
  const user = await requireOnboardedUser();
  const status = await getSelectionStatus();

  // Pro, or under both caps with nothing locked (they trimmed down themselves, or
  // the selection just completed). Nothing to choose and nothing to bring back.
  if (!status.needsSelection && !status.canReclaim) redirect("/");

  // Mutually exclusive by construction: `canReclaim` is defined as under-cap, so an
  // account that owes a selection is never also in reclaim mode.
  const mode = status.needsSelection ? "downgrade" : "reclaim";

  // Which step reclaim mode opens on. Any locked list means the list step has real
  // work: either there is a free slot to put one back into, or the user is at the
  // cap and can swap one active list for a locked one. Deliberately broader than
  // "there is a free slot", because the at-the-cap swap is the only move available
  // to someone whose locks are all lists, and sending them to the bookmark step
  // instead would render a picker with nothing to change.
  const reclaimLists = status.lists.some((list) => list.lockedAt !== null);

  if (status.overListLimit || (mode === "reclaim" && reclaimLists)) {
    // Every owned list is offered, locked ones included: core accepts a locked
    // id and unlocks it, so a user can swap which three they keep on a second
    // pass instead of being stuck with the first answer they gave.
    //
    // Reclaim mode offers the active ones first so the picker's pre-selection
    // (the first `target` rows) holds everything already active and spends the
    // leftover slots on locked rows. In list order a locked row could land inside
    // the pre-selection and push an active one out, which would quietly propose
    // locking something the user never asked to give up.
    const ordered = mode === "reclaim" ? [...status.lists].sort(activeFirst) : status.lists;

    const options: SelectionOption[] = ordered.map((list) => ({
      id: list.id,
      icon: list.icon,
      label: list.name,
      meta: bookmarkMeta(list.bookmarkCount, list.lockedBookmarkCount),
      locked: list.lockedAt !== null,
    }));

    return (
      // Keyed by step. Both branches render the same component type in the same
      // position, and committing the list step calls `router.refresh()`, a soft
      // refresh that keeps client state. Without distinct keys React reuses the
      // instance, the `selected` useState initializer never re-runs, and the
      // bookmark step opens holding the previous step's list ids.
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <DowngradeSelection
          key="lists"
          kind="lists"
          mode={mode}
          options={options}
          limit={status.listLimit}
          current={status.activeListCount}
        />
      </main>
    );
  }

  // List step settled; now the bookmarks inside the lists that survived it.
  const bookmarks = await getSelectableBookmarks(user.id);
  const listsById = new Map(status.lists.map((list) => [list.id, list]));
  const orderedBookmarks = mode === "reclaim" ? [...bookmarks].sort(activeFirst) : bookmarks;

  const options: SelectionOption[] = orderedBookmarks.map((bookmark) => {
    const list = listsById.get(bookmark.listId);
    return {
      id: bookmark.id,
      icon: "🔖",
      label: bookmark.name,
      meta: list ? `${list.icon} ${list.name}` : "",
      locked: bookmark.lockedAt !== null,
    };
  });

  return (
    // Distinct key from the list branch above, so this step mounts fresh.
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <DowngradeSelection
        key="bookmarks"
        kind="bookmarks"
        mode={mode}
        options={options}
        limit={status.bookmarkLimit}
        current={status.activeBookmarkCount}
      />
    </main>
  );
}

/**
 * Active rows before locked ones, otherwise unchanged. `Array.prototype.sort` is
 * stable, so each group keeps the order the server read it in.
 */
function activeFirst(
  a: { lockedAt: Date | null },
  b: { lockedAt: Date | null },
): number {
  return Number(a.lockedAt !== null) - Number(b.lockedAt !== null);
}

/** "4 bookmarks · 2 locked". The second half appears only when there is one. */
function bookmarkMeta(active: number, locked: number): string {
  const head = `${active} bookmark${active === 1 ? "" : "s"}`;
  return locked > 0 ? `${head} · ${locked} locked` : head;
}
