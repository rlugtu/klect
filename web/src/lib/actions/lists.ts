"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";

const NAME_MAX = 30;

function parseListInput(formData: FormData) {
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX);
  if (!name) throw new Error("List name is required.");
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim() || "📁";
  return { name, description, icon };
}

/** Create a list owned by the current user; owner gets an OWNER membership. */
export async function createList(formData: FormData) {
  const user = await requireUser();
  const list = await createListRecord(user.id, parseListInput(formData));

  revalidatePath("/");
  redirect(`/lists/${list.id}`);
}

/** Edit list metadata — requires COLLABORATOR or higher. */
export async function updateList(listId: string, formData: FormData) {
  const user = await requireUser();
  await assertRole(user.id, listId, "COLLABORATOR");
  const data = parseListInput(formData);

  await prisma.list.update({ where: { id: listId }, data });

  revalidatePath("/");
  revalidatePath(`/lists/${listId}`);
}

/** Delete a list (cascades) — owner only. */
export async function deleteList(listId: string) {
  const user = await requireUser();
  await assertRole(user.id, listId, "OWNER");

  await prisma.list.delete({ where: { id: listId } });

  revalidatePath("/");
  redirect("/");
}

/** Persist the current user's personal list order (from drag-reorder). */
export async function reorderLists(orderedListIds: string[]) {
  const user = await requireUser();

  await prisma.$transaction(
    orderedListIds.map((listId, index) =>
      prisma.listMembership.updateMany({
        where: { listId, userId: user.id },
        data: { position: index },
      }),
    ),
  );

  revalidatePath("/");
}
