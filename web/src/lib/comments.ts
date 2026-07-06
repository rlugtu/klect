import "server-only";
import { prisma } from "@/lib/db";

const authorSelect = {
  author: {
    select: { id: true, displayName: true, name: true, icon: true },
  },
} as const;

/** Comments on a list, newest first. */
export function getListComments(listId: string) {
  return prisma.comment.findMany({
    where: { listId },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}

/** Comments on a bookmark, newest first. */
export function getBookmarkComments(bookmarkId: string) {
  return prisma.comment.findMany({
    where: { bookmarkId },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}
