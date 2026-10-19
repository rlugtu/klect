import "server-only";
import { prisma } from "@/lib/db";
import {
  FREE_BOOKMARK_LIMIT,
  FREE_LIST_LIMIT,
  FreeLimitError,
  countActiveOwnedBookmarks,
  countActiveOwnedLists,
  getEntitlement,
  isEntitlementActive,
  isPro,
} from "@/lib/core/entitlements";

/**
 * The downgrade-selection flow: what a lapsed over-cap user keeps active.
 *
 * When a paying subscriber lapses while over a free cap, nothing is deleted. The
 * user picks which lists (then which bookmarks inside them) stay active; everything
 * else gets `lockedAt` stamped and becomes preserved, read-only, and excluded from
 * the cap count. This file holds the read that drives that screen and the two
 * commits that apply it.
 *
 * Transport-agnostic like every other `core/*` module: takes the acting `userId`
 * plus already-extracted input, validates, writes, returns. The tRPC procedures in
 * `server/trpc/routers/entitlements.ts` and any future web server action both call
 * exactly these functions, so web and mobile cannot drift.
 *
 * Every selection is re-validated here against the real caps and real ownership.
 * A tampered client that posts ten list ids gets a {@link FreeLimitError}, not ten
 * active lists.
 *
 * ---------------------------------------------------------------------------
 * LOCK-CLEAR-ON-RESUBSCRIBE CONTRACT (decided here, Stage 4; Stage 5 builds to it)
 * ---------------------------------------------------------------------------
 * Option (a) is the contract: **locks are physically cleared**. When a user becomes
 * pro again, something calls {@link clearLocks}, which nulls `lockedAt` on every
 * list and bookmark they own. The RevenueCat webhook (Stage 5) must call it on any
 * transition into an active entitlement.
 *
 * The rejected alternative was (b): leave the rows stamped and have every read path
 * treat `lockedAt` as dormant whenever `isPro(userId)` is true. Rejected because it
 * makes `lockedAt` meaningless on its own. Every list query, bookmark query, cap
 * count, and write guard on both web and mobile would have to join the entitlement
 * state in to interpret it, and the one place that forgets silently hides a pro
 * user's data. It also leaves stale timestamps behind: a user who re-subscribes,
 * reorganizes, and lapses a second time would have an old, arbitrary set of rows
 * snap back to locked without ever choosing them.
 *
 * Under (a), `lockedAt` is self-describing everywhere: non-null means locked, full
 * stop, with no entitlement lookup needed to read it. The cost is that clearing has
 * to actually happen, so there are two triggers rather than one: the webhook calls
 * {@link clearLocks} on re-subscribe, and {@link getSelectionStatus} self-heals (it
 * clears stale locks whenever it finds them on a pro account), which covers a missed
 * or out-of-order webhook the next time any client asks for status.
 *
 * ---------------------------------------------------------------------------
 * TWO MODES: "you owe a selection", and "you can reclaim"
 * ---------------------------------------------------------------------------
 * The screen this file feeds has a second job that is easy to miss. Resubscribing is
 * not the only way locked data comes back: a free user can also make room by
 * *trimming* their active content. Delete a list and a locked list can take its
 * place.
 *
 * Those two situations need opposite handling, which is why the status carries two
 * flags instead of one:
 *
 *  - {@link SelectionStatus.needsSelection} is over-cap. The account is incoherent
 *    until the user chooses, so it is a forced gate: home redirects to /downgrade.
 *  - {@link SelectionStatus.canReclaim} is under-cap with locks still held. Nothing
 *    is owed and nothing is broken, so it is an *offer*: a dismissible banner, never
 *    a redirect.
 *
 * Gating the screen on `needsSelection` alone (which it originally did) meant the
 * second state had no entry point at all, and locked data in a free slot was
 * unreachable short of resubscribing. {@link assertLockingWarranted} is the other
 * half of the same pair: it keeps a commit from *creating* that state.
 */

/** One owned list as the selection screen renders it. */
export type SelectionList = {
  id: string;
  name: string;
  /** Emoji, so the picker rows look like list rows everywhere else. */
  icon: string;
  /**
   * Null = active, a timestamp = currently locked. Serialized to an ISO string over
   * tRPC: the router has no superjson transformer, so mobile receives `string | null`.
   */
  lockedAt: Date | null;
  /** Unlocked bookmarks in this list. These are the ones that consume quota. */
  bookmarkCount: number;
  /** Already-locked bookmarks in this list. Shown as preserved, never as quota. */
  lockedBookmarkCount: number;
};

/**
 * Everything the downgrade-selection screen needs to render, and everything a
 * paywall needs to decide whether this account is at or over a cap. One query
 * serves both so the two screens can never disagree about the user's state.
 */
export type SelectionStatus = {
  isPro: boolean;
  /**
   * The paid plan's product identifier, e.g. "klect_pro_monthly". Null when the user
   * has never had an entitlement row at all.
   *
   * Deliberately the raw identifier rather than display copy: this is RevenueCat's
   * vocabulary, and web and mobile word their membership screens differently, so
   * each client formats it for itself. Handing over a pre-formatted string would
   * mean a client that needs to *decide* something has to parse the prose back.
   *
   * Non-null does not mean pro. A lapsed subscriber keeps the row, and the plan
   * written on it, after it expires. {@link isPro} answers "entitled?"; this answers
   * "which plan?" and the two can disagree.
   */
  plan: string | null;
  /**
   * Which billing path paid for the plan ("stripe", "app_store", "play_store"), or
   * null with no entitlement row.
   *
   * Exposed because it answers the one membership question the app cannot answer on
   * the user's behalf: where to cancel. A Stripe (web) subscription is managed from
   * the receipt email, an App Store one only from iOS Settings, and pointing someone
   * at the wrong one is a support ticket rather than a cosmetic error.
   *
   * Typed `string` rather than `EntitlementStore` from core/entitlements.ts, and
   * that is not laziness. The webhook's `mapStore` writes unmapped RevenueCat stores
   * straight through, lowercased (amazon, roku, paddle, promotional, test_store),
   * and falls back to "unknown", so the column genuinely holds values outside the
   * checked union. Treat that union as the set worth writing copy for, and always
   * keep a neutral fallback branch for the rest.
   */
  store: string | null;
  /**
   * Lifecycle state of the entitlement row ("active", "expired", "grace"), or null
   * when there is no row. Same `string`-not-union typing as {@link store}, for the
   * same reason: the column is a String that RevenueCat's vocabulary can extend.
   *
   * Worth carrying alongside {@link isPro} because the two differ in a state the
   * user needs explained. "grace" is a failed renewal the store is still retrying:
   * not pro, so no cap is lifted, but not the ordinary free tier either. A screen
   * that reads only `isPro` tells a subscriber whose card just bounced that they are
   * simply "on the free plan", which is both wrong and unactionable.
   */
  status: string | null;
  /**
   * End of the current paid period: the renewal date while active, the date it
   * lapsed once expired. Null means either no entitlement row, or a row with no
   * known expiry (a lifetime or promotional grant, which `isEntitlementActive`
   * keeps active indefinitely). Null is therefore never on its own a reason to say
   * "expired".
   *
   * Serialized exactly like {@link SelectionList.lockedAt}: typed `Date | null`
   * here, but the router has no superjson transformer, so mobile receives
   * `string | null` (an ISO string).
   */
  expiresAt: Date | null;
  /** The free-tier caps, echoed so clients never hardcode 3 and 20. */
  listLimit: number;
  bookmarkLimit: number;
  /** Every list the user owns, locked or not, oldest first. */
  lists: SelectionList[];
  /**
   * Quota-consuming counts, straight from the same helpers the create guards use,
   * so the paywall's numbers always match what actually throws.
   */
  activeListCount: number;
  activeBookmarkCount: number;
  /** Free account currently holding more than the cap allows, while unlocked. */
  overListLimit: boolean;
  overBookmarkLimit: boolean;
  /** Either cap exceeded: the account owes a selection before it is coherent again. */
  needsSelection: boolean;
  /**
   * Any list or bookmark the user owns is currently stamped `lockedAt`. Always false
   * for a pro account, because {@link getSelectionStatus} clears stale locks before
   * reporting (see the self-heal note below).
   */
  hasLocks: boolean;
  /**
   * There is locked data to bring back and room to bring it into: free, holding
   * locks, and already under both caps. This is the reclaim case, and it is the
   * reason the selection screen cannot be gated on {@link needsSelection} alone.
   *
   * A free user who went over a cap, locked the overflow, then trimmed their active
   * content back down (deleted a list, deleted bookmarks) has free slots and locked
   * data at the same time. Nothing is owed, so `needsSelection` is false and every
   * forced-state gate closes, which used to mean the locked rows were unreachable
   * forever. With this flag the selection screen stays *reachable* in that state
   * while staying un-forced: reclaim is available, not owed, so the entry point is a
   * dismissible banner rather than a redirect (see app/page.tsx and
   * app/downgrade/page.tsx).
   */
  canReclaim: boolean;
};

/** Outcome of a selection commit. */
export type SelectionResult = {
  /** False when the call was a no-op because the user is pro. */
  applied: boolean;
  /** Rows left or made active — the deduped selection size. 0 when `applied` is false. */
  activeCount: number;
  /** Rows this call newly locked. Rows already locked are not re-stamped. */
  lockedCount: number;
};

/**
 * Null `lockedAt` on every list and bookmark the user owns. Idempotent, and
 * deliberately unconditional: the caller decides when a clear is warranted.
 *
 * Two callers are expected. The RevenueCat webhook (Stage 5) calls this on any
 * transition into an active entitlement — that is the lock-clear-on-resubscribe
 * contract above. A trim-back-under-the-cap path can call it for the same reason.
 * Returns how many rows changed, which is 0 on the common already-clear case.
 */
export async function clearLocks(
  userId: string,
): Promise<{ lists: number; bookmarks: number }> {
  const [lists, bookmarks] = await prisma.$transaction([
    prisma.list.updateMany({
      where: { ownerId: userId, lockedAt: { not: null } },
      data: { lockedAt: null },
    }),
    prisma.bookmark.updateMany({
      where: { lockedAt: { not: null }, list: { ownerId: userId } },
      data: { lockedAt: null },
    }),
  ]);
  return { lists: lists.count, bookmarks: bookmarks.count };
}

/** Whether any row the user owns is currently stamped locked. */
async function hasAnyLock(userId: string): Promise<boolean> {
  const [lockedLists, lockedBookmarks] = await Promise.all([
    prisma.list.count({ where: { ownerId: userId, lockedAt: { not: null } } }),
    prisma.bookmark.count({
      where: { lockedAt: { not: null }, list: { ownerId: userId } },
    }),
  ]);
  return lockedLists > 0 || lockedBookmarks > 0;
}

/**
 * The shared read behind the downgrade-selection screen and both paywalls.
 *
 * Self-heals stale locks: if the user is pro but still has rows stamped, the webhook
 * that should have cleared them was missed or arrived out of order, so this clears
 * them before reporting. See the lock-clear contract at the top of this file.
 */
export async function getSelectionStatus(userId: string): Promise<SelectionStatus> {
  // The whole row rather than `isPro(userId)`, which reads exactly this row and
  // discards everything but the verdict. The membership fields below (plan, store,
  // status, expiresAt) come off it for free, so the status stays one entitlement
  // read instead of two.
  const entitlement = await getEntitlement(userId);
  const pro = isEntitlementActive(entitlement);

  // Read the lock state before any healing, because both consumers need it: the
  // self-heal below, and `hasLocks`/`canReclaim` in the returned status. Reset to
  // false after a clear so the report describes the account as it now stands.
  let hasLocks = await hasAnyLock(userId);
  if (pro && hasLocks) {
    await clearLocks(userId);
    hasLocks = false;
  }

  const [lists, unlockedCounts, lockedCounts, activeListCount, activeBookmarkCount] =
    await Promise.all([
      prisma.list.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true, icon: true, lockedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.bookmark.groupBy({
        by: ["listId"],
        where: { lockedAt: null, list: { ownerId: userId } },
        _count: { _all: true },
      }),
      prisma.bookmark.groupBy({
        by: ["listId"],
        where: { lockedAt: { not: null }, list: { ownerId: userId } },
        _count: { _all: true },
      }),
      // The same helpers the create guards call, rather than a local sum, so the
      // number a paywall shows is by construction the number that throws.
      countActiveOwnedLists(userId),
      countActiveOwnedBookmarks(userId),
    ]);

  const unlockedByList = new Map(unlockedCounts.map((r) => [r.listId, r._count._all]));
  const lockedByList = new Map(lockedCounts.map((r) => [r.listId, r._count._all]));

  const overListLimit = !pro && activeListCount > FREE_LIST_LIMIT;
  const overBookmarkLimit = !pro && activeBookmarkCount > FREE_BOOKMARK_LIMIT;
  const needsSelection = overListLimit || overBookmarkLimit;

  return {
    isPro: pro,
    plan: entitlement?.plan ?? null,
    store: entitlement?.store ?? null,
    status: entitlement?.status ?? null,
    expiresAt: entitlement?.expiresAt ?? null,
    listLimit: FREE_LIST_LIMIT,
    bookmarkLimit: FREE_BOOKMARK_LIMIT,
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      icon: list.icon,
      lockedAt: list.lockedAt,
      bookmarkCount: unlockedByList.get(list.id) ?? 0,
      lockedBookmarkCount: lockedByList.get(list.id) ?? 0,
    })),
    activeListCount,
    activeBookmarkCount,
    overListLimit,
    overBookmarkLimit,
    needsSelection,
    hasLocks,
    // Over a cap means the user owes a selection, which is a different screen with a
    // different job, so reclaim is deliberately the under-cap case only.
    canReclaim: !pro && hasLocks && !needsSelection,
  };
}

/** Deduplicate ids while keeping the caller's order, so counts are honest. */
function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Refuse a commit that would newly lock data while the account is not actually over
 * the cap it is selecting against.
 *
 * Locking is only ever the price of being over a limit. Once an account is under its
 * own cap there is nothing to pay, so a commit that still stamps rows is one of two
 * things, and neither should be honoured:
 *
 *  - A stale form. Someone opens the selection screen while over the cap, trims data
 *    in another tab until they are under it, then submits the old over-cap answer.
 *    Without this check that submission locks rows the account no longer owes, and
 *    (before the reclaim flag existed) stranded them permanently.
 *  - A client bug or a tampered post that volunteers data into the locked state for
 *    no reason at all.
 *
 * The threshold is `selected >= limit`, not "is the account over the cap", because a
 * legitimate over-cap commit *is* a commit that locks things: picking 3 of 8 lists
 * selects exactly the cap's worth and locks the other 5, and that has to keep
 * working. Holding the selection at the full cap is also what makes the reclaim flow
 * (see {@link SelectionStatus.canReclaim}) compose with this rather than fight it:
 * reclaim is a swap, and the picker there forces exactly `min(limit, options)`
 * selections, so either nothing is left over to lock (fewer rows than the cap) or
 * the selection is at the cap and this passes. The one thing it refuses is a free
 * user under their cap choosing to lock their own data for no gain, which is not a
 * flow any client offers and is not worth supporting at the cost of leaving the
 * stale-form hole open.
 */
function assertLockingWarranted(
  noun: "lists" | "bookmarks",
  limit: number,
  selectedCount: number,
  lockCount: number,
): void {
  if (lockCount === 0 || selectedCount >= limit) return;
  throw new Error(
    `Nothing needs to be locked: you're within the free limit of ${limit} ${noun}. ` +
      `Keep up to ${limit} active instead.`,
  );
}

/**
 * Commit the list half of the selection: keep exactly `listIds` active, lock every
 * other list the user owns. No-op for pro users, who have no cap to select against.
 *
 * Re-validated server-side on both axes the client could lie about: the selection
 * cannot exceed {@link FREE_LIST_LIMIT} after deduplication, and every id must
 * actually be owned by this user (a list they merely collaborate on is someone
 * else's capacity and is not theirs to lock or unlock).
 *
 * Already-locked lists that stay unselected keep their original `lockedAt` rather
 * than being re-stamped, so "locked since" stays truthful across repeated commits.
 * Bookmark rows are untouched: a locked list is wholly inaccessible and its contents
 * are already excluded from the bookmark count, so cascading a stamp onto them would
 * be redundant write amplification. Bookmarks are the second step, below.
 */
export async function selectActiveLists(
  userId: string,
  listIds: string[],
): Promise<SelectionResult> {
  if (await isPro(userId)) return { applied: false, activeCount: 0, lockedCount: 0 };

  const selected = unique(listIds);
  if (selected.length > FREE_LIST_LIMIT) {
    throw new FreeLimitError(
      "lists",
      FREE_LIST_LIMIT,
      selected.length,
      `Pick at most ${FREE_LIST_LIMIT} lists to keep active.`,
    );
  }

  const owned = await prisma.list.findMany({
    where: { ownerId: userId },
    select: { id: true, lockedAt: true },
  });
  const ownedIds = new Set(owned.map((list) => list.id));
  for (const id of selected) {
    if (!ownedIds.has(id)) throw new Error("You don't have permission to do that.");
  }

  const selectedIds = new Set(selected);
  const toLock = owned
    .filter((list) => !selectedIds.has(list.id) && list.lockedAt === null)
    .map((list) => list.id);

  assertLockingWarranted("lists", FREE_LIST_LIMIT, selected.length, toLock.length);

  const now = new Date();
  await prisma.$transaction([
    ...(selected.length
      ? [
          prisma.list.updateMany({
            where: { ownerId: userId, id: { in: selected } },
            data: { lockedAt: null },
          }),
        ]
      : []),
    ...(toLock.length
      ? [
          prisma.list.updateMany({
            where: { ownerId: userId, id: { in: toLock } },
            data: { lockedAt: now },
          }),
        ]
      : []),
  ]);

  return { applied: true, activeCount: selected.length, lockedCount: toLock.length };
}

/**
 * Commit the bookmark half: keep exactly `bookmarkIds` active, lock every other
 * bookmark in the user's active lists. No-op for pro users.
 *
 * Scope is deliberately narrow, and this is the hard constraint the UI has to
 * respect: **only bookmarks living in the user's own, currently unlocked lists are
 * selectable**, and only those are candidates for locking. Two consequences, both
 * enforced here rather than left to the client:
 *
 * 1. A bookmark in a list the user merely collaborates on is never touched —
 *    collaboration is never capped.
 * 2. A bookmark inside a list the user just locked is rejected, not silently
 *    ignored. Its list is already inaccessible and its contents already sit outside
 *    the cap count, so calling it "active" would be incoherent. This forces the real
 *    ordering: {@link selectActiveLists} runs first, then this against what survived.
 *    A client that offers bookmarks from locked lists gets a loud error, which is the
 *    point — a silent skip would hide the sequencing bug.
 *
 * Already-locked bookmarks inside an active list keep their original `lockedAt`
 * unless selected, in which case they unlock. Same no-re-stamping rule as lists.
 */
export async function selectActiveBookmarks(
  userId: string,
  bookmarkIds: string[],
): Promise<SelectionResult> {
  if (await isPro(userId)) return { applied: false, activeCount: 0, lockedCount: 0 };

  const selected = unique(bookmarkIds);
  if (selected.length > FREE_BOOKMARK_LIMIT) {
    throw new FreeLimitError(
      "bookmarks",
      FREE_BOOKMARK_LIMIT,
      selected.length,
      `Pick at most ${FREE_BOOKMARK_LIMIT} bookmarks to keep active.`,
    );
  }

  const candidates = await prisma.bookmark.findMany({
    where: { list: { ownerId: userId, lockedAt: null } },
    select: { id: true, lockedAt: true },
  });
  const candidateIds = new Set(candidates.map((bookmark) => bookmark.id));
  for (const id of selected) {
    if (!candidateIds.has(id)) throw new Error("You don't have permission to do that.");
  }

  const selectedIds = new Set(selected);
  const toLock = candidates
    .filter((bookmark) => !selectedIds.has(bookmark.id) && bookmark.lockedAt === null)
    .map((bookmark) => bookmark.id);

  assertLockingWarranted(
    "bookmarks",
    FREE_BOOKMARK_LIMIT,
    selected.length,
    toLock.length,
  );

  const now = new Date();
  await prisma.$transaction([
    ...(selected.length
      ? [
          prisma.bookmark.updateMany({
            where: { id: { in: selected }, list: { ownerId: userId, lockedAt: null } },
            data: { lockedAt: null },
          }),
        ]
      : []),
    ...(toLock.length
      ? [
          prisma.bookmark.updateMany({
            where: { id: { in: toLock }, list: { ownerId: userId, lockedAt: null } },
            data: { lockedAt: now },
          }),
        ]
      : []),
  ]);

  return { applied: true, activeCount: selected.length, lockedCount: toLock.length };
}
