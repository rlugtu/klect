import "server-only";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/permissions";

/** Bookmarks in a list, newest first, with their tags + comment counts. */
export function getBookmarksForList(listId: string) {
  return prisma.bookmark.findMany({
    where: { listId },
    orderBy: { createdAt: "desc" },
    include: {
      tags: { include: { tag: { select: { id: true, name: true } } } },
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
      list: { select: { id: true, name: true, icon: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
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
      list: { select: { id: true, name: true, icon: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
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
 * A bookmark plus the requesting user's role on its list, or null if the
 * bookmark doesn't exist or the user isn't a member of its list.
 */
export async function getBookmarkForUser(userId: string, bookmarkId: string) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    include: {
      list: { select: { id: true, name: true, icon: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
    },
  });
  if (!bookmark) return null;

  const membership = await getMembership(userId, bookmark.listId);
  if (!membership) return null;

  return { bookmark, role: membership.role };
}
