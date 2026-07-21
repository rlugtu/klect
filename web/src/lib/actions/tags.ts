"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { removeTagFromList } from "@/lib/core/tags";

/** Remove a tag from every bookmark in a list (list-scoped) — COLLABORATOR+. */
export async function removeListTag(listId: string, name: string) {
  const user = await requireUser();
  await removeTagFromList(user.id, listId, name);
  revalidatePath(`/lists/${listId}`);
}
