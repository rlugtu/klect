import "server-only";
import { prisma } from "@/lib/db";
import { getViewerAccess } from "@/lib/permissions";

/**
 * Bookmarks in a list, newest first, with their tags + comment counts.
 *
 * Locked bookmarks are included, not filtered: locked means read-only, not hidden.
 * `lockedAt` rides along because this is an `include` over the full row — keep it
 * if this is ever narrowed to a `select`, or the list page renders locked
 * bookmarks as if they were editable.
 */
export function getBookmarksForList(listId: string) {
  return prisma.bookmark.findMany({
    where: { listId },
    orderBy: { createdAt: "desc" },
    include: {
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      _count: { select: { comments: true } },
    },
  });
}

/**
 * Bookmarks across all of the user's lists that carry ANY of the given tags
 * (OR match). Tags are user-scoped, so we match the user's own tags by name.
 */
export function getBookmarksByTags(userId: string, tagNames: string[]) {
  return prisma.bookmark.findMany({
    where: {
      list: { memberships: { some: { userId } } },
      tags: { some: { tag: { userId, name: { in: tagNames } } } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      // The list's own `lockedAt` too: a bookmark in a locked list is read-only
      // even when the bookmark itself was never stamped, and a cross-list result
      // has no other way to know that.
      list: { select: { id: true, name: true, icon: true, lockedAt: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      _count: { select: { comments: true } },
    },
  });
}

/**
 * Bookmarks across the user's lists that have stored coordinates (picked from
 * location autocomplete). Optionally restricted to `listIds`. Used by the nearby
 * finder to compute distances outside the DB. Same include shape as
 * getBookmarksByTags so results render with a list tag.
 */
export function getBookmarksWithCoords(userId: string, listIds?: string[]) {
  return prisma.bookmark.findMany({
    where: {
      list: { memberships: { some: { userId } } },
      latitude: { not: null },
      longitude: { not: null },
      ...(listIds?.length ? { listId: { in: listIds } } : {}),
    },
    include: {
      // `lockedAt` for the same reason as getBookmarksByTags above.
      list: { select: { id: true, name: true, icon: true, lockedAt: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      _count: { select: { comments: true } },
    },
  });
}

/**
 * Count of in-scope bookmarks that have a typed location but no coordinates —
 * i.e. ones the nearby finder can't place. Powers the "N skipped" note.
 */
export function countBookmarksMissingCoords(userId: string, listIds?: string[]) {
  return prisma.bookmark.count({
    where: {
      list: { memberships: { some: { userId } } },
      location: { not: "" },
      OR: [{ latitude: null }, { longitude: null }],
      ...(listIds?.length ? { listId: { in: listIds } } : {}),
    },
  });
}

/**
 * A bookmark plus the requesting user's effective role on its list, or null if
 * the bookmark doesn't exist or the user can't read the list. Public lists grant
 * a guest VIEWER role to non-members (read-only).
 */
export async function getBookmarkForUser(userId: string, bookmarkId: string) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    include: {
      // `lockedAt` on the parent list matters to the client as much as the
      // bookmark's own: `listIdOfWritableBookmark` refuses an edit when either is
      // locked, so a read-only UI can't be drawn from the bookmark's flag alone.
      list: { select: { id: true, name: true, icon: true, lockedAt: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!bookmark) return null;

  const access = await getViewerAccess(userId, bookmark.listId);
  if (!access) return null;

  return { bookmark, role: access.role, isMember: access.isMember };
}
