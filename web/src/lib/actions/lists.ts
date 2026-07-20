"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
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

export async function createList(formData: FormData) {
  const user = await requireUser();
  const list = await core.createList(user.id, listInputFromFormData(formData));

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

export async function duplicateList(sourceListId: string, formData: FormData) {
  const user = await requireUser();
  const list = await duplicateListCore(
    user.id,
    sourceListId,
    String(formData.get("name") ?? ""),
  );

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
