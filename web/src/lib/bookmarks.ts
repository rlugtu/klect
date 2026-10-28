import "server-only";
import { prisma } from "@/lib/db";
import { getViewerAccess } from "@/lib/permissions";
import type { BookmarkCardData } from "@/lib/types";

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

/** Sort orders offered by the All bookmarks page. */
export const BOOKMARK_SORTS = ["recent", "oldest", "rating", "name"] as const;
export type BookmarkSort = (typeof BOOKMARK_SORTS)[number];

export type VisibleBookmarkFilters = {
  /** Free-text match on name, description, or location (case-insensitive). */
  query?: string;
  /** The user's own tag names, OR match (same rule as getBookmarksByTags). */
  tagNames?: string[];
  /** Restrict to one list. Still gated on membership, so a foreign id matches nothing. */
  listId?: string;
  sort?: BookmarkSort;
};

/**
 * The shared where-clause for the cross-list bookmark reads below.
 *
 * Visibility is membership: every bookmark in a list the user belongs to (owner,
 * collaborator, or viewer), exactly the set getBookmarksByTags and the list pages
 * already show. Public lists the user has not joined are not included; they are
 * browsed from the owner's profile, not collected here.
 *
 * Blocks: bookmarks carry no author column, so there is no per-author content to
 * hide. A block filters authored content (comments, chat, DMs) on the existing
 * read paths and that stays as is; a bookmark is visible to every member of its
 * list, the same as on the list page itself.
 *
 * Locked rows are included, never filtered: locked means read-only, not hidden.
 */
function visibleBookmarksWhere(userId: string, filters: VisibleBookmarkFilters) {
  const query = filters.query?.trim();
  const tagNames = filters.tagNames ?? [];
  return {
    list: { memberships: { some: { userId } } },
    ...(filters.listId ? { listId: filters.listId } : {}),
    ...(tagNames.length > 0
      ? { tags: { some: { tag: { userId, name: { in: tagNames } } } } }
      : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { location: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

function visibleBookmarksOrder(sort: BookmarkSort = "recent") {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" as const }];
    case "rating":
      return [{ rating: "desc" as const }, { createdAt: "desc" as const }];
    case "name":
      return [{ name: "asc" as const }, { createdAt: "desc" as const }];
    default:
      return [{ createdAt: "desc" as const }];
  }
}

/**
 * Bookmarks across every list the user can see (see visibleBookmarksWhere), with
 * the same include shape as getBookmarksByTags so results render through
 * BookmarkCard with an "in <list>" label. Powers the All bookmarks page and the
 * desktop home's Recently saved row.
 *
 * The list's own `lockedAt` rides along for the reason given on
 * getBookmarksByTags: a bookmark in a locked list is read-only even when the
 * bookmark itself was never stamped.
 */
export function getVisibleBookmarks(
  userId: string,
  filters: VisibleBookmarkFilters = {},
  take = 60,
) {
  return prisma.bookmark.findMany({
    where: visibleBookmarksWhere(userId, filters),
    orderBy: visibleBookmarksOrder(filters.sort),
    take,
    include: {
      list: { select: { id: true, name: true, icon: true, lockedAt: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      _count: { select: { comments: true } },
    },
  });
}

/**
 * A keyset-paginated page of the user's cross-list bookmarks, newest first: the
 * infinite-scroll counterpart to getVisibleBookmarks's limit-based "Show more", for mobile's
 * Home strip + Recent bookmarks page. Cursor pagination mirrors getMessages in lib/dms.ts:
 * cursor is the last row's id, tie-broken on id so pages stay stable when createdAt collides.
 */
export async function getRecentBookmarksPage(
  userId: string,
  cursor?: string,
  limit: number = 20,
) {
  const rows = await prisma.bookmark.findMany({
    where: visibleBookmarksWhere(userId, {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      list: { select: { id: true, name: true, icon: true, lockedAt: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      _count: { select: { comments: true } },
    },
  });
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    nextCursor = rows[limit - 1].id;
    rows.length = limit;
  }
  return { items: rows, nextCursor };
}

/** How many bookmarks match the same filters, for "showing N of M". */
export function countVisibleBookmarks(
  userId: string,
  filters: VisibleBookmarkFilters = {},
) {
  return prisma.bookmark.count({ where: visibleBookmarksWhere(userId, filters) });
}

export type VisibleBookmark = Awaited<ReturnType<typeof getVisibleBookmarks>>[number];

/**
 * A cross-list bookmark row as card data. Read-only if the bookmark is locked or
 * its list is; a cross-list result has to check both (same rule as the home tag
 * results).
 */
export function toBookmarkCardData(b: VisibleBookmark): BookmarkCardData {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    image: b.images[0] ?? null,
    images: b.images.slice(0, 4),
    rating: b.rating,
    visited: b.visited,
    tags: b.tags.map((bt) => bt.tag),
    commentCount: b._count.comments,
    url: b.urls[0] ?? null,
    locked: b.lockedAt !== null || b.list.lockedAt !== null,
  };
}
