import "server-only";
import { prisma } from "@/lib/db";

/**
 * The read behind the bookmark step of the downgrade-selection screen.
 *
 * `core/active-selection.ts` reports *counts* per list, which is all a paywall
 * needs; the picker needs the rows themselves. This is a plain data-access read
 * in the `lib/<entity>.ts` layer (like `lib/bookmarks.ts`), deliberately holding
 * no cap logic of its own. The commit is still re-validated in core.
 *
 * ## The where-clause mirrors core exactly, on purpose
 *
 * `core.selectActiveBookmarks` builds its candidate set from
 * `{ list: { ownerId: userId, lockedAt: null } }` and *rejects* (does not skip)
 * any id outside it. So this query has to be the same set, or the screen would
 * offer rows the commit then refuses. Two consequences worth stating:
 *
 *  - Bookmarks in lists the user only collaborates on are absent. Collaboration
 *    is never capped, so they are not the user's capacity to spend.
 *  - Bookmarks inside an already-locked list are absent. Their list is already
 *    inaccessible and already outside the cap count, which is why core refuses
 *    them, and which is why the list step must run before this one.
 *
 * Already-locked bookmarks that sit inside an *active* list are included: core
 * accepts them, and selecting one unlocks it. The screen marks them so the user
 * knows they are currently locked.
 */
export type SelectableBookmark = {
  id: string;
  name: string;
  listId: string;
  /** Null = active, a timestamp = currently locked but still selectable. */
  lockedAt: Date | null;
};

/** Every bookmark the user could keep active, newest first. */
export function getSelectableBookmarks(userId: string): Promise<SelectableBookmark[]> {
  return prisma.bookmark.findMany({
    where: { list: { ownerId: userId, lockedAt: null } },
    select: { id: true, name: true, listId: true, lockedAt: true },
    orderBy: { createdAt: "desc" },
  });
}
