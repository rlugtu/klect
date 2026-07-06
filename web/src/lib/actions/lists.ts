"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/lists";

function listInputFromFormData(formData: FormData): core.ListInput {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    icon: String(formData.get("icon") ?? ""),
  };
}

export async function createList(formData: FormData) {
  const user = await requireUser();
  const list = await core.createList(user.id, listInputFromFormData(formData));

  revalidatePath("/");
  redirect(`/lists/${list.id}`);
}

export async function updateList(listId: string, formData: FormData) {
  const user = await requireUser();
  await core.updateList(user.id, listId, listInputFromFormData(formData));

  revalidatePath("/");
  revalidatePath(`/lists/${listId}`);
}

export async function deleteList(listId: string) {
  const user = await requireUser();
  await core.deleteList(user.id, listId);

  revalidatePath("/");
  redirect("/");
}

export async function reorderLists(orderedListIds: string[]) {
  const user = await requireUser();
  await core.reorderLists(user.id, orderedListIds);

  revalidatePath("/");
}
