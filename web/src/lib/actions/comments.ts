"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertRole, getMembership } from "@/lib/permissions";

function parseValue(formData: FormData): string {
  const value = String(formData.get("value") ?? "").trim();
  if (!value) throw new Error("Comment can't be empty.");
  return value;
}

/** Any member (viewer+) can comment on a list. */
export async function addListComment(listId: string, formData: FormData) {
  const user = await requireUser();
  await assertRole(user.id, listId, "VIEWER");

  await prisma.comment.create({
    data: { listId, authorId: user.id, value: parseValue(formData) },
  });
  revalidatePath(`/lists/${listId}`);
}

/** Any member (viewer+) can comment on a bookmark. */
export async function addBookmarkComment(
  bookmarkId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  await assertRole(user.id, bookmark.listId, "VIEWER");

  await prisma.comment.create({
    data: { bookmarkId, authorId: user.id, value: parseValue(formData) },
  });
  revalidatePath(`/lists/${bookmark.listId}/bookmarks/${bookmarkId}`);
}

/** Delete a comment: the author, or the owner of the list it belongs to. */
export async function deleteComment(commentId: string) {
  const user = await requireUser();
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      listId: true,
      bookmarkId: true,
      bookmark: { select: { listId: true } },
    },
  });
  if (!comment) return;

  const listId = comment.listId ?? comment.bookmark?.listId;
  if (!listId) return;

  const membership = await getMembership(user.id, listId);
  if (!membership) throw new Error("You don't have access to that comment.");

  const isAuthor = comment.authorId === user.id;
  const isOwner = membership.role === "OWNER";
  if (!isAuthor && !isOwner) {
    throw new Error("You can't delete that comment.");
  }

  await prisma.comment.delete({ where: { id: commentId } });

  if (comment.bookmarkId) {
    revalidatePath(`/lists/${listId}/bookmarks/${comment.bookmarkId}`);
  }
  revalidatePath(`/lists/${listId}`);
}
