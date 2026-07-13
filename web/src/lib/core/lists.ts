import "server-only";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";

/**
 * Transport-agnostic list mutations. Each takes the acting `userId` plus already-
 * extracted input and does validation → `assertRole` → Prisma write, returning the
 * result. No FormData, no `revalidatePath`/`redirect`, no session lookup — those
 * belong to the caller (a web server action or a tRPC procedure), so both surfaces
 * share exactly this logic.
 */

export const LIST_NAME_MAX = 30;

export type ListInput = {
  name: string;
  description?: string;
  icon?: string;
  isPublic?: boolean;
};

/** Trim/clamp/validate raw list fields into what Prisma stores. */
export function normalizeListInput(input: ListInput) {
  const name = (input.name ?? "").trim().slice(0, LIST_NAME_MAX);
  if (!name) throw new Error("List name is required.");
  return {
    name,
    description: (input.description ?? "").trim(),
    icon: (input.icon ?? "").trim() || "📁",
    isPublic: input.isPublic ?? false,
  };
}

/** Create a list owned by the user; owner gets an OWNER membership. */
export function createList(userId: string, input: ListInput) {
  return createListRecord(userId, normalizeListInput(input));
}

/** Toggle a list's public/private visibility — owner only. */
export async function setListVisibility(
  userId: string,
  listId: string,
  isPublic: boolean,
) {
  await assertRole(userId, listId, "OWNER");
  await prisma.list.update({ where: { id: listId }, data: { isPublic } });
}

/**
 * Edit list metadata — requires COLLABORATOR or higher. Visibility is NOT edited
 * here (it's an owner-only decision via {@link setListVisibility}), so `isPublic`
 * in the input is ignored.
 */
export async function updateList(userId: string, listId: string, input: ListInput) {
  await assertRole(userId, listId, "COLLABORATOR");
  const { name, description, icon } = normalizeListInput(input);
  await prisma.list.update({
    where: { id: listId },
    data: { name, description, icon },
  });
}

/** Delete a list (cascades) — owner only. */
export async function deleteList(userId: string, listId: string) {
  await assertRole(userId, listId, "OWNER");
  await prisma.list.delete({ where: { id: listId } });
}

/** Persist the user's personal list order (from drag-reorder). */
export async function reorderLists(userId: string, orderedListIds: string[]) {
  await prisma.$transaction(
    orderedListIds.map((listId, index) =>
      prisma.listMembership.updateMany({
        where: { listId, userId },
        data: { position: index },
      }),
    ),
  );
}
