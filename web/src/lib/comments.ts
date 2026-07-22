import "server-only";
import { prisma } from "@/lib/db";
import { getBlockedUserIds } from "@/lib/blocks";

const authorSelect = {
  author: {
    select: { id: true, handle: true, icon: true },
  },
} as const;

/** Comments on a list, newest first — hiding any authored by a user `viewerId` has blocked
 *  or been blocked by. */
export async function getListComments(listId: string, viewerId: string) {
  const blocked = await getBlockedUserIds(viewerId);
  return prisma.comment.findMany({
    where: { listId, authorId: { notIn: blocked } },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}

/** Comments on a bookmark, newest first — with the same block filtering. */
export async function getBookmarkComments(bookmarkId: string, viewerId: string) {
  const blocked = await getBlockedUserIds(viewerId);
  return prisma.comment.findMany({
    where: { bookmarkId, authorId: { notIn: blocked } },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}
