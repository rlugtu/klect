import "server-only";
import { prisma } from "@/lib/db";
import { assertRole, getMembership } from "@/lib/permissions";

function normalizeValue(value: string): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error("Comment can't be empty.");
  return v;
}

/** Any member (viewer+) can comment on a list. */
export async function addListComment(userId: string, listId: string, value: string) {
  await assertRole(userId, listId, "VIEWER");
  await prisma.comment.create({
    data: { listId, authorId: userId, value: normalizeValue(value) },
  });
}

/** Any member (viewer+) can comment on a bookmark. Returns the bookmark's list. */
export async function addBookmarkComment(userId: string, bookmarkId: string, value: string) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  await assertRole(userId, bookmark.listId, "VIEWER");

  await prisma.comment.create({
    data: { bookmarkId, authorId: userId, value: normalizeValue(value) },
  });
  return { listId: bookmark.listId };
}

/**
 * Delete a comment: the author, or the owner of the list it belongs to. Returns
 * the affected `{ listId, bookmarkId }` (bookmarkId null for list comments), or
 * null when there's nothing to delete.
 */
export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      listId: true,
      bookmarkId: true,
      bookmark: { select: { listId: true } },
    },
  });
  if (!comment) return null;

  const listId = comment.listId ?? comment.bookmark?.listId;
  if (!listId) return null;

  const membership = await getMembership(userId, listId);
  if (!membership) throw new Error("You don't have access to that comment.");

  const isAuthor = comment.authorId === userId;
  const isOwner = membership.role === "OWNER";
  if (!isAuthor && !isOwner) {
    throw new Error("You can't delete that comment.");
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return { listId, bookmarkId: comment.bookmarkId };
}
