"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/comments";

function valueFromFormData(formData: FormData): string {
  return String(formData.get("value") ?? "");
}

export async function addListComment(listId: string, formData: FormData) {
  const user = await requireUser();
  await core.addListComment(user.id, listId, valueFromFormData(formData));
  revalidatePath(`/lists/${listId}`);
}

export async function addBookmarkComment(bookmarkId: string, formData: FormData) {
  const user = await requireUser();
  const { listId } = await core.addBookmarkComment(
    user.id,
    bookmarkId,
    valueFromFormData(formData),
  );
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

export async function deleteComment(commentId: string) {
  const user = await requireUser();
  const result = await core.deleteComment(user.id, commentId);
  if (!result) return;

  if (result.bookmarkId) {
    revalidatePath(`/lists/${result.listId}/bookmarks/${result.bookmarkId}`);
  }
  revalidatePath(`/lists/${result.listId}`);
}
