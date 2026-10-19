"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  isFreeLimitError,
  toFreeLimitResult,
  type CappedCreateResult,
} from "@/lib/core/entitlements";
import { setFlashToast } from "@/lib/toast-flash";
import * as core from "@/lib/core/lists";
import {
  duplicateList as duplicateListCore,
  clearListBookmarks as clearListBookmarksCore,
} from "@/lib/core/bookmarks";

function listInputFromFormData(formData: FormData): core.ListInput {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    icon: String(formData.get("icon") ?? ""),
    isPublic: formData.get("isPublic") === "on",
  };
}

/**
 * Returns a {@link CappedCreateResult}: `undefined` on success (the redirect
 * below takes over), or the structured refusal when the free list cap is hit,
 * so the caller can show the paywall instead of Next's generic error boundary.
 */
export async function createList(formData: FormData): Promise<CappedCreateResult> {
  const user = await requireUser();

  // Only the core call is guarded. `redirect()` signals by throwing
  // (NEXT_REDIRECT), so it stays outside the try where nothing can swallow it;
  // `unstable_rethrow` re-throws that signal anyway if a later edit ever moves a
  // redirect, notFound, or dynamic-rendering bailout inside.
  let list;
  try {
    list = await core.createList(user.id, listInputFromFormData(formData));
  } catch (e) {
    unstable_rethrow(e);
    if (isFreeLimitError(e)) return toFreeLimitResult(e);
    throw e;
  }

  revalidatePath("/");
  await setFlashToast("success", "List created");
  redirect(`/lists/${list.id}`);
}

export async function updateList(listId: string, formData: FormData) {
  const user = await requireUser();
  await core.updateList(user.id, listId, listInputFromFormData(formData));

  revalidatePath("/");
  revalidatePath(`/lists/${listId}`);
}

export async function setListVisibility(listId: string, isPublic: boolean) {
  const user = await requireUser();
  await core.setListVisibility(user.id, listId, isPublic);

  revalidatePath("/");
  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/users/${user.id}`);
}

export async function deleteList(listId: string) {
  const user = await requireUser();
  await core.deleteList(user.id, listId);

  revalidatePath("/");
  await setFlashToast("success", "List deleted");
  redirect("/");
}

export async function reorderLists(orderedListIds: string[]) {
  const user = await requireUser();
  await core.reorderLists(user.id, orderedListIds);

  revalidatePath("/");
}

/**
 * Returns a {@link CappedCreateResult}: `undefined` on success (the redirect
 * below takes over), or the structured refusal when a free cap is hit.
 *
 * Duplicating can trip *either* cap, since it creates one owned list plus a copy
 * of every bookmark in the source, so `core.duplicateList` calls both guards and
 * either `FreeLimitError` lands here. Same catch shape as `createList`: the
 * `redirect()` stays outside the try because it signals by throwing, and
 * `unstable_rethrow` re-throws any Next control-flow signal that a later edit
 * might move inside.
 */
export async function duplicateList(
  sourceListId: string,
  formData: FormData,
): Promise<CappedCreateResult> {
  const user = await requireUser();

  let list;
  try {
    list = await duplicateListCore(
      user.id,
      sourceListId,
      String(formData.get("name") ?? ""),
    );
  } catch (e) {
    unstable_rethrow(e);
    if (isFreeLimitError(e)) return toFreeLimitResult(e);
    throw e;
  }

  revalidatePath("/");
  await setFlashToast("success", "List duplicated");
  redirect(`/lists/${list.id}`);
}

export async function clearListBookmarks(listId: string) {
  const user = await requireUser();
  await clearListBookmarksCore(user.id, listId);

  revalidatePath("/");
  revalidatePath(`/lists/${listId}`);
}
