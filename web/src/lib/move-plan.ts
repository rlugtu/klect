/**
 * The pure decision half of moving bookmarks between lists (`core.moveBookmarks`).
 *
 * Kept free of Prisma and `server-only` on purpose: every rule that decides
 * whether a move may happen, and what it costs against the free cap, lives here
 * as plain data in, plain data out, so it can be checked without a database
 * (see `scripts/verify-move-plan.ts`). Role checks are not here: they need the
 * membership table, so core runs `assertRole` on the target and on every source
 * list before it asks for a plan.
 */

/** Upper bound on one move or bulk delete request, so one call stays one cheap transaction. */
export const BULK_BOOKMARK_MAX = 200;

/** A bookmark as the planner needs it: where it lives and whether it is writable. */
export type MoveCandidate = {
  id: string;
  listId: string;
  /** `Bookmark.lockedAt` is set. */
  locked: boolean;
  /** The source list's `lockedAt` is set. */
  listLocked: boolean;
  listOwnerId: string;
};

export type MoveTarget = {
  id: string;
  ownerId: string;
  /** The destination list's `lockedAt` is set. */
  locked: boolean;
};

export type MoveRefusal =
  | "empty"
  | "too-many"
  | "not-found"
  | "target-locked"
  | "bookmark-locked"
  | "source-locked";

export type MovePlan =
  | {
      ok: true;
      /** Ids that actually change list (already-in-target ids are left out). */
      moveIds: string[];
      /** `moveIds` grouped by the list they currently sit in. */
      bySource: Record<string, string[]>;
      /**
       * How many moved bookmarks become newly owned by the caller: they leave a
       * list someone else owns and land in a list the caller owns. This is the
       * only number the free bookmark cap is checked against (0 = no check).
       */
      ownedIncoming: number;
      /** Ids skipped because they are already in the target list. */
      alreadyThere: string[];
    }
  | { ok: false; reason: MoveRefusal };

/** Dedupe and drop blanks, keeping first-seen order. */
export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/**
 * Decide a move of `requestedIds` into `target` for `userId`, given the rows the
 * database returned for those ids.
 *
 * Rules, in order:
 * - at least one id, at most {@link BULK_BOOKMARK_MAX};
 * - every requested id must exist (a missing one refuses the whole request, so a
 *   partial move never reports success);
 * - the target list must not be locked;
 * - no moved bookmark may be locked, and none may sit in a locked list. A move is
 *   an edit-style write: letting a locked row move would either drag it into an
 *   active list (where it would start counting, or worse, stay locked inside an
 *   active list) or let locked content escape a locked list, bypassing the
 *   downgrade selection. Delete stays the way to trim locked rows.
 * - cap: only bookmarks moving from a list the caller does not own into a list
 *   the caller does own add to the caller's owned count. Moves between two of the
 *   caller's own lists are net zero; moves into someone else's list follow
 *   `createBookmark` (collaboration is never capped for the adder).
 *
 * Bookmarks already in the target are reported in `alreadyThere` and skipped,
 * so dropping a selection that partly lives in the target is not an error.
 */
export function planBookmarkMove(
  userId: string,
  requestedIds: string[],
  rows: MoveCandidate[],
  target: MoveTarget,
): MovePlan {
  const ids = uniqueIds(requestedIds);
  if (ids.length === 0) return { ok: false, reason: "empty" };
  if (ids.length > BULK_BOOKMARK_MAX) return { ok: false, reason: "too-many" };

  const byId = new Map(rows.map((r) => [r.id, r]));
  if (ids.some((id) => !byId.has(id))) return { ok: false, reason: "not-found" };
  if (target.locked) return { ok: false, reason: "target-locked" };

  const candidates = ids.map((id) => byId.get(id)!);
  const alreadyThere = candidates.filter((c) => c.listId === target.id).map((c) => c.id);
  const moving = candidates.filter((c) => c.listId !== target.id);

  if (moving.some((c) => c.locked)) return { ok: false, reason: "bookmark-locked" };
  if (moving.some((c) => c.listLocked)) return { ok: false, reason: "source-locked" };

  const bySource: Record<string, string[]> = {};
  for (const c of moving) (bySource[c.listId] ??= []).push(c.id);

  const ownedIncoming =
    target.ownerId === userId
      ? moving.filter((c) => c.listOwnerId !== userId).length
      : 0;

  return {
    ok: true,
    moveIds: moving.map((c) => c.id),
    bySource,
    ownedIncoming,
    alreadyThere,
  };
}
