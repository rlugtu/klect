import "server-only";
import { prisma } from "@/lib/db";
import { assertRole, getMembership } from "@/lib/permissions";
import { sendPushToListMembers } from "@/lib/core/push";

function normalizeValue(value: string): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error("Comment can't be empty.");
  return v;
}

/** Notify the rest of a list's members that `authorId` left a comment. */
async function notifyComment(
  authorId: string,
  listId: string,
  value: string,
  route: string,
) {
  const [author, list] = await Promise.all([
    prisma.user.findUnique({
      where: { id: authorId },
      select: { handle: true },
    }),
    prisma.list.findUnique({ where: { id: listId }, select: { name: true } }),
  ]);
  await sendPushToListMembers(listId, authorId, "comments", {
    title: `New comment in ${list?.name ?? "a list"}`,
    body: `@${author?.handle ?? "Someone"}: ${value}`,
    data: { route },
  });
}

/** Any member (viewer+) can comment on a list. */
export async function addListComment(userId: string, listId: string, value: string) {
  await assertRole(userId, listId, "VIEWER");
  const clean = normalizeValue(value);
  await prisma.comment.create({
    data: { listId, authorId: userId, value: clean },
  });
  await notifyComment(userId, listId, clean, `/lists/${listId}`);
}

/** Any member (viewer+) can comment on a bookmark. Returns the bookmark's list. */
export async function addBookmarkComment(userId: string, bookmarkId: string, value: string) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  await assertRole(userId, bookmark.listId, "VIEWER");

  const clean = normalizeValue(value);
  await prisma.comment.create({
    data: { bookmarkId, authorId: userId, value: clean },
  });
  await notifyComment(userId, bookmark.listId, clean, `/bookmarks/${bookmarkId}`);
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
